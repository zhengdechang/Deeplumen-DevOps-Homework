// 全局 UI 状态，只保存前端交互必须的最小集合，避免页面状态散落在 DOM 中。
const state = {
  workbench: null,
  clusterProvisions: [],
  codeSourceBindings: [],
  podActionRecords: [],
  activePage: 'infra-cluster-deploy',
  selectedAppId: '',
  selectedBindingId: '',
  selectedTemplateId: 'deploy-stack',
  appDetailTab: 'overview'
}

// 路由表负责把左侧菜单、URL hash 和页面容器映射到一起。
const routes = Object.freeze({
  'infra-cluster-deploy': { hash: '#/infra/cluster-deploy', section: 'infra' },
  'infra-jenkins-install': { hash: '#/infra/jenkins-install', section: 'infra' },
  'cluster-list': { hash: '#/cluster/workspace', section: 'cluster' },
  'cluster-node-pools': { hash: '#/cluster/fleet', section: 'cluster' },
  'ci-code-source': { hash: '#/ci/code-source', section: 'ci' },
  'ci-pipeline-center': { hash: '#/ci/pipeline-center', section: 'ci' },
  'app-list': { hash: '#/app/menu', section: 'app' },
  'app-detail': { hash: '#/app/detail', section: 'app' },
  'cmd-template': { hash: '#/app/cmd-template', section: 'app' }
})

// 指令模板沿用 PAE 的操作习惯，但参数直接映射当前控制台中的应用发布上下文。
const commandTemplates = Object.freeze([
  {
    id: 'deploy-stack',
    name: '整栈发布模板',
    description: '基于当前应用上下文生成 Helm 升级命令。',
    command: 'helm upgrade --install {{appName}} stack-chart --namespace {{targetNamespace}} --set image.tag={{imageTag}} --kube-context {{targetCluster}}',
    releaseAction: 'update',
    bindingLabel: '应用发布工作台'
  },
  {
    id: 'rollback-stack',
    name: '回滚模板',
    description: '对前后端 Deployment 执行回滚。',
    command: 'kubectl rollout undo deploy/{{appName}}-frontend -n {{targetNamespace}}\nkubectl rollout undo deploy/{{appName}}-backend -n {{targetNamespace}}',
    releaseAction: 'rollback',
    bindingLabel: '应用详情顶部操作'
  },
  {
    id: 'delete-stack',
    name: '下线模板',
    description: '删除当前应用的部署资源并释放入口。',
    command: 'helm uninstall {{appName}} --namespace {{targetNamespace}} --kube-context {{targetCluster}}',
    releaseAction: 'delete',
    bindingLabel: '应用列表 / 应用详情删除操作'
  },
  {
    id: 'delete-pod',
    name: 'Pod 删除模板',
    description: '绑定到应用详情中的 Pod 行删除按钮，用于删除单个 Pod。',
    command: 'kubectl delete pod {{podName}} -n {{targetNamespace}} --context {{targetCluster}}',
    apiAction: 'pod-delete',
    bindingTarget: 'app-detail-pod-delete',
    bindingLabel: '应用详情 / Pod 行删除按钮',
    buttonLabel: '删除'
  }
])

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function fmt(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : timeFormatter.format(date)
}

function toneForStatus(value) {
  const text = String(value || '').toLowerCase()
  if (/failed|error|deleted|delete/.test(text)) return 'danger'
  if (/warm|pending|submitted|planning|warning/.test(text)) return 'warn'
  return 'ok'
}

function pill(value) {
  return `<span class="pill ${toneForStatus(value)}">${esc(value || '-')}</span>`
}

