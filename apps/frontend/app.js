const state = { dashboard: null, activePage: 'home' }

// 使用 hash 路由把左侧菜单变成真正的“页面入口”，而不是简单的面板显隐。
const routes = Object.freeze({
  home: { hash: '#/home', section: 'home' },
  'cluster-workspace': { hash: '#/clusters/workspace', section: 'cluster' },
  'cluster-fleet': { hash: '#/clusters/fleet', section: 'cluster' },
  'release-workspace': { hash: '#/releases/workspace', section: 'release' },
  'release-stack': { hash: '#/releases/stacks', section: 'release' },
  'release-tasks': { hash: '#/releases/tasks', section: 'release' }
})

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit'
})

function hasRoute(page) {
  return Object.prototype.hasOwnProperty.call(routes, page)
}

function resolvePageFromHash(hash = window.location.hash) {
  return Object.entries(routes).find(([, route]) => route.hash === hash)?.[0] || 'home'
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`)
  }
  return payload
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : timeFormatter.format(date)
}

function setStatus(message, tone = 'info') {
  const node = document.getElementById('status-bar')
  if (!node) return
  node.textContent = message
  node.className = `status-bar tone-${tone}`
}

function setActivePage(page) {
  const activePage = hasRoute(page) ? page : 'home'
  const activeSection = routes[activePage].section

  state.activePage = activePage

  document.querySelectorAll('[data-page]').forEach(node => {
    node.classList.toggle('is-active', node.dataset.page === activePage)
  })

  const homeButton = document.querySelector('[data-nav-home]')
  if (homeButton) {
    homeButton.classList.toggle('is-active', activePage === 'home')
  }

  document.querySelectorAll('[data-nav-page]').forEach(node => {
    node.classList.toggle('is-active', node.dataset.navPage === activePage)
  })

  document.querySelectorAll('[data-nav-group]').forEach(node => {
    const isActive = node.dataset.navGroup === activeSection
    node.classList.toggle('is-active', isActive)
    node.classList.toggle('is-open', isActive)
  })

  document.querySelectorAll('[data-section-trigger]').forEach(node => {
    node.classList.toggle('is-active', node.dataset.sectionTrigger === activeSection)
  })
}

function goToPage(page) {
  if (!hasRoute(page)) return
  setActivePage(page)
  if (window.location.hash !== routes[page].hash) {
    window.location.hash = routes[page].hash
  }
}

function summaryCards(summary) {
  return [
    { label: 'Managed Clusters', value: summary.clusterCount, note: '统一纳管的国内外集群数量' },
    { label: 'Web Added', value: summary.runtimeClusterCount, note: '通过当前 Web 控制台补录的集群' },
    { label: 'Active Stacks', value: summary.releaseCount, note: '当前存在的前后端整栈快照' },
    { label: 'Task Stream', value: summary.taskCount, note: '最近执行任务数量' },
    { label: 'Execution Mode', value: summary.executionMode, note: 'simulate 或真实执行模式' },
    { label: 'Control Host', value: summary.backendHost, note: `更新时间 ${formatTime(summary.timestamp)}` }
  ]
}

function renderSummary(summary) {
  const root = document.getElementById('summary-grid')
  if (!root) return
  root.innerHTML = summaryCards(summary).map(card => `
    <article class="summary-card">
      <div class="summary-label">${escapeHtml(card.label)}</div>
      <div class="summary-value">${escapeHtml(card.value)}</div>
      <div class="summary-note">${escapeHtml(card.note)}</div>
    </article>
  `).join('')
}

function renderSidebarStats(summary) {
  const clusterCount = document.getElementById('nav-cluster-count')
  const taskCount = document.getElementById('nav-task-count')

  if (clusterCount) clusterCount.textContent = String(summary.clusterCount)
  if (taskCount) taskCount.textContent = String(summary.taskCount)
}

function renderClusterOptions(clusters) {
  const select = document.getElementById('release-cluster')
  if (!select) return

  const currentValue = select.value

  if (!clusters.length) {
    select.innerHTML = '<option value="">请先纳管集群</option>'
    select.disabled = true
    return
  }

  select.disabled = false
  select.innerHTML = clusters.map(cluster => `
    <option value="${escapeHtml(cluster.name)}">${escapeHtml(cluster.name)} | ${escapeHtml(cluster.provider)} | ${escapeHtml(cluster.environment)}</option>
  `).join('')

  if (clusters.some(cluster => cluster.name === currentValue)) {
    select.value = currentValue
  }
}

function metaRows(items) {
  return items.map(item => `
    <div class="meta-row">
      <div class="meta-label">${escapeHtml(item.label)}</div>
      <div class="meta-value ${item.mono ? 'mono' : ''}">${escapeHtml(item.value)}</div>
    </div>
  `).join('')
}

function renderCardCollection(rootId, items, emptyText, renderItem) {
  const root = document.getElementById(rootId)
  if (!root) return

  if (!items.length) {
    root.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`
    return
  }

  root.innerHTML = items.map(renderItem).join('')
}

