<#
  Runs tofu with the Coolify credentials taken from the Windows Credential Manager, so no token lives in a file or in a
  permanent environment variable. The secrets reach only this process and its child, and are removed on exit.

  Usage, from anywhere:
    .\infra\coolify\tofu.ps1 init
    .\infra\coolify\tofu.ps1 plan
    .\infra\coolify\tofu.ps1 apply
    .\infra\coolify\tofu.ps1 apply -var domains_enabled=true
    $env:TEAMMANIX_ENV = 'prod'; .\infra\coolify\tofu.ps1 plan    # default environment: staging

  Entries expected in the Credential Manager, stored with credentials.ps1 (see README.md):
    teammanix/coolify-endpoint                     base URL of Coolify, no trailing slash
    teammanix/coolify-token                        API token with the root permission
    teammanix/teammanix-<env>-tofu-passphrase      state encryption passphrase
    teammanix/github-token                         fine-grained token of the repository (Administration, Webhooks:
                                                   read and write, Contents and Metadata: read). Optional for plan,
                                                   required to apply the GitHub resources (github.tf)

  Also used when present, never created here:
    ../../secrets/<env>/secrets.json     becomes TF_VAR_secrets
    <env>.tfvars                         non secret variables (server_uuid, domain, deploy_key_file), see <env>.tfvars.example

  One tofu workspace per environment, so the states never mix. The same name reaches tofu as var.environment
  (TF_VAR_environment), so the workspace, the Coolify project (teammanix-<env>) and the Coolify environment always agree.
#>

$ErrorActionPreference = 'Stop'

$envName = if ($env:TEAMMANIX_ENV) { $env:TEAMMANIX_ENV } else { 'staging' }
if ($envName -cnotmatch '^[a-z][a-z0-9-]*$') { throw "Invalid environment name '$envName'" }

if (-not (Get-Command tofu -ErrorAction SilentlyContinue)) {
  throw "tofu not found. Install it: winget install OpenTofu.Tofu"
}
. (Join-Path $PSScriptRoot 'credman.ps1')

function Get-TofuSecret([string] $Name) {
  $value = Get-CredSecret $Name
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Credential 'teammanix/$Name' not found. Run .\infra\coolify\credentials.ps1 check (README.md, section 'Credentials')."
  }
  return $value
}

# HCL string escapes for the passphrase: backslash, quote, and the two template openers.
function ConvertTo-HclString([string] $Value) {
  return $Value.Replace('\', '\\').Replace('"', '\"').Replace('${', '$${').Replace('%{', '%%{')
}

$names = @('COOLIFY_ENDPOINT', 'COOLIFY_TOKEN', 'TF_ENCRYPTION', 'TF_VAR_secrets', 'TF_VAR_environment', 'TF_VAR_coolify_url', 'TF_WORKSPACE', 'GITHUB_TOKEN')
$code = 1
Push-Location $PSScriptRoot
try {
  $env:COOLIFY_ENDPOINT = (Get-TofuSecret 'coolify-endpoint').TrimEnd('/')
  $env:TF_VAR_coolify_url = $env:COOLIFY_ENDPOINT
  $env:COOLIFY_TOKEN = Get-TofuSecret 'coolify-token'
  $env:TF_VAR_environment = $envName
  $githubToken = Get-CredSecret 'github-token'
  if ($githubToken) { $env:GITHUB_TOKEN = $githubToken }
  else { Write-Warning "teammanix/github-token not found: GitHub is read anonymously, an apply of github.tf fails." }
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