function status(message, tone = 'info') {
  const node = document.getElementById('status-bar')
  if (!node) return
  node.textContent = message
  node.className = `status-bar tone-${tone}`
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    ...options
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Request failed with status ${response.status}`)
  return payload
}

function hasRoute(page) {
  return Object.prototype.hasOwnProperty.call(routes, page)
}

function resolvePageFromHash(hash = window.location.hash) {
  return Object.entries(routes).find(([, route]) => route.hash === hash)?.[0] || 'infra-cluster-deploy'
}

// 把后端 workbench 响应折叠成前端稳定结构，后续渲染都只依赖这里的格式。
function applyWorkbench(payload) {
  state.workbench = {
    summary: payload.summary || {},
    clusters: payload.clusters || [],
    releases: payload.releases || [],
    tasks: payload.tasks || []
  }
  state.clusterProvisions = payload.clusterProvisions || []
  state.codeSourceBindings = payload.codeSourceBindings || []
  state.podActionRecords = payload.podActionRecords || []
}

function clusters() {
  return state.workbench?.clusters || []
}

function releases() {
  return state.workbench?.releases || []
}

function tasks() {
  return state.workbench?.tasks || []
}

function apps() {
  const taskList = tasks()
  return releases().map(release => ({
    id: release.key,
    appName: release.appName,
    cluster: release.targetCluster,
    namespace: release.targetNamespace,
    version: release.imageTag || 'latest',
    status: release.status || 'unknown',
    ingressHost: release.ingressHost || '-',
    history: taskList.filter(task => task.summary.includes(release.appName) && task.summary.includes(release.targetCluster)).slice(0, 8),
    raw: release
  }))
}

function podActions() {
  return state.podActionRecords || []
}

function stableHash(text) {
  let hash = 0
  const input = String(text || '')
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function templateByBinding(bindingTarget) {
  return commandTemplates.find(item => item.bindingTarget === bindingTarget) || null
}

function replicaCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? count : 1
}

function resolveTemplateCommand(template, values) {
  return template.command
    .replaceAll('{{appName}}', values.appName || 'demo-app')
    .replaceAll('{{targetCluster}}', values.targetCluster || 'local-lab')
    .replaceAll('{{targetNamespace}}', values.targetNamespace || 'staging')
    .replaceAll('{{imageTag}}', values.imageTag || 'latest')
    .replaceAll('{{podName}}', values.podName || 'demo-app-frontend-abcde-1')
    .replaceAll('{{component}}', values.component || 'frontend')
}

function buildPodList(app) {
  if (!app) return []

  const records = new Map(
    podActions()
      .filter(item => item.releaseKey === app.id)
      .map(item => [item.podName, item])
  )

  const suffix = stableHash(app.id).slice(0, 5)
  const pods = [
    {
      name: `${app.appName}-frontend-${suffix}-1`.toLowerCase(),
      component: 'frontend',
      image: app.raw.frontendImage,
      node: `${app.cluster}-worker-1`,
      namespace: app.namespace,
      releaseKey: app.id
    },
    {
      name: `${app.appName}-backend-${suffix}-1`.toLowerCase(),
      component: 'backend',
      image: app.raw.backendImage,
      node: `${app.cluster}-worker-2`,
      namespace: app.namespace,
      releaseKey: app.id
    }
  ]

  return pods.map(pod => {
    const actionRecord = records.get(pod.name) || null
    return {
      ...pod,
      actionRecord,
      status: actionRecord?.status === 'deleted' ? 'Deleted' : 'Running'
    }
  })
}

function podContextForTemplate(app, template) {
  if (!app || !template) return null
  if (template.bindingTarget !== 'app-detail-pod-delete') return null
  return buildPodList(app)[0] || null
}

function managedFleetSummary() {
  return clusters().map(cluster => {
    const provision = state.clusterProvisions.find(item => item.name === cluster.name) || null
    const estimatedNodes = provision ? 1 + provision.workerNodeIps.length : cluster.environment === 'production' ? 6 : 3
    return {
      cluster,
      provision,
      estimatedNodes,
      poolCount: provision ? 2 : 1,
      sourceLabel: cluster.source === 'web' ? 'Web 纳管' : '注册表'
    }
  })
}

function nodePools() {
  return managedFleetSummary().flatMap(item => {
    if (item.provision) {
      return [
        {
          id: `${item.cluster.name}-control-plane`,
          cluster: item.cluster.name,
          provider: item.cluster.provider,
          nodes: 1,
          role: 'control-plane',
          status: 'Running',
          source: item.sourceLabel
        },
        {
          id: `${item.cluster.name}-worker`,
          cluster: item.cluster.name,
          provider: item.cluster.provider,
          nodes: item.provision.workerNodeIps.length,
          role: 'worker',
          status: item.provision.status === 'planned' ? 'Planned' : item.provision.status,
          source: item.sourceLabel
        }
      ]
    }
    return [{
      id: `${item.cluster.name}-general`,
      cluster: item.cluster.name,
      provider: item.cluster.provider,
      nodes: item.estimatedNodes,
      role: 'general',
      status: item.cluster.source === 'web' ? 'WarmUp' : 'Running',
      source: item.sourceLabel
    }]
  })
}

function selectedApp(appList) {
  if (!appList.some(item => item.id === state.selectedAppId)) state.selectedAppId = appList[0]?.id || ''
  return appList.find(item => item.id === state.selectedAppId) || null
}

function selectedBinding() {
  if (!state.codeSourceBindings.some(item => item.id === state.selectedBindingId)) state.selectedBindingId = state.codeSourceBindings[0]?.id || ''
  return state.codeSourceBindings.find(item => item.id === state.selectedBindingId) || null
}

function selectedTemplate() {
  if (!commandTemplates.some(item => item.id === state.selectedTemplateId)) state.selectedTemplateId = commandTemplates[0]?.id || ''
  return commandTemplates.find(item => item.id === state.selectedTemplateId) || null
}

// kubeconfig 这里只做轻量提取，优先读 current-context，缺省时退化到第一个 context 名称。
function inferKubeContextFromText(text) {
  const raw = String(text || '')
  const currentContext = raw.match(/^\s*current-context\s*:\s*([^\r\n]+)/m)?.[1]?.trim()
  if (currentContext) return currentContext
  const firstContext = raw.match(/^\s*-\s*name\s*:\s*([^\r\n]+)/m)?.[1]?.trim()
  return firstContext || ''
}

function setActivePage(page) {
  const activePage = hasRoute(page) ? page : 'infra-cluster-deploy'
  const section = routes[activePage].section
  state.activePage = activePage

  document.querySelectorAll('[data-page]').forEach(node => {
    node.classList.toggle('is-active', node.dataset.page === activePage)
  })
  document.querySelectorAll('[data-nav-page]').forEach(node => {
    node.classList.toggle('is-active', node.dataset.navPage === activePage)
  })
  document.querySelectorAll('[data-nav-group]').forEach(node => {
    const isActive = node.dataset.navGroup === section
    node.classList.toggle('is-active', isActive)
    node.classList.toggle('is-open', isActive)
  })
  document.querySelectorAll('[data-section-trigger]').forEach(node => {
    node.classList.toggle('is-active', node.dataset.sectionTrigger === section)
  })
}

function go(page) {
  if (!hasRoute(page)) return
  setActivePage(page)
  if (window.location.hash !== routes[page].hash) window.location.hash = routes[page].hash
}

function renderSidebarStats(appList) {
  const setText = (id, value) => {
    const node = document.getElementById(id)
    if (node) node.textContent = String(value)
  }
  setText('nav-app-count', appList.length)
  setText('nav-cluster-count', clusters().length)
  setText('nav-task-count', tasks().length)
  setText('nav-provision-count', state.clusterProvisions.length)
  setText('nav-source-count', state.codeSourceBindings.length)
}
function renderClusterDeploy() {
  const latest = state.clusterProvisions[0]
  const root = document.getElementById('infra-cluster-deploy-root')
  if (!root) return

  const inventoryPreview = latest
    ? `[k8s_master]\nmaster-1 ansible_host=${latest.controlPlaneIp}\n\n[k8s_worker]\n${latest.workerNodeIps.map((ip, index) => `worker-${index + 1} ansible_host=${ip}`).join('\n')}`
    : ''

  root.innerHTML = `
    <article class="panel">
      <div class="panel-head"><div><h2>集群部署</h2><p>录入 Linux 节点、SSH 私钥和 Kubernetes 版本，生成兼容多云场景的 kubeadm/Ansible 部署计划。</p></div><span class="tag">Infrastructure</span></div>
      <div class="helper-strip"><span class="mini-chip">支持控制节点 + 多 worker</span><span class="mini-chip">支持上传或粘贴 SSH 私钥</span><span class="mini-chip">支持联动 Jenkins 安装计划</span></div>
      <form id="cluster-deploy-form">
        <div class="form-grid">
          <div class="field"><label>集群名称</label><input name="name" placeholder="例如 homework-lab-shanghai" required></div>
          <div class="field"><label>部署模式</label><select name="mode"><option value="kubeadm">kubeadm</option><option value="kubeadm-ha">kubeadm-ha</option></select></div>
          <div class="field"><label>Control Plane IP</label><input name="controlPlaneIp" placeholder="例如 192.168.56.10" required></div>
          <div class="field"><label>Kubernetes 版本</label><input name="kubernetesVersion" value="1.29.6"></div>
          <div class="field full"><label>Worker 节点 IP</label><textarea name="workerNodeIps" placeholder="每行一个 IP，也支持逗号分隔" required></textarea><p class="field-note">后端会按列表拆分 worker 节点，适配 Ansible inventory 生成。</p></div>
          <div class="field"><label>SSH 用户</label><input name="sshUser" value="ubuntu"></div>
          <div class="field"><label>SSH 端口</label><input name="sshPort" value="22"></div>
          <div class="field"><label>Pod CIDR</label><input name="podCidr" value="192.168.0.0/16"></div>
          <div class="field"><label>上传 SSH 私钥</label><input id="deploy-key-file" type="file" accept=".pem,.key,.txt"></div>
          <div class="field full"><label>SSH 私钥内容</label><textarea id="deploy-private-key" name="sshPrivateKey" placeholder="支持直接粘贴，或通过上方文件导入" required></textarea><p class="field-note">后台仅保存私钥指纹，不保存明文。</p></div>
          <div class="field full"><label>备注</label><textarea name="notes" placeholder="例如：安装完成后继续纳管到控制台，并联动 Jenkins"></textarea></div>
          <div class="field full"><div class="check-row"><input type="checkbox" name="installJenkins" value="true" checked><strong>同步规划 Jenkins 安装与 Kubernetes RBAC 集成</strong></div></div>
        </div>
        <div class="actions"><button class="action-button primary" type="submit">保存部署计划</button><button class="action-button ghost" type="reset">清空表单</button><button class="action-button secondary" type="button" data-refresh-workbench="true">刷新页面</button></div>
      </form>
    </article>
    <article class="panel">
      <div class="panel-head"><div><h2>部署计划记录</h2><p>计划保存后会沉淀在这里，便于后续继续补齐 inventory、Jenkins 或执行参数。</p></div><span class="tag">Plans</span></div>
      ${state.clusterProvisions.length ? `
        <div class="table-shell"><table class="console-table"><thead><tr><th>集群</th><th>Control Plane</th><th>Worker 数</th><th>K8s</th><th>Jenkins</th><th>状态</th><th>更新时间</th></tr></thead><tbody>
          ${state.clusterProvisions.map(item => `<tr><td>${esc(item.name)}</td><td class="mono">${esc(item.controlPlaneIp)}</td><td>${esc(String(item.workerNodeIps.length))}</td><td>${esc(item.kubernetesVersion)}</td><td>${item.installJenkins ? 'Yes' : 'No'}</td><td>${pill(item.status)}</td><td>${esc(fmt(item.updatedAt))}</td></tr>`).join('')}
        </tbody></table></div>
      ` : '<div class="empty">还没有保存任何集群部署计划。</div>'}
      ${latest ? `<div class="group-block" style="margin-top:16px;"><h3>最新 Inventory 预览</h3><pre class="code-preview">${esc(inventoryPreview)}</pre></div>` : ''}
    </article>
  `
}

function renderJenkinsInstall() {
  const root = document.getElementById('infra-jenkins-install-root')
  if (!root) return
  const latest = state.clusterProvisions[0]
  root.innerHTML = `
    <article class="panel">
      <div class="panel-head"><div><h2>Jenkins 安装</h2><p>把集群部署计划继续串到 Jenkins 安装、RBAC 授权和流水线接入，形成完整 DevOps 基础设施链路。</p></div><span class="tag">Jenkins</span></div>
      <div class="info-grid">
        <article class="info-card"><h3>安装 Playbook</h3><p><code>ansible/playbooks/02-deploy-jenkins.yml</code> 负责 Jenkins 主体安装。</p></article>
        <article class="info-card"><h3>RBAC Playbook</h3><p><code>ansible/playbooks/03-integrate-jenkins-k8s.yml</code> 负责 service account、token 与集群访问授权。</p></article>
        <article class="info-card"><h3>当前建议</h3><p>${latest ? `优先基于计划 ${esc(latest.name)} 继续实施。` : '建议先在“集群部署”页创建一份部署计划。'}</p></article>
      </div>
      <div class="group-block" style="margin-top:16px;"><h3>推荐执行顺序</h3><div class="field-row"><span class="name">Step 01</span><span class="value mono">ansible/playbooks/01-setup-cluster.yml</span></div><div class="field-row"><span class="name">Step 02</span><span class="value mono">ansible/playbooks/02-deploy-jenkins.yml</span></div><div class="field-row"><span class="name">Step 03</span><span class="value mono">ansible/playbooks/03-integrate-jenkins-k8s.yml</span></div></div>
      <div class="actions"><button class="action-button primary" type="button" data-page-link="infra-cluster-deploy">去集群部署</button><button class="action-button secondary" type="button" data-page-link="ci-code-source">去代码源绑定</button></div>
    </article>
  `
}

function renderClusterList() {
  const root = document.getElementById('cluster-list-root')
  if (!root) return
  const clusterList = clusters()
  root.innerHTML = `
    <article class="panel">
      <div class="panel-head"><div><h2>纳管工作区</h2><p>把存量或新部署完成的多云 Kubernetes 集群纳入控制台。支持直接填写 Kube Context，也支持粘贴 kubeconfig 自动提取。</p></div><span class="tag">Onboard</span></div>
      <div class="helper-strip"><span class="mini-chip">兼容国内外多云集群</span><span class="mini-chip">支持粘贴 kubeconfig</span><span class="mini-chip">支持 Web 端纳管</span></div>
      <form id="cluster-onboard-form">
        <div class="form-grid">
          <div class="field"><label>集群名称</label><input name="name" placeholder="例如 ack-shanghai-prod" required></div>
          <div class="field"><label>云厂商 / 类型</label><select name="provider"><option value="custom">Custom</option><option value="ack">阿里云 ACK</option><option value="eks">AWS EKS</option><option value="gke">Google GKE</option><option value="tke">腾讯云 TKE</option><option value="cce">华为云 CCE</option><option value="kubeadm">kubeadm</option></select></div>
          <div class="field"><label>Region</label><input name="region" placeholder="例如 cn-shanghai"></div>
          <div class="field"><label>环境</label><select name="environment"><option value="staging">staging</option><option value="production">production</option><option value="dev">dev</option></select></div>
          <div class="field"><label>Kube Context</label><input id="cluster-kube-context" name="kubeContext" placeholder="可留空，前端会尝试从 kubeconfig 提取"></div>
          <div class="field"><label>上传 kubeconfig</label><input id="cluster-kubeconfig-file" type="file" accept=".yaml,.yml,.conf,.config"></div>
          <div class="field full"><label>粘贴 kubeconfig</label><textarea id="cluster-kubeconfig" name="kubeConfig" placeholder="apiVersion: v1 ..."></textarea><p class="field-note">前端会优先解析 <code>current-context</code>，提交时仅把识别出的 context 发送给后端。</p></div>
          <div class="field"><label>默认发布命名空间</label><input name="releaseNamespace" value="staging"></div>
          <div class="field"><label>Ingress 域名后缀</label><input name="ingressDomainSuffix" value="apps.local"></div>
          <div class="field full"><label>备注</label><textarea name="notes" placeholder="例如：该集群接入后由应用发布工作台统一发布服务"></textarea></div>
        </div>
        <div class="actions"><button class="action-button primary" type="submit">保存纳管信息</button><button class="action-button ghost" type="reset">清空表单</button><button class="action-button secondary" type="button" data-refresh-workbench="true">刷新页面</button></div>
      </form>
    </article>
    <article class="panel">
      <div class="panel-head"><div><h2>纳管集群列表</h2><p>统一展示 registry 与 Web 纳管的多云集群，作为后续应用发布和流水线投递的目标集。</p></div><span class="tag">Managed Clusters</span></div>
      ${clusterList.length ? `
        <div class="table-shell"><table class="console-table"><thead><tr><th>集群</th><th>Provider</th><th>Region</th><th>环境</th><th>Kube Context</th><th>默认命名空间</th><th>来源</th></tr></thead><tbody>
          ${clusterList.map(cluster => `<tr><td>${esc(cluster.name)}</td><td>${esc(cluster.provider)}</td><td>${esc(cluster.region)}</td><td>${esc(cluster.environment)}</td><td class="mono">${esc(cluster.kubeContext)}</td><td>${esc(cluster.releaseNamespace)}</td><td>${pill(cluster.source === 'web' ? 'web' : 'registry')}</td></tr>`).join('')}
        </tbody></table></div>
      ` : '<div class="empty">当前还没有纳管集群，请先录入一条集群信息。</div>'}
    </article>
  `
}

function renderNodePools() {
  const root = document.getElementById('cluster-node-pools-root')
  if (!root) return
  const fleet = managedFleetSummary()
  const pools = nodePools()
  const totalNodes = fleet.reduce((sum, item) => sum + item.estimatedNodes, 0)
  const webManaged = fleet.filter(item => item.cluster.source === 'web').length
  root.innerHTML = `
    <article class="panel">
      <div class="panel-head"><div><h2>Managed Fleet</h2><p>按纳管集群聚合展示节点规模、部署计划来源和运行状态，作为平台侧的 Fleet 总览。</p></div><button class="action-button ghost small" type="button" data-refresh-workbench="true">刷新</button></div>
      <div class="info-grid"><article class="info-card"><h3>纳管集群</h3><p>${esc(String(fleet.length))} 个</p></article><article class="info-card"><h3>预估节点总数</h3><p>${esc(String(totalNodes))} 个</p></article><article class="info-card"><h3>Web 纳管集群</h3><p>${esc(String(webManaged))} 个</p></article></div>
    </article>
    <article class="panel">
      <div class="panel-head"><div><h2>节点池视图</h2><p>根据纳管集群和部署计划自动生成的节点池视图，用于演示平台侧的统一运维入口。</p></div><span class="tag">Fleet Pools</span></div>
      ${pools.length ? `
        <div class="table-shell"><table class="console-table"><thead><tr><th>Pool</th><th>Cluster</th><th>Provider</th><th>节点数</th><th>角色</th><th>状态</th><th>来源</th></tr></thead><tbody>
          ${pools.map(pool => `<tr><td>${esc(pool.id)}</td><td>${esc(pool.cluster)}</td><td>${esc(pool.provider)}</td><td>${esc(String(pool.nodes))}</td><td>${esc(pool.role)}</td><td>${pill(pool.status)}</td><td>${esc(pool.source)}</td></tr>`).join('')}
        </tbody></table></div>
      ` : '<div class="empty">当前还没有可展示的 Managed Fleet 视图。</div>'}
    </article>
  `
}
function renderCodeSource() {
  const root = document.getElementById('ci-code-source-root')
  if (!root) return
  root.innerHTML = `
    <article class="panel">
      <div class="panel-head"><div><h2>代码源绑定</h2><p>统一管理 GitLab、GitHub、Gitea 等代码源，绑定 Jenkinsfile、凭据和镜像仓库配置。</p></div><span class="tag">CI Binding</span></div>
      <form id="code-source-form">
        <div class="form-grid">
          <div class="field"><label>绑定名称</label><input name="bindingName" placeholder="例如 demo-app-gitlab" required></div>
          <div class="field"><label>代码平台</label><select name="provider"><option value="gitlab">GitLab</option><option value="github">GitHub</option><option value="gitea">Gitea</option><option value="bitbucket">Bitbucket</option><option value="generic-git">Generic Git</option></select></div>
          <div class="field full"><label>仓库地址</label><input name="repoUrl" placeholder="例如 https://gitlab.example.com/group/demo-app.git" required></div>
          <div class="field"><label>Group / Namespace</label><input name="namespaceGroup"></div>
          <div class="field"><label>项目名称</label><input name="projectName"></div>
          <div class="field"><label>默认分支</label><input name="defaultBranch" value="main"></div>
          <div class="field"><label>认证方式</label><select name="authMode"><option value="token">Token</option><option value="ssh">SSH Key</option></select></div>
          <div class="field"><label>Jenkins 凭据 ID</label><input name="credentialId" placeholder="例如 gitlab-demo-token" required></div>
          <div class="field"><label>Webhook Secret</label><input name="webhookSecret"></div>
          <div class="field"><label>镜像仓库地址</label><input name="registryUrl" value="docker.io"></div>
          <div class="field"><label>镜像命名空间</label><input name="registryNamespace" value="your-dockerhub-namespace"></div>
          <div class="field"><label>流水线类型</label><select id="binding-pipeline-kind" name="pipelineKind"><option value="full-stack">full-stack</option><option value="deploy-only">deploy-only</option></select></div>
          <div class="field full"><label>Jenkinsfile 路径</label><input id="binding-jenkinsfile" name="jenkinsfilePath" value="jenkins/Jenkinsfile"></div>
          <div class="field full"><label>备注</label><textarea name="notes" placeholder="例如：使用外部 Harbor，自动触发部署到生产集群"></textarea></div>
          <div class="field full"><div class="check-row"><input type="checkbox" name="autoTrigger" value="true" checked><strong>启用 Push / Merge 后自动触发流水线</strong></div></div>
        </div>
        <div class="actions"><button class="action-button primary" type="submit">保存代码源绑定</button><button class="action-button ghost" type="reset">清空表单</button><button class="action-button secondary" type="button" data-refresh-workbench="true">刷新页面</button></div>
      </form>
    </article>
    <article class="panel">
      <div class="panel-head"><div><h2>绑定记录</h2><p>保存成功后会沉淀到这里，供流水线中心和应用发布工作台继续引用。</p></div><span class="tag">Saved Bindings</span></div>
      ${state.codeSourceBindings.length ? `
        <div class="table-shell"><table class="console-table"><thead><tr><th>名称</th><th>平台</th><th>仓库</th><th>默认分支</th><th>流水线</th><th>凭据 ID</th><th>动作</th></tr></thead><tbody>
          ${state.codeSourceBindings.map(item => `<tr><td>${esc(item.bindingName)}</td><td>${esc(item.provider)}</td><td class="mono">${esc(item.repoUrl)}</td><td>${esc(item.defaultBranch)}</td><td>${esc(item.pipelineKind)}</td><td>${esc(item.credentialId)}</td><td><button class="action-button secondary small" type="button" data-open-binding="${esc(item.id)}">查看流水线</button></td></tr>`).join('')}
        </tbody></table></div>
      ` : '<div class="empty">还没有任何代码源绑定。</div>'}
    </article>
  `
}

function renderPipelineCenter() {
  const root = document.getElementById('ci-pipeline-center-root')
  if (!root) return
  const binding = selectedBinding()
  const pipelineTasks = tasks().filter(task => task.type === 'release-action' || task.type === 'ci-code-source-bind').slice(0, 8)
  root.innerHTML = `
    <article class="panel">
      <div class="panel-head"><div><h2>流水线中心</h2><p>围绕 Jenkinsfile、凭据和目标集群，把代码源绑定沉淀成可以直接用于发布的流水线入口。</p></div><span class="tag">Pipeline</span></div>
      <div class="info-grid"><article class="info-card"><h3>Full Stack</h3><p><code>jenkins/Jenkinsfile</code> 适合 build、push、deploy 一体化流水线。</p></article><article class="info-card"><h3>Deploy Only</h3><p><code>jenkins/Jenkinsfile.deploy</code> 适合只做发布，不重新构建镜像。</p></article><article class="info-card"><h3>目标集群来源</h3><p>流水线会引用控制台中的纳管集群列表作为部署目标。</p></article></div>
    </article>
    <article class="panel">
      <div class="panel-head"><div><h2>当前绑定上下文</h2><p>${binding ? '已选中的代码源绑定如下，可继续作为默认流水线入口。' : '当前还没有绑定记录，请先去“代码源绑定”页面创建。'}</p></div>${binding ? `<span class="tag">${esc(binding.pipelineKind)}</span>` : ''}</div>
      ${binding ? `<div class="meta-grid"><div class="kv-card"><span class="k">绑定名称</span><span class="v">${esc(binding.bindingName)}</span></div><div class="kv-card"><span class="k">代码平台</span><span class="v">${esc(binding.provider)}</span></div><div class="kv-card"><span class="k">默认分支</span><span class="v">${esc(binding.defaultBranch)}</span></div><div class="kv-card"><span class="k">Jenkinsfile</span><span class="v mono">${esc(binding.jenkinsfilePath)}</span></div><div class="kv-card"><span class="k">凭据 ID</span><span class="v">${esc(binding.credentialId)}</span></div><div class="kv-card"><span class="k">镜像仓库</span><span class="v mono">${esc(`${binding.registryUrl}/${binding.registryNamespace}`)}</span></div></div>` : '<div class="empty">先创建一条代码源绑定，再来查看流水线中心。</div>'}
      <div class="actions"><button class="action-button primary" type="button" data-page-link="ci-code-source">去管理绑定</button><button class="action-button secondary" type="button" data-page-link="app-list">去应用发布</button></div>
    </article>
    <article class="panel">
      <div class="panel-head"><div><h2>最近流水线相关任务</h2><p>这里串起代码源绑定动作和最近的发布任务，方便从 Web 端回看执行链路。</p></div><span class="tag">Recent Tasks</span></div>
      <div class="table-shell"><table class="console-table"><thead><tr><th>时间</th><th>任务</th><th>状态</th><th>日志数</th></tr></thead><tbody>${pipelineTasks.length ? pipelineTasks.map(task => `<tr><td>${esc(fmt(task.createdAt))}</td><td>${esc(task.summary)}</td><td>${pill(task.status)}</td><td>${esc(String(task.logs?.length || 0))}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">还没有流水线相关任务。</td></tr>'}</tbody></table></div>
    </article>
  `
}

function renderAppList(appList) {
  const root = document.getElementById('app-list-root')
  if (!root) return
  const clusterOptions = clusters()
  const firstCluster = clusterOptions[0]?.name || ''
  root.innerHTML = `
    <article class="panel">
      <div class="panel-head"><div><h2>应用菜单</h2><p>沿用 PAE 风格的应用菜单，同时补齐 Web 端新建发布、更新、回滚与下线能力。</p></div><span class="tag">Release Console</span></div>
      ${clusterOptions.length ? `
        <form id="app-release-form"><div class="form-grid"><div class="field"><label>动作</label><select name="action"><option value="deploy">deploy</option><option value="update">update</option><option value="rollback">rollback</option><option value="delete">delete</option></select></div><div class="field"><label>应用名称</label><input name="appName" placeholder="例如 demo-app" required></div><div class="field"><label>目标集群</label><select name="targetCluster">${clusterOptions.map(cluster => `<option value="${esc(cluster.name)}" ${cluster.name === firstCluster ? 'selected' : ''}>${esc(cluster.name)}</option>`).join('')}</select></div><div class="field"><label>目标命名空间</label><input name="targetNamespace" value="staging"></div><div class="field"><label>镜像 Tag</label><input name="imageTag" value="latest"></div><div class="field"><label>Frontend 副本</label><input name="frontendReplicas" value="2"></div><div class="field"><label>Backend 副本</label><input name="backendReplicas" value="2"></div><div class="field full"><label>备注</label><textarea name="notes" placeholder="例如：本次发布面向生产环境，完成后请回看应用详情与任务记录"></textarea></div></div><div class="actions"><button class="action-button primary" type="submit">执行发布动作</button><button class="action-button ghost" type="reset">清空表单</button><button class="action-button secondary" type="button" data-page-link="cmd-template">查看指令模板</button></div></form>
      ` : '<div class="empty">请先到“集群纳管”页面纳管至少一个集群，然后再进行服务发布。</div>'}
    </article>
    <article class="panel">
      <div class="panel-head"><div><h2>已发布应用</h2><p>展示当前整栈发布记录。点击应用名称可直接进入应用详情页，查看 Pod 列表并执行模板绑定的删除动作。</p></div><button class="action-button ghost small" type="button" data-refresh-workbench="true">刷新</button></div>
      ${appList.length ? `
        <div class="table-shell"><table class="console-table"><thead><tr><th>应用</th><th>Cluster</th><th>Namespace</th><th>状态</th><th>版本</th><th>动作</th></tr></thead><tbody>
          ${appList.map(app => `<tr><td><button class="table-link" type="button" data-open-app="${esc(app.id)}">${esc(app.appName)}</button></td><td>${esc(app.cluster)}</td><td>${esc(app.namespace)}</td><td>${pill(app.status)}</td><td class="mono">${esc(app.version)}</td><td><div class="inline-actions"><button class="action-button secondary small" type="button" data-fill-release="${esc(app.id)}">带入参数</button><button class="action-button ghost small" type="button" data-open-app="${esc(app.id)}">详情</button><button class="action-button ghost small" type="button" data-release-action="rollback" data-app-id="${esc(app.id)}">回滚</button><button class="action-button danger small" type="button" data-release-action="delete" data-app-id="${esc(app.id)}">下线</button></div></td></tr>`).join('')}
        </tbody></table></div>
      ` : '<div class="empty">当前还没有已发布应用。你可以先通过上方表单执行一次 deploy。</div>'}
    </article>
  `
}

function renderAppDetail(appList) {
  const root = document.getElementById('app-detail-root')
  if (!root) return
  const app = selectedApp(appList)
  if (!app) {
    root.innerHTML = '<article class="panel"><div class="panel-head"><div><h2>应用详情</h2><p>当前没有可查看的应用记录。</p></div><span class="tag">App Detail</span></div><div class="empty">先在“应用菜单”里完成一次发布，再来查看详情。</div></article>'
    return
  }

  const tab = state.appDetailTab
  const previousRelease = app.raw.previousRelease
  const podDeleteTemplate = templateByBinding('app-detail-pod-delete')
  const podList = buildPodList(app)

  root.innerHTML = `
    <article class="panel">
      <div class="panel-head"><div><h2>应用详情</h2><p>沿用 PAE 的应用详情视图，顶部直接展示 Pod 列表，并把删除动作绑定到指令模板。</p></div><span class="tag">${esc(app.appName)}</span></div>
      <div class="detail-tabs"><button class="detail-tab ${tab === 'overview' ? 'is-active' : ''}" type="button" data-app-tab="overview">概览</button><button class="detail-tab ${tab === 'inputs' ? 'is-active' : ''}" type="button" data-app-tab="inputs">发布参数</button><button class="detail-tab ${tab === 'history' ? 'is-active' : ''}" type="button" data-app-tab="history">执行记录</button></div>
      <div class="actions" style="margin-top:12px;"><button class="action-button secondary small" type="button" data-fill-release="${esc(app.id)}">带入发布表单</button><button class="action-button ghost small" type="button" data-release-action="rollback" data-app-id="${esc(app.id)}">回滚</button><button class="action-button danger small" type="button" data-release-action="delete" data-app-id="${esc(app.id)}">下线</button><button class="action-button ghost small" type="button" data-page-link="cmd-template">指令模板</button></div>
      <div class="group-block" style="margin-top:16px;"><h3>Pod 列表</h3><p class="detail-subtitle">这里固定演示 2 条 Pod 数据，每行删除按钮由“Pod 删除模板”绑定。</p><div class="table-shell"><table class="console-table"><thead><tr><th>Pod</th><th>组件</th><th>状态</th><th>Node</th><th>镜像</th><th>动作</th></tr></thead><tbody>${podList.map(pod => `<tr><td class="mono">${esc(pod.name)}</td><td>${esc(pod.component)}</td><td>${pill(pod.status)}</td><td class="mono">${esc(pod.node)}</td><td class="mono">${esc(pod.image)}</td><td>${podDeleteTemplate ? `<button class="action-button danger small" type="button" data-pod-template-run="${esc(podDeleteTemplate.id)}" data-app-id="${esc(app.id)}" data-pod-name="${esc(pod.name)}">${esc(podDeleteTemplate.buttonLabel || '删除')}</button>` : '<span class="muted">未绑定模板</span>'}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="detail-panel ${tab === 'overview' ? 'is-active' : ''}" style="margin-top:16px;"><div class="meta-grid"><div class="kv-card"><span class="k">应用</span><span class="v">${esc(app.appName)}</span></div><div class="kv-card"><span class="k">Cluster</span><span class="v">${esc(app.cluster)}</span></div><div class="kv-card"><span class="k">Namespace</span><span class="v">${esc(app.namespace)}</span></div><div class="kv-card"><span class="k">版本</span><span class="v mono">${esc(app.version)}</span></div><div class="kv-card"><span class="k">Ingress Host</span><span class="v mono">${esc(app.ingressHost)}</span></div><div class="kv-card"><span class="k">状态</span><span class="v">${pill(app.status)}</span></div></div>${previousRelease ? `<div class="group-block" style="margin-top:16px;"><h3>上一版本</h3><div class="field-row"><span class="name">镜像 Tag</span><span class="value mono">${esc(previousRelease.imageTag || '-')}</span></div><div class="field-row"><span class="name">最后动作</span><span class="value">${esc(previousRelease.lastAction || '-')}</span></div><div class="field-row"><span class="name">更新时间</span><span class="value">${esc(fmt(previousRelease.updatedAt))}</span></div></div>` : ''}</div>
      <div class="detail-panel ${tab === 'inputs' ? 'is-active' : ''}" style="margin-top:16px;"><div class="group-stack"><div class="group-block"><h3>发布参数</h3><div class="field-row"><span class="name">Frontend 镜像</span><span class="value mono">${esc(app.raw.frontendImage)}</span></div><div class="field-row"><span class="name">Backend 镜像</span><span class="value mono">${esc(app.raw.backendImage)}</span></div><div class="field-row"><span class="name">Frontend 副本</span><span class="value">${esc(app.raw.frontendReplicas)}</span></div><div class="field-row"><span class="name">Backend 副本</span><span class="value">${esc(app.raw.backendReplicas)}</span></div></div><div class="group-block"><h3>目标上下文</h3><div class="field-row"><span class="name">Kube Context</span><span class="value mono">${esc(app.raw.kubeContext)}</span></div><div class="field-row"><span class="name">Provider</span><span class="value">${esc(app.raw.provider)}</span></div><div class="field-row"><span class="name">Region</span><span class="value">${esc(app.raw.region)}</span></div><div class="field-row"><span class="name">Environment</span><span class="value">${esc(app.raw.environment)}</span></div></div></div></div>
      <div class="detail-panel ${tab === 'history' ? 'is-active' : ''}" style="margin-top:16px;"><div class="table-shell"><table class="console-table"><thead><tr><th>时间</th><th>任务</th><th>状态</th><th>日志数</th></tr></thead><tbody>${app.history.length ? app.history.map(item => `<tr><td>${esc(fmt(item.createdAt))}</td><td>${esc(item.summary)}</td><td>${pill(item.status)}</td><td>${esc(String(item.logs?.length || 0))}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">暂无执行记录。</td></tr>'}</tbody></table></div></div>
    </article>
  `
}
function renderCmdTemplate(appList) {
  const root = document.getElementById('cmd-template-root')
  if (!root) return
  const app = selectedApp(appList)
  const template = selectedTemplate()
  const defaultCluster = clusters()[0]?.name || 'local-lab'
  const values = {
    appName: app?.appName || 'demo-app',
    targetCluster: app?.cluster || defaultCluster,
    targetNamespace: app?.namespace || 'staging',
    imageTag: app?.version || 'latest'
  }
  const preview = template.command
    .replaceAll('{{appName}}', values.appName)
    .replaceAll('{{targetCluster}}', values.targetCluster)
    .replaceAll('{{targetNamespace}}', values.targetNamespace)
    .replaceAll('{{imageTag}}', values.imageTag)
  root.innerHTML = `
    <article class="panel">
      <div class="panel-head"><div><h2>指令模板</h2><p>把 PAE 风格的指令模板映射到当前发布上下文，便于先预览、再执行动作。</p></div><span class="tag">Command Template</span></div>
      <div class="template-layout"><div class="template-grid">${commandTemplates.map(item => `<button class="template-card ${item.id === state.selectedTemplateId ? 'is-active' : ''}" type="button" data-template-select="${esc(item.id)}"><span class="shortcut-chip">Template</span><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p></button>`).join('')}</div><div class="group-block template-preview"><div><h3>${esc(template.name)}</h3><p class="detail-subtitle">当前上下文：${esc(values.appName)} / ${esc(values.targetCluster)} / ${esc(values.targetNamespace)}</p></div><div class="template-vars"><span class="template-var">appName=${esc(values.appName)}</span><span class="template-var">cluster=${esc(values.targetCluster)}</span><span class="template-var">namespace=${esc(values.targetNamespace)}</span><span class="template-var">imageTag=${esc(values.imageTag)}</span></div><pre class="code-preview">${esc(preview)}</pre><div class="inline-actions"><button class="action-button primary small" type="button" data-template-run="${esc(template.id)}">执行模板动作</button><button class="action-button ghost small" type="button" data-page-link="app-list">回到应用菜单</button></div></div></div>
    </article>
  `
}

function renderAll() {
  if (!state.workbench) return
  const appList = apps()
  renderSidebarStats(appList)
  renderClusterDeploy()
  renderJenkinsInstall()
  renderClusterList()
  renderNodePools()
  renderCodeSource()
  renderPipelineCenter()
  renderAppList(appList)
  renderAppDetail(appList)
  renderCmdTemplate(appList)
}

async function refreshWorkbench() {
  try {
    applyWorkbench(await requestJson('/api/workbench'))
  } catch {
    const fallback = await requestJson('/api/dashboard')
    applyWorkbench({ ...fallback, clusterProvisions: state.clusterProvisions, codeSourceBindings: state.codeSourceBindings, podActionRecords: state.podActionRecords })
  }
  renderAll()
  const summary = state.workbench?.summary || {}
  status(`页面已刷新：${summary.clusterCount || 0} 个集群，${summary.releaseCount || 0} 条发布记录，${summary.codeSourceCount || 0} 条 CI 绑定。`, 'success')
}

async function executeReleaseAction(action, appId) {
  const app = apps().find(item => item.id === appId)
  if (!app) throw new Error(`未找到应用记录：${appId}`)
  status(`正在为 ${app.appName} 执行 ${action} ...`, 'info')
  const result = await requestJson('/api/releases/execute', {
    method: 'POST',
    body: JSON.stringify({
      action,
      appName: app.appName,
      targetCluster: app.raw.targetCluster,
      targetNamespace: app.raw.targetNamespace,
      imageTag: app.raw.imageTag || 'latest',
      frontendReplicas: app.raw.frontendReplicas || '2',
      backendReplicas: app.raw.backendReplicas || '2'
    })
  })
  applyWorkbench(result.workbench || state.workbench)
  state.selectedAppId = result.release?.key || state.selectedAppId
  state.appDetailTab = 'overview'
  renderAll()
  status(result.message, 'success')
}

async function executePodTemplate(templateId, appId, podName) {
  const template = commandTemplates.find(item => item.id === templateId)
  const app = apps().find(item => item.id === appId)
  if (!template) throw new Error(`未找到模板：${templateId}`)
  if (!app) throw new Error(`未找到应用记录：${appId}`)

  const pod = buildPodList(app).find(item => item.name === podName)
  if (!pod) throw new Error(`未找到 Pod：${podName}`)

  status(`正在通过模板 ${template.name} 删除 ${pod.name} ...`, 'info')

  const result = await requestJson('/api/pods/delete', {
    method: 'POST',
    body: JSON.stringify({
      releaseKey: app.id,
      appName: app.appName,
      targetCluster: app.cluster,
      targetNamespace: app.namespace,
      podName: pod.name,
      component: pod.component,
      templateId: template.id,
      templateName: template.name
    })
  })

  applyWorkbench(result.workbench || state.workbench)
  state.selectedAppId = app.id
  state.selectedTemplateId = template.id
  state.appDetailTab = 'overview'
  renderAll()
  status(result.message, 'success')
}

function setFormValue(form, name, value) {
  const node = form.querySelector(`[name="${name}"]`)
  if (node) node.value = value
}

function fillReleaseForm(appId, action = 'update') {
  const form = document.getElementById('app-release-form')
  const app = apps().find(item => item.id === appId)
  if (!(form instanceof HTMLFormElement) || !app) return
  setFormValue(form, 'action', action)
  setFormValue(form, 'appName', app.appName)
  setFormValue(form, 'targetCluster', app.cluster)
  setFormValue(form, 'targetNamespace', app.namespace)
  setFormValue(form, 'imageTag', app.version)
  setFormValue(form, 'frontendReplicas', app.raw.frontendReplicas || '2')
  setFormValue(form, 'backendReplicas', app.raw.backendReplicas || '2')
  status(`已带入 ${app.appName} 的发布参数。`, 'success')
}

function bindEvents() {
  document.body.addEventListener('click', event => {
    const pageButton = event.target.closest('[data-page-link]')
    if (pageButton) return go(pageButton.dataset.pageLink)

    const openApp = event.target.closest('[data-open-app]')
    if (openApp) {
      state.selectedAppId = openApp.dataset.openApp
      state.appDetailTab = 'overview'
      renderAll()
      return go('app-detail')
    }

    const openBinding = event.target.closest('[data-open-binding]')
    if (openBinding) {
      state.selectedBindingId = openBinding.dataset.openBinding
      renderAll()
      return go('ci-pipeline-center')
    }

    const refreshButton = event.target.closest('[data-refresh-workbench]')
    if (refreshButton) return refreshWorkbench().catch(error => status(error.message, 'error'))

    const releaseButton = event.target.closest('[data-release-action]')
    if (releaseButton) return executeReleaseAction(releaseButton.dataset.releaseAction, releaseButton.dataset.appId).catch(error => status(error.message, 'error'))

    const podTemplateButton = event.target.closest('[data-pod-template-run]')
    if (podTemplateButton) {
      state.selectedTemplateId = podTemplateButton.dataset.podTemplateRun
      state.selectedAppId = podTemplateButton.dataset.appId
      return executePodTemplate(podTemplateButton.dataset.podTemplateRun, podTemplateButton.dataset.appId, podTemplateButton.dataset.podName).catch(error => status(error.message, 'error'))
    }

    const fillRelease = event.target.closest('[data-fill-release]')
    if (fillRelease) {
      state.selectedAppId = fillRelease.dataset.fillRelease
      renderAll()
      go('app-list')
      fillReleaseForm(fillRelease.dataset.fillRelease)
      return
    }

    const templateSelect = event.target.closest('[data-template-select]')
    if (templateSelect) {
      state.selectedTemplateId = templateSelect.dataset.templateSelect
      return renderAll()
    }

    const templateRun = event.target.closest('[data-template-run]')
    if (templateRun) {
      const template = commandTemplates.find(item => item.id === templateRun.dataset.templateRun)
      const currentApp = selectedApp(apps())
      if (!currentApp) return status('请先选择一个已发布应用，再执行模板动作。', 'error')
      if (template?.apiAction === 'pod-delete') {
        const pod = podContextForTemplate(currentApp, template)
        if (!pod) return status('当前模板需要 Pod 上下文，请先在应用详情页查看 Pod 列表。', 'error')
        return executePodTemplate(template.id, currentApp.id, pod.name).catch(error => status(error.message, 'error'))
      }
      if (template?.releaseAction) return executeReleaseAction(template.releaseAction, currentApp.id).catch(error => status(error.message, 'error'))
      return status(`已模拟执行模板：${template?.name || 'unknown'}`, 'success')
    }

    const tabButton = event.target.closest('[data-app-tab]')
    if (tabButton) {
      state.appDetailTab = tabButton.dataset.appTab
      renderAll()
    }
  })

  document.body.addEventListener('submit', event => {
    const form = event.target
    if (!(form instanceof HTMLFormElement)) return

    if (form.id === 'cluster-deploy-form') {
      event.preventDefault()
      const body = Object.fromEntries(new FormData(form).entries())
      status(`正在保存集群部署计划 ${body.name} ...`, 'info')
      requestJson('/api/infrastructure/clusters', { method: 'POST', body: JSON.stringify(body) })
        .then(result => {
          applyWorkbench(result.workbench || state.workbench)
          form.reset()
          const keyNode = document.getElementById('deploy-private-key')
          if (keyNode) keyNode.value = ''
          renderAll()
          status(result.message, 'success')
        })
        .catch(error => status(error.message, 'error'))
    }

    if (form.id === 'cluster-onboard-form') {
      event.preventDefault()
      const body = Object.fromEntries(new FormData(form).entries())
      if (!body.kubeContext && body.kubeConfig) body.kubeContext = inferKubeContextFromText(body.kubeConfig)
      if (!body.kubeContext) return status('请填写 Kube Context，或粘贴可识别 current-context 的 kubeconfig。', 'error')
      delete body.kubeConfig
      status(`正在纳管集群 ${body.name} ...`, 'info')
      requestJson('/api/clusters/onboard', { method: 'POST', body: JSON.stringify(body) })
        .then(result => {
          applyWorkbench(result.workbench || state.workbench)
          form.reset()
          const kubeconfigNode = document.getElementById('cluster-kubeconfig')
          if (kubeconfigNode) kubeconfigNode.value = ''
          state.selectedAppId = ''
          renderAll()
          status(result.message, 'success')
        })
        .catch(error => status(error.message, 'error'))
    }

    if (form.id === 'code-source-form') {
      event.preventDefault()
      const body = Object.fromEntries(new FormData(form).entries())
      status(`正在保存代码源绑定 ${body.bindingName} ...`, 'info')
      requestJson('/api/ci/code-sources', { method: 'POST', body: JSON.stringify(body) })
        .then(result => {
          applyWorkbench(result.workbench || state.workbench)
          state.selectedBindingId = result.workbench?.codeSourceBindings?.[0]?.id || state.selectedBindingId
          form.reset()
          renderAll()
          status(result.message, 'success')
        })
        .catch(error => status(error.message, 'error'))
    }

    if (form.id === 'app-release-form') {
      event.preventDefault()
      const body = Object.fromEntries(new FormData(form).entries())
      status(`正在执行 ${body.action} / ${body.appName} ...`, 'info')
      requestJson('/api/releases/execute', { method: 'POST', body: JSON.stringify(body) })
        .then(result => {
          applyWorkbench(result.workbench || state.workbench)
          state.selectedAppId = result.release?.key || state.selectedAppId
          state.appDetailTab = 'overview'
          renderAll()
          status(result.message, 'success')
        })
        .catch(error => status(error.message, 'error'))
    }
  })

  // 文件导入和部分表单联动都放在 change 事件中，保证页面重绘后依旧生效。
  document.body.addEventListener('change', event => {
    const target = event.target

    if (target instanceof HTMLInputElement && target.id === 'deploy-key-file') {
      const file = target.files?.[0]
      if (!file) return
      file.text().then(text => {
        const keyNode = document.getElementById('deploy-private-key')
        if (keyNode) keyNode.value = text
        status(`已从文件 ${file.name} 读取 SSH 私钥内容。`, 'success')
      }).catch(error => status(error.message, 'error'))
    }

    if (target instanceof HTMLInputElement && target.id === 'cluster-kubeconfig-file') {
      const file = target.files?.[0]
      if (!file) return
      file.text().then(text => {
        const kubeconfigNode = document.getElementById('cluster-kubeconfig')
        const contextNode = document.getElementById('cluster-kube-context')
        if (kubeconfigNode) kubeconfigNode.value = text
        if (contextNode && !contextNode.value.trim()) contextNode.value = inferKubeContextFromText(text)
        status(`已从文件 ${file.name} 导入 kubeconfig。`, 'success')
      }).catch(error => status(error.message, 'error'))
    }

    if (target instanceof HTMLTextAreaElement && target.id === 'cluster-kubeconfig') {
      const contextNode = document.getElementById('cluster-kube-context')
      if (contextNode && !contextNode.value.trim()) contextNode.value = inferKubeContextFromText(target.value)
    }

    if ((target instanceof HTMLSelectElement || target instanceof HTMLInputElement) && target.id === 'binding-pipeline-kind') {
      const pathNode = document.getElementById('binding-jenkinsfile')
      if (pathNode) pathNode.value = target.value === 'deploy-only' ? 'jenkins/Jenkinsfile.deploy' : 'jenkins/Jenkinsfile'
    }
  })

  window.addEventListener('hashchange', () => setActivePage(resolvePageFromHash()))
}

async function bootstrap() {
  bindEvents()
  if (!Object.values(routes).some(route => route.hash === window.location.hash)) window.location.hash = routes['infra-cluster-deploy'].hash
  setActivePage(resolvePageFromHash())
  await refreshWorkbench()
}

bootstrap().catch(error => status(error.message, 'error'))





