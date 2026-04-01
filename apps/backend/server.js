const crypto = require('node:crypto')
const express = require('express')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const YAML = require('yaml')

const app = express()
const port = Number(process.env.PORT || 8080)
const projectRoot = path.resolve(__dirname, '..', '..')
const clustersFile = path.join(projectRoot, 'clusters', 'managed-clusters.yml')
const runtimeStateFile = path.join(projectRoot, 'data', 'runtime-state.json')
const registryUrl = process.env.REGISTRY_URL || 'docker.io'
const registryNamespace = process.env.REGISTRY_NAMESPACE || 'your-dockerhub-namespace'
const executionMode = process.env.DEVOPS_EXECUTION_MODE || 'simulate'

app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))

function isoNow() {
  return new Date().toISOString()
}

function buildTaskId() {
  return `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function buildRecordId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function trimText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function parseBoolean(value) {
  return value === true || value === 'true' || value === 'on' || value === '1'
}

function parseList(value) {
  return String(value || '')
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function sortByUpdatedAt(items) {
  return [...items].sort((left, right) => {
    const leftValue = left.updatedAt || left.createdAt || ''
    const rightValue = right.updatedAt || right.createdAt || ''
    return rightValue.localeCompare(leftValue)
  })
}

function buildImages(appName, imageTag) {
  return {
    frontendImage: `${registryUrl}/${registryNamespace}/${appName}-frontend:${imageTag}`,
    backendImage: `${registryUrl}/${registryNamespace}/${appName}-backend:${imageTag}`
  }
}

function buildTask(type, summary) {
  return {
    id: buildTaskId(),
    type,
    status: 'running',
    summary,
    logs: [],
    createdAt: isoNow(),
    finishedAt: null
  }
}

function upsertTask(state, task) {
  const others = state.tasks.filter(item => item.id !== task.id)
  state.tasks = [task, ...others].slice(0, 60)
}

function releaseKey(clusterName, namespace, appName) {
  return `${clusterName}::${namespace}::${appName}`
}

function maskSecret(value, visible = 4) {
  const text = trimText(value)
  if (!text) return ''
  if (text.length <= visible) return '*'.repeat(text.length)
  return `${'*'.repeat(Math.max(4, text.length - visible))}${text.slice(-visible)}`
}

function fingerprintSecret(value) {
  const text = trimText(value)
  if (!text) return ''
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function normalizeCluster(input, source) {
  return {
    name: input.name,
    provider: input.provider || 'custom',
    region: input.region || 'unknown',
    environment: input.environment || 'staging',
    kubeContext: input.kube_context || input.kubeContext || input.name,
    releaseNamespace: input.release_namespace || input.releaseNamespace || 'staging',
    ingressDomainSuffix: input.ingress_domain_suffix || input.ingressDomainSuffix || 'apps.local',
    notes: input.notes || '',
    source
  }
}

async function ensureRuntimeState() {
  try {
    await fs.access(runtimeStateFile)
  } catch {
    await fs.mkdir(path.dirname(runtimeStateFile), { recursive: true })
    await fs.writeFile(
      runtimeStateFile,
      JSON.stringify({
        managedClusters: [],
        stackReleases: [],
        tasks: [],
        clusterProvisions: [],
        codeSourceBindings: [],
        podActionRecords: []
      }, null, 2)
    )
  }
}

async function loadRuntimeState() {
  await ensureRuntimeState()
  const text = await fs.readFile(runtimeStateFile, 'utf8')
  const parsed = JSON.parse(text)

  return {
    managedClusters: Array.isArray(parsed.managedClusters) ? parsed.managedClusters : [],
    stackReleases: Array.isArray(parsed.stackReleases) ? parsed.stackReleases : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    clusterProvisions: Array.isArray(parsed.clusterProvisions) ? parsed.clusterProvisions : [],
    codeSourceBindings: Array.isArray(parsed.codeSourceBindings) ? parsed.codeSourceBindings : [],
    podActionRecords: Array.isArray(parsed.podActionRecords) ? parsed.podActionRecords : []
  }
}

async function saveRuntimeState(state) {
  await fs.mkdir(path.dirname(runtimeStateFile), { recursive: true })
  const tempFile = `${runtimeStateFile}.tmp`
  await fs.writeFile(tempFile, JSON.stringify(state, null, 2))
  await fs.rename(tempFile, runtimeStateFile)
}

async function loadManagedClusters() {
  const registryText = await fs.readFile(clustersFile, 'utf8')
  const parsed = YAML.parse(registryText) || {}
  const registryClusters = Array.isArray(parsed.managed_clusters) ? parsed.managed_clusters : []
  const runtimeState = await loadRuntimeState()
  const merged = new Map()

  for (const cluster of registryClusters) {
    const normalized = normalizeCluster(cluster, 'registry')
    merged.set(normalized.name, normalized)
  }

  for (const cluster of runtimeState.managedClusters) {
    const normalized = normalizeCluster(cluster, 'web')
    merged.set(normalized.name, normalized)
  }

  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name))
}

function normalizeReleaseRequest(body) {
  const action = trimText(body.action)
  const appName = trimText(body.appName)
  const targetCluster = trimText(body.targetCluster)
  const targetNamespace = trimText(body.targetNamespace)
  const imageTag = trimText(body.imageTag, 'latest')
  const frontendReplicas = String(body.frontendReplicas || '2')
  const backendReplicas = String(body.backendReplicas || '2')

  if (!['deploy', 'update', 'delete', 'rollback'].includes(action)) {
    throw new Error('action must be one of deploy, update, delete, or rollback')
  }

  if (!appName) {
    throw new Error('appName is required')
  }

  if (!targetCluster) {
    throw new Error('targetCluster is required')
  }

  return {
    action,
    appName,
    targetCluster,
    targetNamespace,
    imageTag,
    frontendReplicas,
    backendReplicas
  }
}

function normalizeOnboardRequest(body) {
  const cluster = {
    name: trimText(body.name),
    provider: trimText(body.provider, 'custom'),
    region: trimText(body.region, 'unknown'),
    environment: trimText(body.environment, 'staging'),
    kubeContext: trimText(body.kubeContext),
    releaseNamespace: trimText(body.releaseNamespace, 'staging'),
    ingressDomainSuffix: trimText(body.ingressDomainSuffix, 'apps.local'),
    notes: trimText(body.notes)
  }

  if (!cluster.name) {
    throw new Error('name is required')
  }

  if (!cluster.kubeContext) {
    throw new Error('kubeContext is required')
  }

  return cluster
}

function normalizeClusterProvisionRequest(body) {
  const name = trimText(body.name)
  const controlPlaneIp = trimText(body.controlPlaneIp)
  const workerNodeIps = parseList(body.workerNodeIps)
  const sshPrivateKey = trimText(body.sshPrivateKey)

  if (!name) {
    throw new Error('name is required')
  }

  if (!controlPlaneIp) {
    throw new Error('controlPlaneIp is required')
  }

  if (!workerNodeIps.length) {
    throw new Error('workerNodeIps requires at least one worker node IP')
  }

  if (!sshPrivateKey) {
    throw new Error('sshPrivateKey is required')
  }

  return {
    id: buildRecordId('plan'),
    name,
    mode: trimText(body.mode, 'kubeadm'),
    controlPlaneIp,
    workerNodeIps,
    sshUser: trimText(body.sshUser, 'ubuntu'),
    sshPort: trimText(body.sshPort, '22'),
    sshKeyFingerprint: fingerprintSecret(sshPrivateKey),
    sshKeyProvided: true,
    podCidr: trimText(body.podCidr, '192.168.0.0/16'),
    kubernetesVersion: trimText(body.kubernetesVersion, '1.29.6'),
    installJenkins: parseBoolean(body.installJenkins),
    notes: trimText(body.notes),
    status: executionMode === 'simulate' ? 'planned' : 'submitted',
    playbook: 'ansible/playbooks/01-setup-cluster.yml',
    followUpPlaybooks: parseBoolean(body.installJenkins)
      ? ['ansible/playbooks/02-deploy-jenkins.yml', 'ansible/playbooks/03-integrate-jenkins-k8s.yml']
      : [],
    updatedAt: isoNow()
  }
}

function normalizeCodeSourceBindingRequest(body) {
  const bindingName = trimText(body.bindingName)
  const repoUrl = trimText(body.repoUrl)
  const credentialId = trimText(body.credentialId)

  if (!bindingName) {
    throw new Error('bindingName is required')
  }

  if (!repoUrl) {
    throw new Error('repoUrl is required')
  }

  if (!credentialId) {
    throw new Error('credentialId is required')
  }

  const pipelineKind = trimText(body.pipelineKind, 'full-stack')

  return {
    id: buildRecordId('source'),
    bindingName,
    provider: trimText(body.provider, 'gitlab'),
    repoUrl,
    namespaceGroup: trimText(body.namespaceGroup),
    projectName: trimText(body.projectName, bindingName),
    defaultBranch: trimText(body.defaultBranch, 'main'),
    authMode: trimText(body.authMode, 'token'),
    credentialId,
    webhookSecretMasked: maskSecret(body.webhookSecret),
    registryUrl: trimText(body.registryUrl, registryUrl),
    registryNamespace: trimText(body.registryNamespace, registryNamespace),
    pipelineKind,
    jenkinsfilePath: trimText(
      body.jenkinsfilePath,
      pipelineKind === 'deploy-only' ? 'jenkins/Jenkinsfile.deploy' : 'jenkins/Jenkinsfile'
    ),
    autoTrigger: parseBoolean(body.autoTrigger),
    notes: trimText(body.notes),
    status: executionMode === 'simulate' ? 'bound' : 'connected',
    updatedAt: isoNow()
  }
}

function normalizePodDeleteRequest(body) {
  const releaseKey = trimText(body.releaseKey)
  const appName = trimText(body.appName)
  const targetCluster = trimText(body.targetCluster)
  const targetNamespace = trimText(body.targetNamespace)
  const podName = trimText(body.podName)

  if (!releaseKey) {
    throw new Error('releaseKey is required')
  }

  if (!appName) {
    throw new Error('appName is required')
  }

  if (!targetCluster) {
    throw new Error('targetCluster is required')
  }

  if (!targetNamespace) {
    throw new Error('targetNamespace is required')
  }

  if (!podName) {
    throw new Error('podName is required')
  }

  return {
    id: buildRecordId('pod-action'),
    action: 'delete',
    releaseKey,
    appName,
    targetCluster,
    targetNamespace,
    podName,
    component: trimText(body.component, 'unknown'),
    templateId: trimText(body.templateId),
    templateName: trimText(body.templateName),
    status: executionMode === 'simulate' ? 'deleted' : 'submitted',
    updatedAt: isoNow()
  }
}

function sortedReleases(state) {
  return [...state.stackReleases].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function sortedTasks(state) {
  return [...state.tasks].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function summarize(state, clusters) {
  const releases = sortedReleases(state)
  const tasks = sortedTasks(state)

  return {
    summary: {
      clusterCount: clusters.length,
      runtimeClusterCount: state.managedClusters.length,
      releaseCount: releases.length,
      taskCount: tasks.length,
      clusterProvisionCount: state.clusterProvisions.length,
      codeSourceCount: state.codeSourceBindings.length,
      podActionCount: state.podActionRecords.length,
      executionMode,
      backendHost: os.hostname(),
      timestamp: isoNow()
    },
    clusters,
    releases,
    tasks
  }
}

function summarizeWorkbench(state, clusters) {
  return {
    ...summarize(state, clusters),
    clusterProvisions: sortByUpdatedAt(state.clusterProvisions),
    codeSourceBindings: sortByUpdatedAt(state.codeSourceBindings),
    podActionRecords: sortByUpdatedAt(state.podActionRecords)
  }
}

function simulateReleaseExecution(request, cluster) {
  const targetNamespace = request.targetNamespace || cluster.releaseNamespace
  const ingressHost = `${request.appName}.${cluster.ingressDomainSuffix}`
  const logs = [
    `[simulate] target cluster: ${cluster.name}`,
    `[simulate] target namespace: ${targetNamespace}`,
    `[simulate] action: ${request.action}`,
    '[simulate] rendered frontend and backend manifests',
    `[simulate] prepared ingress host ${ingressHost}`
  ]

  if (request.action === 'deploy') {
    logs.push('[simulate] would apply frontend deployment/service and backend deployment/service')
  }

  if (request.action === 'update') {
    logs.push('[simulate] would update both images and restart both deployments')
  }

  if (request.action === 'delete') {
    logs.push('[simulate] would remove ingress, services, and deployments')
  }

  if (request.action === 'rollback') {
    logs.push('[simulate] would roll back frontend and backend to the previous release')
  }

  return {
    mode: executionMode,
    ingressHost,
    targetNamespace,
    logs
  }
}

function applyReleaseMutation(state, request, cluster, executionResult) {
  const targetNamespace = executionResult.targetNamespace
  const key = releaseKey(cluster.name, targetNamespace, request.appName)
  const currentIndex = state.stackReleases.findIndex(item => item.key === key)
  const current = currentIndex >= 0 ? state.stackReleases[currentIndex] : null
  const snapshot = current ? clone(current) : null
  const images = buildImages(request.appName, request.imageTag)
  const ingressHost = executionResult.ingressHost

  if (request.action === 'delete') {
    state.stackReleases = state.stackReleases.filter(item => item.key !== key)
    state.podActionRecords = state.podActionRecords.filter(item => item.releaseKey !== key)
    return {
      key,
      appName: request.appName,
      targetCluster: cluster.name,
      targetNamespace,
      status: 'deleted',
      updatedAt: isoNow(),
      ingressHost,
      lastAction: 'delete'
    }
  }

  if (request.action === 'rollback') {
    if (!current || !current.previousRelease) {
      throw new Error('no previous release is available for rollback')
    }

    const restored = {
      ...current.previousRelease,
      key,
      lastAction: 'rollback',
      status: 'rolled_back',
      updatedAt: isoNow(),
      previousRelease: snapshot ? { ...snapshot, previousRelease: null } : null,
      executionMode
    }

    state.stackReleases[currentIndex] = restored
    state.podActionRecords = state.podActionRecords.filter(item => item.releaseKey !== key)
    return restored
  }

  const nextRecord = {
    key,
    appName: request.appName,
    targetCluster: cluster.name,
    provider: cluster.provider,
    region: cluster.region,
    environment: cluster.environment,
    targetNamespace,
    kubeContext: cluster.kubeContext,
    ingressHost,
    imageTag: request.imageTag,
    frontendImage: images.frontendImage,
    backendImage: images.backendImage,
    frontendReplicas: request.frontendReplicas,
    backendReplicas: request.backendReplicas,
    executionMode,
    updatedAt: isoNow(),
    lastAction: request.action,
    status: request.action === 'deploy' ? 'deployed' : 'updated',
    previousRelease: snapshot
  }

  state.podActionRecords = state.podActionRecords.filter(item => item.releaseKey !== key)

  if (currentIndex >= 0) {
    state.stackReleases[currentIndex] = nextRecord
  } else {
    state.stackReleases.push(nextRecord)
  }

  return nextRecord
}

app.get('/api/health', async (_req, res, next) => {
  try {
    const clusters = await loadManagedClusters()
    const state = await loadRuntimeState()

    res.json({
      status: 'ok',
      service: 'devops-homework-control-api',
      executionMode,
      clusters: clusters.length,
      releases: state.stackReleases.length,
      timestamp: isoNow()
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/info', async (_req, res, next) => {
  try {
    const clusters = await loadManagedClusters()
    const state = await loadRuntimeState()

    res.json({
      appName: 'devops-homework-control-plane',
      version: 'web-console-v2',
      clusterName: os.hostname(),
      environment: executionMode,
      hostname: os.hostname(),
      runtime: 'nodejs',
      managedClusters: clusters.length,
      releases: state.stackReleases.length,
      timestamp: isoNow()
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/greeting', (_req, res) => {
  res.json({
    title: 'Web control plane online',
    message: 'Infrastructure planning, code-source binding, cluster onboarding, and release actions are now available from the browser.'
  })
})

app.get('/api/dashboard', async (_req, res, next) => {
  try {
    const clusters = await loadManagedClusters()
    const state = await loadRuntimeState()
    res.json(summarize(state, clusters))
  } catch (error) {
    next(error)
  }
})

app.get('/api/workbench', async (_req, res, next) => {
  try {
    const clusters = await loadManagedClusters()
    const state = await loadRuntimeState()
    res.json(summarizeWorkbench(state, clusters))
  } catch (error) {
    next(error)
  }
})

app.get('/api/clusters', async (_req, res, next) => {
  try {
    const clusters = await loadManagedClusters()
    res.json({ clusters })
  } catch (error) {
    next(error)
  }
})

app.post('/api/clusters/onboard', async (req, res, next) => {
  try {
    const payload = normalizeOnboardRequest(req.body)
    const state = await loadRuntimeState()
    const task = buildTask('cluster-onboard', `Onboard cluster ${payload.name}`)
    task.logs.push(`[web] onboarding cluster ${payload.name}`)

    state.managedClusters = [
      normalizeCluster(payload, 'web'),
      ...state.managedClusters.filter(item => item.name !== payload.name)
    ]

    task.status = 'completed'
    task.finishedAt = isoNow()
    task.logs.push(`[web] cluster ${payload.name} is now available to the control plane`)
    upsertTask(state, task)
    await saveRuntimeState(state)

    const clusters = await loadManagedClusters()
    res.status(201).json({
      message: `Cluster ${payload.name} onboarded successfully.`,
      workbench: summarizeWorkbench(state, clusters)
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/infrastructure/clusters', async (_req, res, next) => {
  try {
    const state = await loadRuntimeState()
    res.json({ clusterProvisions: sortByUpdatedAt(state.clusterProvisions) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/infrastructure/clusters', async (req, res, next) => {
  try {
    const provision = normalizeClusterProvisionRequest(req.body)
    const state = await loadRuntimeState()
    const task = buildTask('cluster-provision-plan', `Plan cluster deployment ${provision.name}`)
    task.logs.push(`[web] received cluster deployment plan for ${provision.name}`)
    task.logs.push(`[simulate] control-plane node: ${provision.controlPlaneIp}`)
    task.logs.push(`[simulate] worker nodes: ${provision.workerNodeIps.join(', ')}`)
    task.logs.push(`[simulate] would render dynamic inventory and group_vars for ${provision.name}`)
    task.logs.push(`[simulate] would run ${provision.playbook}`)

    if (provision.installJenkins) {
      task.logs.push('[simulate] would continue with Jenkins install and RBAC integration playbooks')
    }

    state.clusterProvisions = [
      provision,
      ...state.clusterProvisions.filter(item => item.name !== provision.name)
    ]

    task.status = 'completed'
    task.finishedAt = isoNow()
    task.logs.push('[web] cluster deployment plan saved without persisting the raw SSH private key')
    upsertTask(state, task)
    await saveRuntimeState(state)

    const clusters = await loadManagedClusters()
    res.status(201).json({
      message: `Cluster deployment plan ${provision.name} saved successfully.`,
      workbench: summarizeWorkbench(state, clusters)
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/ci/code-sources', async (_req, res, next) => {
  try {
    const state = await loadRuntimeState()
    res.json({ codeSourceBindings: sortByUpdatedAt(state.codeSourceBindings) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/ci/code-sources', async (req, res, next) => {
  try {
    const binding = normalizeCodeSourceBindingRequest(req.body)
    const state = await loadRuntimeState()
    const task = buildTask('ci-code-source-bind', `Bind ${binding.provider} repo ${binding.bindingName}`)
    task.logs.push(`[web] received CI code-source binding for ${binding.bindingName}`)
    task.logs.push(`[simulate] provider: ${binding.provider}`)
    task.logs.push(`[simulate] repo: ${binding.repoUrl}`)
    task.logs.push(`[simulate] pipeline file: ${binding.jenkinsfilePath}`)
    task.logs.push(`[simulate] credentialId: ${binding.credentialId}`)
    task.logs.push(`[simulate] would create/update Jenkins job and webhook for ${binding.bindingName}`)

    state.codeSourceBindings = [
      binding,
      ...state.codeSourceBindings.filter(item => item.bindingName !== binding.bindingName)
    ]

    task.status = 'completed'
    task.finishedAt = isoNow()
    task.logs.push('[web] code-source binding saved successfully')
    upsertTask(state, task)
    await saveRuntimeState(state)

    const clusters = await loadManagedClusters()
    res.status(201).json({
      message: `Code-source binding ${binding.bindingName} saved successfully.`,
      workbench: summarizeWorkbench(state, clusters)
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/releases', async (_req, res, next) => {
  try {
    const state = await loadRuntimeState()
    res.json({ releases: sortedReleases(state) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/releases/execute', async (req, res, next) => {
  try {
    const request = normalizeReleaseRequest(req.body)
    const clusters = await loadManagedClusters()
    const cluster = clusters.find(item => item.name === request.targetCluster)

    if (!cluster) {
      res.status(404).json({ error: `cluster ${request.targetCluster} was not found` })
      return
    }

    const state = await loadRuntimeState()
    const targetNamespace = request.targetNamespace || cluster.releaseNamespace
    const task = buildTask('release-action', `${request.action} ${request.appName} on ${cluster.name}/${targetNamespace}`)
    task.logs.push(`[web] received ${request.action} request for ${request.appName}`)
    upsertTask(state, task)
    await saveRuntimeState(state)

    try {
      const executionResult = simulateReleaseExecution(request, cluster)
      task.logs.push(...executionResult.logs)
      const release = applyReleaseMutation(state, request, cluster, executionResult)
      task.status = 'completed'
      task.finishedAt = isoNow()
      task.logs.push(`[web] action ${request.action} completed successfully`)
      upsertTask(state, task)
      await saveRuntimeState(state)

      const refreshedClusters = await loadManagedClusters()
      res.json({
        message: `${request.action} completed for ${request.appName}`,
        release,
        workbench: summarizeWorkbench(state, refreshedClusters)
      })
    } catch (error) {
      task.status = 'failed'
      task.finishedAt = isoNow()
      task.logs.push(`[web] action failed: ${error.message}`)
      upsertTask(state, task)
      await saveRuntimeState(state)
      throw error
    }
  } catch (error) {
    next(error)
  }
})

app.post('/api/pods/delete', async (req, res, next) => {
  try {
    const operation = normalizePodDeleteRequest(req.body)
    const state = await loadRuntimeState()
    const release = state.stackReleases.find(item => item.key === operation.releaseKey)

    if (!release) {
      res.status(404).json({ error: `release ${operation.releaseKey} was not found` })
      return
    }

    const task = buildTask('pod-delete', `Delete pod ${operation.podName} on ${operation.targetCluster}/${operation.targetNamespace}`)
    task.logs.push(`[web] received pod delete request for ${operation.podName}`)

    if (operation.templateName) {
      task.logs.push(`[web] command template binding: ${operation.templateName}`)
    }

    task.logs.push(`[simulate] would execute kubectl delete pod ${operation.podName} -n ${operation.targetNamespace} --context ${operation.targetCluster}`)
    task.logs.push('[simulate] deployment controller would recreate the pod after deletion')

    state.podActionRecords = [
      operation,
      ...state.podActionRecords.filter(item => !(item.releaseKey === operation.releaseKey && item.podName === operation.podName))
    ]

    task.status = 'completed'
    task.finishedAt = isoNow()
    task.logs.push(`[web] pod delete request saved for ${operation.podName}`)
    upsertTask(state, task)
    await saveRuntimeState(state)

    const clusters = await loadManagedClusters()
    res.json({
      message: `Pod ${operation.podName} delete request saved successfully.`,
      workbench: summarizeWorkbench(state, clusters)
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/tasks', async (_req, res, next) => {
  try {
    const state = await loadRuntimeState()
    res.json({ tasks: sortedTasks(state) })
  } catch (error) {
    next(error)
  }
})

app.use((error, _req, res, _next) => {
  const status = error.statusCode || 400
  res.status(status).json({
    error: error.message || 'unexpected_error',
    timestamp: isoNow()
  })
})

app.listen(port, async () => {
  await ensureRuntimeState()
  console.log(`Backend listening on port ${port}`)
})