function renderClusters(clusters) {
  renderCardCollection(
    'clusters-container',
    clusters,
    '当前还没有任何集群被纳管。',
    cluster => `
      <article class="card">
        <div class="card-head">
          <div>
            <h3>${escapeHtml(cluster.name)}</h3>
            <div class="card-sub">${escapeHtml(cluster.provider)} / ${escapeHtml(cluster.region)} / ${escapeHtml(cluster.environment)}</div>
          </div>
          <span class="pill ${cluster.source === 'web' ? 'ok' : ''}">${cluster.source === 'web' ? 'Web Added' : 'Registry'}</span>
        </div>
        <div class="meta">
          ${metaRows([
            { label: 'Kube Context', value: cluster.kubeContext, mono: true },
            { label: 'Default Namespace', value: cluster.releaseNamespace },
            { label: 'Ingress Domain', value: cluster.ingressDomainSuffix, mono: true },
            { label: 'Notes', value: cluster.notes || '无' }
          ])}
        </div>
      </article>
    `
  )
}

function renderHomeClusters(clusters) {
  renderCardCollection(
    'home-clusters-preview',
    clusters.slice(0, 4),
    '当前还没有可预览的集群。',
    cluster => `
      <article class="card">
        <div class="card-head">
          <div>
            <h3>${escapeHtml(cluster.name)}</h3>
            <div class="card-sub">${escapeHtml(cluster.provider)} / ${escapeHtml(cluster.environment)}</div>
          </div>
          <span class="pill ${cluster.source === 'web' ? 'ok' : ''}">${cluster.source === 'web' ? 'WEB' : 'YAML'}</span>
        </div>
        <div class="meta">
          ${metaRows([
            { label: 'Region', value: cluster.region || '-' },
            { label: 'Namespace', value: cluster.releaseNamespace || '-' }
          ])}
        </div>
      </article>
    `
  )
}

function releaseTone(status) {
  if (status === 'deleted') return 'danger'
  if (status === 'rolled_back') return 'warn'
  return 'ok'
}

