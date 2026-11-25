<#
  Manages the credentials of infra/coolify in the Windows Credential Manager. Run it in your own terminal: the values
  are typed at a hidden prompt (or generated) and never go through a command line, a file or Claude Code.

    .\infra\coolify\credentials.ps1 set coolify-endpoint          # https://coolify.example.com, no trailing slash
    .\infra\coolify\credentials.ps1 set coolify-token             # root token of Coolify
    .\infra\coolify\credentials.ps1 set github-token              # fine-grained GitHub token of the repository
    .\infra\coolify\credentials.ps1 new-passphrase staging        # generates the state passphrase, stores it, prints it once
    .\infra\coolify\credentials.ps1 check [staging]               # which entries exist, never the values
    .\infra\coolify\credentials.ps1 remove <name>

  Entries are generic credentials called "teammanix/<name>". The passphrase of an environment is named
  "teammanix-<env>-tofu-passphrase".
#>

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'credman.ps1')

function Read-HiddenValue([string] $Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringUni($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($ptr) }
}

function Assert-Name([string] $Name) {
  if ($Name -notmatch '^[a-z][a-z0-9-]*$') { throw "Invalid name '$Name'. Use lowercase letters, digits and dashes." }
}

$action = if ($args.Count -gt 0) { [string] $args[0] } else { '' }
$arg = if ($args.Count -gt 1) { [string] $args[1] } else { '' }

switch ($action) {
  'set' {
    Assert-Name $arg
    $value = if ($arg -eq 'coolify-endpoint') { (Read-Host 'Coolify URL').Trim().TrimEnd('/') } else { Read-HiddenValue "Value of $arg" }
    Set-CredSecret $arg $value
    "Stored teammanix/$arg"
  }
  'new-passphrase' {
    $envName = if ($arg) { $arg } else { 'staging' }
    Assert-Name $envName
    $name = "teammanix-$envName-tofu-passphrase"
    if (Get-CredSecret $name) { throw "'$name' already exists. Replacing it makes the existing state unreadable: remove it first only if you mean it." }
    $bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $passphrase = [Convert]::ToBase64String($bytes)
    Set-CredSecret $name $passphrase
    "Stored teammanix/$name. Copy the value into the password manager now, it is not shown again:"
    $passphrase
  }
  'check' {
    $envName = if ($arg) { $arg } else { 'staging' }
    Assert-Name $envName
    foreach ($name in @('coolify-endpoint', 'coolify-token', 'github-token', "teammanix-$envName-tofu-passphrase")) {
      $state = if (Get-CredSecret $name) { 'ok     ' } else { 'MISSING' }
      "$state teammanix/$name"
    }
  }
  'remove' {
    Assert-Name $arg
    if (Remove-CredSecret $arg) { "Removed teammanix/$arg" } else { "teammanix/$arg did not exist" }
  }
  default {
    throw "Usage: credentials.ps1 set <name> | new-passphrase [env] | check [env] | remove <name>"
  }
}
