<#
  Coolify deployments of an environment, from the terminal. Credentials come from the Windows Credential Manager, as in
  tofu.ps1; the token stays in a local variable of this process, never in a file, an environment variable or the output.

  Usage, from anywhere:
    .\infra\coolify\deploys.ps1 status              # last 5 deployments; exit code 1 if the latest failed
    .\infra\coolify\deploys.ps1 status -Take 10
    .\infra\coolify\deploys.ps1 logs                # log of the latest deployment
    .\infra\coolify\deploys.ps1 logs <deployment_uuid>
    $env:TEAMMANIX_ENV = 'prod'; .\infra\coolify\deploys.ps1 status    # default environment: staging

  Entries read from the Credential Manager: teammanix/coolify-endpoint, teammanix/coolify-token.
  Lines Coolify marks as hidden (secrets) are never printed.
#>
param(
  [Parameter(Position = 0)][ValidateSet('status', 'logs')][string] $Command = 'status',
  [Parameter(Position = 1)][string] $DeploymentUuid,
  [ValidateRange(1, 100)][int] $Take = 5
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploys.lib.ps1')

function Invoke-Coolify([string] $Endpoint, [string] $Token, [string] $Path) {
  $status = $null
  $body = $null
  try {
    $r = Invoke-WebRequest -Uri "$Endpoint$Path" -Method Get -UseBasicParsing -MaximumRedirection 0 `
      -Headers @{ Authorization = "Bearer $Token"; Accept = 'application/json' }
    $content = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  } catch {
    # Only status and body leave this block: the original error is never rethrown.
    $response = $_.Exception.Response
    if ($response) {
      $status = [int] $response.StatusCode
      if ($response -is [System.Net.WebResponse]) {
        try { $body = (New-Object System.IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)).ReadToEnd() } catch { }
      }
    }
    if (-not $body -and $_.ErrorDetails) { $body = $_.ErrorDetails.Message }
    throw (Get-ApiErrorMessage $status $body $Path)
  }
  return ConvertFrom-CoolifyJson $content $Path
}

function Get-RequiredSecret([string] $Name) {
  $value = Get-CredSecret $Name
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Credential 'teammanix/$Name' not found. Run .\infra\coolify\credentials.ps1 check (README.md, section 'Credentials')."
  }
  return $value
}

$code = 1
$token = $null
try {
  $envName = Resolve-DeployEnv $env:TEAMMANIX_ENV
  if ($DeploymentUuid -and -not (Test-DeploymentUuid $DeploymentUuid)) { throw "Invalid deployment uuid '$DeploymentUuid'" }
  if ($PSVersionTable.PSVersion.Major -lt 6) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  }

  . (Join-Path $PSScriptRoot 'credman.ps1')
  $endpoint = (Get-RequiredSecret 'coolify-endpoint').TrimEnd('/')
  $token = Get-RequiredSecret 'coolify-token'

  $appName = Get-DeployAppName $envName
  $appUuid = Select-CoolifyApp (ConvertTo-ItemList (Invoke-Coolify $endpoint $token '/api/v1/applications') 'applications') $appName
  $take = if ($Command -eq 'status') { $Take } else { 1 }

  $deployments = @()
  if ($Command -eq 'status' -or -not $DeploymentUuid) {
    $list = Invoke-Coolify $endpoint $token "/api/v1/deployments/applications/${appUuid}?skip=0&take=$take"
    $deployments = @(Sort-Deployments (ConvertTo-ItemList $list 'deployments'))
  }

  if ($deployments.Count -eq 0 -and -not $DeploymentUuid) {
    Write-Host "No deployments for $appName."
    $code = 0
  } elseif ($Command -eq 'status') {
    Write-Host "$appName ($endpoint)"
    $deployments | ForEach-Object { Format-DeployRow $_ } | Format-Table -AutoSize -Wrap | Out-String -Width 200 | Write-Host
    $code = Get-StatusExitCode $deployments
  } else {
    $uuid = if ($DeploymentUuid) { $DeploymentUuid } else { [string] $deployments[0].deployment_uuid }
    $deployment = Invoke-Coolify $endpoint $token "/api/v1/deployments/$uuid"
    Write-Host "$appName deployment $uuid, status $($deployment.status)"
    foreach ($line in (ConvertFrom-DeployLogs $deployment.logs)) { Write-Output (Format-LogLine $line) }
    $code = 0
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  $code = 1
} finally {
  $token = $null
}
exit $code