function renderReleases(releases) {
  renderCardCollection(
    'releases-container',
    releases,
    '当前没有已记录的发布栈。',
    release => `
      <article class="card">
        <div class="card-head">
          <div>
            <h3>${escapeHtml(release.appName)}</h3>
            <div class="card-sub">${escapeHtml(release.targetCluster)} / ${escapeHtml(release.targetNamespace)} / ${escapeHtml(release.environment || '-')}</div>
          </div>
          <span class="pill ${releaseTone(release.status)}">${escapeHtml(release.status)}</span>
        </div>
        <div class="meta">
          ${metaRows([
            { label: 'Ingress Host', value: release.ingressHost || '-', mono: true },
            { label: 'Frontend Image', value: release.frontendImage || '-', mono: true },
            { label: 'Backend Image', value: release.backendImage || '-', mono: true },
            { label: 'Last Action', value: release.lastAction || '-' },
            { label: 'Updated At', value: formatTime(release.updatedAt) },
            { label: 'Execution Mode', value: release.executionMode || '-' }
          ])}
        </div>
        <div class="actions">
          <button class="action-button secondary quick-action" data-action="update" data-app="${escapeHtml(release.appName)}" data-cluster="${escapeHtml(release.targetCluster)}" data-namespace="${escapeHtml(release.targetNamespace)}" data-tag="${escapeHtml(release.imageTag || 'latest')}" data-fe="${escapeHtml(release.frontendReplicas || '2')}" data-be="${escapeHtml(release.backendReplicas || '2')}">预填更新</button>
          <button class="action-button ghost quick-action" data-action="rollback" data-app="${escapeHtml(release.appName)}" data-cluster="${escapeHtml(release.targetCluster)}" data-namespace="${escapeHtml(release.targetNamespace)}" data-tag="${escapeHtml(release.imageTag || 'latest')}" data-fe="${escapeHtml(release.frontendReplicas || '2')}" data-be="${escapeHtml(release.backendReplicas || '2')}">预填回滚</button>
          <button class="action-button danger quick-action" data-action="delete" data-app="${escapeHtml(release.appName)}" data-cluster="${escapeHtml(release.targetCluster)}" data-namespace="${escapeHtml(release.targetNamespace)}" data-tag="${escapeHtml(release.imageTag || 'latest')}" data-fe="${escapeHtml(release.frontendReplicas || '2')}" data-be="${escapeHtml(release.backendReplicas || '2')}">预填删除</button>
        </div>
      </article>
    `
  )
}

function renderHomeReleases(releases) {
  renderCardCollection(
    'home-releases-preview',
    releases.slice(0, 4),
    '当前还没有整栈发布快照。',
    release => `
      <article class="card">
        <div class="card-head">
          <div>
            <h3>${escapeHtml(release.appName)}</h3>
            <div class="card-sub">${escapeHtml(release.targetCluster)} / ${escapeHtml(release.targetNamespace)}</div>
          </div>
          <span class="pill ${releaseTone(release.status)}">${escapeHtml(release.status)}</span>
        </div>
        <div class="meta">
          ${metaRows([
            { label: 'Image Tag', value: release.imageTag || '-' },
            { label: 'Last Action', value: release.lastAction || '-' },
            { label: 'Updated At', value: formatTime(release.updatedAt) }
          ])}
        </div>
      </article>
    `
  )
}

function taskTone(task) {
  if (task.status === 'failed') return 'danger'
  if (task.status === 'completed') return 'ok'
  return 'warn'
}

function renderTasks(tasks) {
  renderCardCollection(
    'tasks-container',
    tasks,
    '任务流暂时为空，执行一次纳管或发布后就会出现在这里。',
    task => `
      <article class="card">
        <div class="card-head">
          <div>
            <h3>${escapeHtml(task.summary)}</h3>
            <div class="card-sub">${escapeHtml(task.type)} / ${formatTime(task.createdAt)}</div>
          </div>
          <span class="pill ${taskTone(task)}">${escapeHtml(task.status)}</span>
        </div>
        <div class="meta">
          ${metaRows([
            { label: 'Task ID', value: task.id, mono: true },
            { label: 'Finished At', value: task.finishedAt ? formatTime(task.finishedAt) : '执行中' },
            { label: 'Log Count', value: String(task.logs.length) }
          ])}
        </div>
        <ul class="log-list">
          ${task.logs.map(log => `<li>${escapeHtml(log)}</li>`).join('')}
        </ul>
      </article>
    `
  )
}

function renderHomeTasks(tasks) {
  const root = document.getElementById('home-tasks-preview')
  if (!root) return

  if (!tasks.length) {
    root.innerHTML = '<div class="empty">最近还没有任务预览。</div>'
    return
  }

  root.innerHTML = tasks.slice(0, 4).map(task => `
    <article class="feed-item">
      <div class="feed-head">
        <div>
          <h3 class="feed-title">${escapeHtml(task.summary)}</h3>
          <p class="feed-copy">${escapeHtml(task.type)} / ${formatTime(task.createdAt)}</p>
        </div>
        <span class="pill ${taskTone(task)}">${escapeHtml(task.status)}</span>
      </div>
      <p class="feed-copy">${escapeHtml(task.logs[0] || '等待执行日志输出。')}</p>
    </article>
  `).join('')
}

