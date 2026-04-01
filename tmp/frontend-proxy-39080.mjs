import { createServer, request as httpRequest } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const frontendRoot = 'd:/code/devops-homework/apps/frontend'
const backendHost = '127.0.0.1'
const backendPort = 39081
const listenPort = 39080

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
}

function safePath(urlPath) {
  if (urlPath === '/') return join(frontendRoot, 'index.html')
  const normalized = normalize(urlPath).replace(/^([\\/])+/, '')
  return join(frontendRoot, normalized)
}

function proxyApi(req, res) {
  const upstream = httpRequest({
    host: backendHost,
    port: backendPort,
    path: req.url,
    method: req.method,
    headers: req.headers
  }, upstreamRes => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers)
    upstreamRes.pipe(res)
  })

  upstream.on('error', error => {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'backend_unavailable', detail: error.message }))
  })

  req.pipe(upstream)
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400)
    res.end('Bad Request')
    return
  }

  if (req.url.startsWith('/api')) {
    proxyApi(req, res)
    return
  }

  try {
    const filePath = safePath(req.url.split('?')[0])
    const body = await readFile(filePath)
    const type = contentTypes[extname(filePath)] || 'application/octet-stream'
    res.writeHead(200, { 'content-type': type })
    res.end(body)
  } catch {
    try {
      const body = await readFile(join(frontendRoot, 'index.html'))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(body)
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`Frontend proxy failed: ${error.message}`)
    }
  }
})

server.listen(listenPort, '127.0.0.1', () => {
  console.log(`Frontend proxy listening on http://127.0.0.1:${listenPort}`)
})