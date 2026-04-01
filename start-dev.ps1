[CmdletBinding()]
param(
  [int]$FrontendPort = 39080,
  [int]$BackendPort = 39081,
  [int]$StartupTimeoutSeconds = 20
)

$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$tmpDir = Join-Path $projectRoot 'tmp'
$backendDir = Join-Path $projectRoot 'apps\backend'
$frontendProxyScript = Join-Path $tmpDir "frontend-proxy-$FrontendPort.mjs"
$stopScript = Join-Path $projectRoot 'stop-dev.ps1'

$backendStdout = Join-Path $tmpDir "backend-$BackendPort.out.log"
$backendStderr = Join-Path $tmpDir "backend-$BackendPort.err.log"
$frontendStdout = Join-Path $tmpDir "frontend-proxy-$FrontendPort.out.log"
$frontendStderr = Join-Path $tmpDir "frontend-proxy-$FrontendPort.err.log"
$backendPidFile = Join-Path $tmpDir "backend-$BackendPort.pid"
$frontendPidFile = Join-Path $tmpDir "frontend-proxy-$FrontendPort.pid"

function Wait-ForHttp {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,

    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 3 | Out-Null
      return $true
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  return $false
}

if (-not (Test-Path $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir | Out-Null
}

if (-not (Test-Path $backendDir)) {
  throw "Backend directory not found: $backendDir"
}

if (-not (Test-Path $frontendProxyScript)) {
  throw "Frontend proxy script not found: $frontendProxyScript"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'node command was not found in PATH.'
}

& $stopScript -FrontendPort $FrontendPort -BackendPort $BackendPort

Remove-Item $backendStdout,$backendStderr,$frontendStdout,$frontendStderr -ErrorAction SilentlyContinue

$previousPort = $env:PORT
try {
  $env:PORT = [string]$BackendPort
  $backendProcess = Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $backendDir -RedirectStandardOutput $backendStdout -RedirectStandardError $backendStderr -PassThru -WindowStyle Hidden
} finally {
  if ($null -eq $previousPort) {
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
  } else {
    $env:PORT = $previousPort
  }
}

if (-not (Wait-ForHttp -Url "http://127.0.0.1:$BackendPort/api/workbench" -TimeoutSeconds $StartupTimeoutSeconds)) {
  $stderr = if (Test-Path $backendStderr) { Get-Content $backendStderr -Raw } else { '' }
  throw "Backend did not become ready on port $BackendPort.`n$stderr"
}

Set-Content -Path $backendPidFile -Value $backendProcess.Id

$frontendProcess = Start-Process -FilePath node -ArgumentList $frontendProxyScript -WorkingDirectory $projectRoot -RedirectStandardOutput $frontendStdout -RedirectStandardError $frontendStderr -PassThru -WindowStyle Hidden

if (-not (Wait-ForHttp -Url "http://127.0.0.1:$FrontendPort/api/workbench" -TimeoutSeconds $StartupTimeoutSeconds)) {
  $stderr = if (Test-Path $frontendStderr) { Get-Content $frontendStderr -Raw } else { '' }
  throw "Frontend proxy did not become ready on port $FrontendPort.`n$stderr"
}

Set-Content -Path $frontendPidFile -Value $frontendProcess.Id

Write-Host "Backend ready:  http://127.0.0.1:$BackendPort"
Write-Host "Frontend ready: http://127.0.0.1:$FrontendPort"
Write-Host "Backend log:    $backendStdout"
Write-Host "Frontend log:   $frontendStdout"