// 一次拉取 dashboard 后，同时分发到首页概览和各功能页，避免前端重复请求。
function renderDashboard(dashboard) {
  state.dashboard = dashboard
  renderSummary(dashboard.summary)
  renderSidebarStats(dashboard.summary)
  renderClusterOptions(dashboard.clusters)
  renderHomeClusters(dashboard.clusters)
  renderClusters(dashboard.clusters)
  renderHomeReleases(dashboard.releases)
  renderReleases(dashboard.releases)
  renderHomeTasks(dashboard.tasks)
  renderTasks(dashboard.tasks)
}

function fillReleaseForm(dataset) {
  goToPage('release-workspace')
  document.getElementById('release-action').value = dataset.action || 'deploy'
  document.getElementById('release-app').value = dataset.app || 'demo-app'
  document.getElementById('release-cluster').value = dataset.cluster || ''
  document.getElementById('release-namespace').value = dataset.namespace || ''
  document.getElementById('release-tag').value = dataset.tag || 'latest'
  document.getElementById('release-fe-replicas').value = dataset.fe || '2'
  document.getElementById('release-be-replicas').value = dataset.be || '2'
  setStatus(`已将 ${dataset.app} 的 ${dataset.action} 操作参数填入发布控制工作区。`, 'info')
}

async function refreshDashboard() {
  const dashboard = await requestJson('/api/dashboard')
  renderDashboard(dashboard)
  setStatus(`控制面状态已刷新，当前执行模式为 ${dashboard.summary.executionMode}。`, 'success')
}

async function handleClusterSubmit(event) {
  event.preventDefault()
  const form = event.currentTarget
  const body = Object.fromEntries(new FormData(form).entries())
  setStatus(`正在纳管集群 ${body.name} ...`, 'info')
  const result = await requestJson('/api/clusters/onboard', { method: 'POST', body: JSON.stringify(body) })
  renderDashboard(result.dashboard)
  setStatus(result.message, 'success')
  form.reset()
  document.getElementById('cluster-provider').value = 'custom'
  document.getElementById('cluster-env').value = 'staging'
  document.getElementById('cluster-namespace').value = 'staging'
  document.getElementById('cluster-domain').value = 'apps.local'
}

async function handleReleaseSubmit(event) {
  event.preventDefault()
  const body = Object.fromEntries(new FormData(event.currentTarget).entries())
  setStatus(`正在执行 ${body.action}，目标应用 ${body.appName} ...`, 'info')
  const result = await requestJson('/api/releases/execute', { method: 'POST', body: JSON.stringify(body) })
  renderDashboard(result.dashboard)
  setStatus(result.message, 'success')
}

function bindNavigation() {
  document.body.addEventListener('click', event => {
    const button = event.target.closest('[data-page-link]')
    if (!button) return
    goToPage(button.dataset.pageLink)
  })

  window.addEventListener('hashchange', () => {
    setActivePage(resolvePageFromHash())
  })
}

function bindQuickActions() {
  document.body.addEventListener('click', event => {
    const button = event.target.closest('.quick-action')
    if (!button) return
    fillReleaseForm(button.dataset)
  })
}

async function bootstrap() {
  try {
    bindNavigation()
    bindQuickActions()

    document.getElementById('cluster-form').addEventListener('submit', event => handleClusterSubmit(event).catch(error => setStatus(error.message, 'error')))
    document.getElementById('release-form').addEventListener('submit', event => handleReleaseSubmit(event).catch(error => setStatus(error.message, 'error')))
    document.getElementById('refresh-dashboard').addEventListener('click', () => refreshDashboard().catch(error => setStatus(error.message, 'error')))

    if (!Object.values(routes).some(route => route.hash === window.location.hash)) {
      window.location.hash = routes.home.hash
    }

    setActivePage(resolvePageFromHash())
    await refreshDashboard()
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

bootstrap()
