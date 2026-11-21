<#
  Runs tofu with the Coolify credentials taken from the PowerShell SecretStore, so no token lives in a file or in a
  permanent environment variable. The secrets reach only this process and its child, and are removed on exit.

  Usage, from anywhere:
    .\infra\coolify\tofu.ps1 init
    .\infra\coolify\tofu.ps1 plan
    .\infra\coolify\tofu.ps1 apply
    .\infra\coolify\tofu.ps1 apply -var domains_enabled=true
    $env:TEAMMANIX_ENV = 'production'; .\infra\coolify\tofu.ps1 plan    # default environment: staging

  Secrets expected in the default vault (see README.md):
    coolify-endpoint                     base URL of Coolify, no trailing slash
    coolify-token                        API token with the root permission
    teammanix-<env>-tofu-passphrase      state encryption passphrase, 16 characters at least

  Also used when present, never created here:
    ../../secrets/<env>/secrets.json     becomes TF_VAR_secrets
    <env>.tfvars                         non secret variables (server_uuid, domain, deploy_key_file), see <env>.tfvars.example

  One tofu workspace per environment, so the states never mix.
#>

$ErrorActionPreference = 'Stop'

$envName = if ($env:TEAMMANIX_ENV) { $env:TEAMMANIX_ENV } else { 'staging' }
if ($envName -notmatch '^[a-z][a-z0-9-]*$') { throw "Invalid environment name '$envName'" }

if (-not (Get-Command tofu -ErrorAction SilentlyContinue)) {
  throw "tofu not found. Install it: winget install OpenTofu.Tofu"
}
try {
  Import-Module Microsoft.PowerShell.SecretManagement -ErrorAction Stop
} catch {
  throw "SecretManagement module missing. See infra/coolify/README.md, section 'Credentials'."
}

function Get-TofuSecret([string] $Name) {
  try {
    $value = Get-Secret -Name $Name -AsPlainText -ErrorAction Stop
  } catch {
    throw "Secret '$Name' not found in the default vault. See infra/coolify/README.md, section 'Credentials'."
  }
  if ([string]::IsNullOrWhiteSpace($value)) { throw "Secret '$Name' is empty." }
  return $value
}

# HCL string escapes for the passphrase: backslash, quote, and the two template openers.
function ConvertTo-HclString([string] $Value) {
  return $Value.Replace('\', '\\').Replace('"', '\"').Replace('${', '$${').Replace('%{', '%%{')
}

$names = @('COOLIFY_ENDPOINT', 'COOLIFY_TOKEN', 'TF_ENCRYPTION', 'TF_VAR_secrets', 'TF_WORKSPACE')
$code = 1
Push-Location $PSScriptRoot
try {
  $env:COOLIFY_ENDPOINT = (Get-TofuSecret 'coolify-endpoint').TrimEnd('/')
  $env:COOLIFY_TOKEN = Get-TofuSecret 'coolify-token'
  $passphrase = ConvertTo-HclString (Get-TofuSecret "teammanix-$envName-tofu-passphrase")
  $env:TF_ENCRYPTION = "key_provider `"pbkdf2`" `"main`" { passphrase = `"$passphrase`" }"

  $secretsFile = Join-Path $PSScriptRoot "..\..\secrets\$envName\secrets.json"
  if (Test-Path $secretsFile) { $env:TF_VAR_secrets = (Get-Content -Raw -Path $secretsFile) }

  $command = if ($args.Count -gt 0) { [string] $args[0] } else { '' }
  $rest = @($args | Select-Object -Skip 1)

  # The variable files only exist for the commands that take variables.
  $takesVars = @('plan', 'apply', 'destroy', 'refresh', 'import', 'console') -contains $command
  $tfvars = Join-Path $PSScriptRoot "$envName.tfvars"
  if ($takesVars -and (Test-Path $tfvars)) { $rest = @("-var-file=$tfvars") + $rest }

  if ($command -eq 'init') {
    & tofu init @rest
    if ($LASTEXITCODE -eq 0) { & tofu workspace select -or-create $envName }
  } else {
    $env:TF_WORKSPACE = $envName
    if ($command) { & tofu $command @rest } else { & tofu }
  }
  $code = $LASTEXITCODE
} finally {
  foreach ($n in $names) { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
  Pop-Location
}
exit $code
