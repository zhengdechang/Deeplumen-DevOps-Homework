[CmdletBinding()]
param(
  [int]$FrontendPort = 39080,
  [int]$BackendPort = 39081
)

$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$tmpDir = Join-Path $projectRoot 'tmp'

$managedFiles = @(
  (Join-Path $tmpDir "frontend-proxy-$FrontendPort.pid"),
  (Join-Path $tmpDir "backend-$BackendPort.pid")
)

function Get-ListeningPids {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  $lines = netstat -ano | Select-String "LISTENING\s+[0-9]+$"
  $pids = @()

  foreach ($line in $lines) {
    if ($line.Line -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
      $pids += [int]$matches[1]
    }
  }

  return $pids | Sort-Object -Unique
}

function Stop-ProcessSafely {
  param(
    [Parameter(Mandatory = $true)]
    [int]$ProcessId,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) {
    Write-Host "$Label process $ProcessId is already stopped."
    return
  }

  Stop-Process -Id $ProcessId -Force
  Write-Host "Stopped $Label process $ProcessId."
}

function Stop-ManagedPort {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $pids = Get-ListeningPids -Port $Port
  if (-not $pids.Count) {
    Write-Host "$Label port $Port is already free."
    return
  }

  foreach ($processId in $pids) {
    Stop-ProcessSafely -ProcessId $processId -Label "$Label on port $Port"
  }
}

Stop-ManagedPort -Port $FrontendPort -Label 'frontend proxy'
Stop-ManagedPort -Port $BackendPort -Label 'backend api'

foreach ($file in $managedFiles) {
  if (Test-Path $file) {
    Remove-Item $file -Force
  }
}

Write-Host 'Dev preview stack has been stopped.'


