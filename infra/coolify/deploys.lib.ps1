# Pure functions of deploys.ps1: no Credential Manager, no network, no exit. Tested by tests/deploys.Tests.ps1.

$script:Invariant = [Globalization.CultureInfo]::InvariantCulture

function Resolve-DeployEnv([string] $Value) {
  $name = if ($Value) { $Value } else { 'staging' }
  if ($name -cnotmatch '^[a-z][a-z0-9-]*$') { throw "Invalid environment name '$name'" }
  return $name
}

# Same as local.name in main.tf (project_name defaults to teammanix).
function Get-DeployAppName([string] $EnvName) { return "teammanix-$EnvName" }

function Test-DeploymentUuid([string] $Value) { return [bool]($Value -match '^[A-Za-z0-9-]+$') }

# Coolify answers either {count, <key>: [...]} or a bare array, depending on the endpoint and version.
function ConvertTo-ItemList($Response, [string] $Key) {
  if ($null -eq $Response) { return @() }
  if ($Response -is [array]) { return $Response }
  if ($Response.PSObject.Properties[$Key]) { return @($Response.$Key) }
  return @($Response)
}

function Select-CoolifyApp($Apps, [string] $Name) {
  $found = @(@($Apps) | Where-Object { $_.name -ceq $Name })
  if ($found.Count -eq 0) { throw "No Coolify application named '$Name'. Check TEAMMANIX_ENV and that the apply ran." }
  if ($found.Count -gt 1) { throw "More than one Coolify application named '$Name'." }
  return [string] $found[0].uuid
}

function ConvertTo-UtcDate([string] $Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  return [DateTimeOffset]::Parse($Value, $script:Invariant).ToUniversalTime()
}

function Format-UtcDate([string] $Value) {
  $d = ConvertTo-UtcDate $Value
  if ($null -eq $d) { return '' }
  return $d.ToString('yyyy-MM-dd HH:mm:ss', $script:Invariant) + 'Z'
}

function Format-DeployDuration([string] $CreatedAt, [string] $FinishedAt) {
  $start = ConvertTo-UtcDate $CreatedAt
  $end = ConvertTo-UtcDate $FinishedAt
  if ($null -eq $start -or $null -eq $end) { return '' }
  $span = $end - $start
  $seconds = [int][Math]::Floor($span.TotalSeconds)
  $h = [int][Math]::Floor($seconds / 3600)
  $m = [int][Math]::Floor(($seconds % 3600) / 60)
  $s = $seconds % 60
  if ($h -gt 0) { return '{0}h{1:00}m{2:00}s' -f $h, $m, $s }
  return '{0}m{1:00}s' -f $m, $s
}

function Format-DeployRow($Deployment) {
  $commit = [string] $Deployment.commit
  if ($commit.Length -gt 7) { $commit = $commit.Substring(0, 7) }
  $message = ([string] $Deployment.commit_message) -split "`r?`n" | Select-Object -First 1
  return [pscustomobject][ordered]@{
    Status   = [string] $Deployment.status
    Commit   = $commit
    Message  = [string] $message
    Created  = Format-UtcDate $Deployment.created_at
    Finished = Format-UtcDate $Deployment.finished_at
    Duration = Format-DeployDuration $Deployment.created_at $Deployment.finished_at
    Uuid     = [string] $Deployment.deployment_uuid
  }
}

# Newest first, whatever order the API used.
function Sort-Deployments($Deployments) {
  return @(@($Deployments) | Sort-Object -Property @{ Expression = { ConvertTo-UtcDate $_.created_at } } -Descending)
}

# Expects the list newest first.
function Get-StatusExitCode($Deployments) {
  $list = @($Deployments)
  if ($list.Count -gt 0 -and $list[0].status -eq 'failed') { return 1 }
  return 0
}

# The logs field is a JSON string of [{output, type, hidden, timestamp}]; hidden lines hold secrets and are dropped.
function ConvertFrom-DeployLogs($Logs) {
  if ($null -eq $Logs) { return @() }
  if ($Logs -is [string]) {
    if ([string]::IsNullOrWhiteSpace($Logs)) { return @() }
    try { $parsed = ConvertFrom-Json -InputObject $Logs }
    catch { throw 'The deployment logs are not valid JSON.' }
  } else {
    $parsed = $Logs
  }
  $visible = New-Object System.Collections.ArrayList
  foreach ($entry in @($parsed)) {
    if ($null -eq $entry) { continue }
    $hidden = $entry.PSObject.Properties['hidden'] -and [bool] $entry.hidden
    if (-not $hidden) { [void] $visible.Add($entry) }
  }
  return $visible.ToArray()
}

function Format-LogLine($Entry) {
  $when = Format-UtcDate $Entry.timestamp
  if (-not $when) { $when = '-' }
  return '{0} [{1}] {2}' -f $when, $Entry.type, $Entry.output
}

function ConvertFrom-CoolifyJson([string] $Content, [string] $Path) {
  if ([string]::IsNullOrWhiteSpace($Content)) { throw "Coolify GET $Path returned an empty body." }
  try { return ConvertFrom-Json -InputObject $Content }
  catch { throw "Coolify GET $Path returned a body that is not JSON. Check that teammanix/coolify-endpoint is the Coolify base URL." }
}

function Get-ApiErrorMessage($StatusCode, [string] $Body, [string] $Path) {
  if ($null -eq $StatusCode) {
    return "Coolify GET $Path failed with no response. Check teammanix/coolify-endpoint and the network."
  }
  $detail = ''
  if (-not [string]::IsNullOrWhiteSpace($Body)) {
    try {
      $json = ConvertFrom-Json -InputObject $Body
      if ($json.message) { $detail = [string] $json.message }
    } catch { }
    if (-not $detail) {
      $detail = $Body.Trim()
      if ($detail.Length -gt 200) { $detail = $detail.Substring(0, 200) + '...' }
    }
  }
  $msg = "Coolify GET $Path failed (HTTP $([int] $StatusCode))"
  if ($detail) { $msg += ": $detail" }
  if ([int] $StatusCode -eq 401 -or [int] $StatusCode -eq 403) {
    if (-not $msg.EndsWith('.')) { $msg += '.' }
    $msg += ' Check teammanix/coolify-token (credentials.ps1 check) and its read permission.'
  }
  return $msg
}
