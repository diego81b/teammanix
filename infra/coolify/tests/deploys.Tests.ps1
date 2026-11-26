# Pester 3.4 syntax (the version shipped with Windows PowerShell 5.1).
# Run: Invoke-Pester -Script infra/coolify/tests/deploys.Tests.ps1
. (Join-Path $PSScriptRoot '..\deploys.lib.ps1')

Describe 'Resolve-DeployEnv' {
  It 'defaults to staging' {
    Resolve-DeployEnv $null | Should BeExactly 'staging'
    Resolve-DeployEnv '' | Should BeExactly 'staging'
  }
  It 'keeps a valid name' {
    Resolve-DeployEnv 'prod' | Should BeExactly 'prod'
  }
  It 'rejects an invalid name' {
    { Resolve-DeployEnv 'Prod' } | Should Throw "Invalid environment name 'Prod'"
    { Resolve-DeployEnv '../x' } | Should Throw 'Invalid environment name'
  }
}

Describe 'Get-DeployAppName' {
  It 'follows local.name of main.tf' {
    Get-DeployAppName 'staging' | Should BeExactly 'teammanix-staging'
  }
}

Describe 'Test-DeploymentUuid' {
  It 'accepts a Coolify uuid' {
    Test-DeploymentUuid 'k0wc8sgk4oc0w8kw44ck8gs0' | Should Be $true
  }
  It 'rejects anything that could change the path' {
    Test-DeploymentUuid '../applications' | Should Be $false
    Test-DeploymentUuid 'a?b=1' | Should Be $false
    Test-DeploymentUuid '' | Should Be $false
  }
}

Describe 'ConvertTo-ItemList' {
  It 'reads the deployments of a {count, deployments} response' {
    $r = '{"count":2,"deployments":[{"deployment_uuid":"a"},{"deployment_uuid":"b"}]}' | ConvertFrom-Json
    $list = @(ConvertTo-ItemList $r 'deployments')
    $list.Count | Should Be 2
    $list[1].deployment_uuid | Should BeExactly 'b'
  }
  It 'accepts a bare array' {
    $r = '[{"uuid":"x"}]' | ConvertFrom-Json
    $list = @(ConvertTo-ItemList $r 'deployments')
    $list.Count | Should Be 1
    $list[0].uuid | Should BeExactly 'x'
  }
  It 'returns nothing for an empty list' {
    $r = '{"count":0,"deployments":[]}' | ConvertFrom-Json
    @(ConvertTo-ItemList $r 'deployments').Count | Should Be 0
  }
}

Describe 'Select-CoolifyApp' {
  $apps = '[{"uuid":"u1","name":"teammanix-prod"},{"uuid":"u2","name":"teammanix-staging"},{"uuid":"u3","name":"teammanix-staging-db"}]' | ConvertFrom-Json

  It 'returns the uuid of the application with the exact name' {
    Select-CoolifyApp $apps 'teammanix-staging' | Should BeExactly 'u2'
  }
  It 'fails when no application has the name' {
    { Select-CoolifyApp $apps 'teammanix-dev' } | Should Throw "No Coolify application named 'teammanix-dev'"
  }
  It 'fails when two applications have the name' {
    $dup = '[{"uuid":"u1","name":"teammanix-staging"},{"uuid":"u2","name":"teammanix-staging"}]' | ConvertFrom-Json
    { Select-CoolifyApp $dup 'teammanix-staging' } | Should Throw 'More than one'
  }
}

Describe 'Format-DeployDuration' {
  It 'formats minutes and seconds' {
    Format-DeployDuration '2026-11-26T10:00:00.000000Z' '2026-11-26T10:03:07.123456Z' | Should BeExactly '3m07s'
  }
  It 'adds hours when needed' {
    Format-DeployDuration '2026-11-26T10:00:00.000000Z' '2026-11-26T11:02:03.000000Z' | Should BeExactly '1h02m03s'
  }
  It 'is empty while the deployment runs' {
    Format-DeployDuration '2026-11-26T10:00:00.000000Z' $null | Should BeNullOrEmpty
  }
}

Describe 'Format-DeployRow' {
  $d = '{"deployment_uuid":"dep1","status":"finished","commit":"0123456789abcdef","commit_message":"fix: one\n\nbody","created_at":"2026-11-26T10:00:00.000000Z","finished_at":"2026-11-26T10:01:30.000000Z"}' | ConvertFrom-Json
  $row = Format-DeployRow $d

  It 'keeps uuid and status' {
    $row.Uuid | Should BeExactly 'dep1'
    $row.Status | Should BeExactly 'finished'
  }
  It 'shortens the commit to 7 characters' {
    $row.Commit | Should BeExactly '0123456'
  }
  It 'keeps only the first line of the message' {
    $row.Message | Should BeExactly 'fix: one'
  }
  It 'prints dates in UTC without fractions' {
    $row.Created | Should BeExactly '2026-11-26 10:00:00Z'
    $row.Finished | Should BeExactly '2026-11-26 10:01:30Z'
    $row.Duration | Should BeExactly '1m30s'
  }
  It 'survives missing commit, message and finish' {
    $r = Format-DeployRow ('{"deployment_uuid":"d","status":"in_progress","commit":null,"commit_message":null,"created_at":"2026-11-26T10:00:00.000000Z","finished_at":null}' | ConvertFrom-Json)
    $r.Commit | Should BeNullOrEmpty
    $r.Message | Should BeNullOrEmpty
    $r.Finished | Should BeNullOrEmpty
    $r.Duration | Should BeNullOrEmpty
  }
}

Describe 'Sort-Deployments' {
  It 'puts the newest first' {
    $list = '[{"deployment_uuid":"old","created_at":"2026-11-25T10:00:00.000000Z"},{"deployment_uuid":"new","created_at":"2026-11-26T10:00:00.000000Z"}]' | ConvertFrom-Json
    $sorted = @(Sort-Deployments $list)
    $sorted[0].deployment_uuid | Should BeExactly 'new'
    $sorted[1].deployment_uuid | Should BeExactly 'old'
  }
}

Describe 'Get-StatusExitCode' {
  It 'is 1 when the latest deployment failed' {
    Get-StatusExitCode @([pscustomobject]@{ status = 'failed' }, [pscustomobject]@{ status = 'finished' }) | Should Be 1
  }
  It 'is 0 when an older one failed' {
    Get-StatusExitCode @([pscustomobject]@{ status = 'finished' }, [pscustomobject]@{ status = 'failed' }) | Should Be 0
  }
  It 'is 0 without deployments' {
    Get-StatusExitCode @() | Should Be 0
  }
}

Describe 'ConvertFrom-DeployLogs' {
  It 'drops hidden lines and keeps the order' {
    $json = '[{"output":"a","type":"stdout","hidden":false,"timestamp":"2026-11-26T10:00:00.000000Z"},{"output":"token=x","type":"stdout","hidden":true,"timestamp":"2026-11-26T10:00:01.000000Z"},{"output":"b","type":"stderr","hidden":false,"timestamp":"2026-11-26T10:00:02.000000Z"}]'
    $lines = @(ConvertFrom-DeployLogs $json)
    $lines.Count | Should Be 2
    $lines[0].output | Should BeExactly 'a'
    $lines[1].output | Should BeExactly 'b'
  }
  It 'reads a single line array' {
    $lines = @(ConvertFrom-DeployLogs '[{"output":"only","type":"stdout","hidden":false,"timestamp":"2026-11-26T10:00:00.000000Z"}]')
    $lines.Count | Should Be 1
    $lines[0].output | Should BeExactly 'only'
  }
  It 'treats a missing hidden flag as visible' {
    @(ConvertFrom-DeployLogs '[{"output":"x","type":"stdout"}]').Count | Should Be 1
  }
  It 'returns nothing for an empty array, an empty string or null' {
    @(ConvertFrom-DeployLogs '[]').Count | Should Be 0
    @(ConvertFrom-DeployLogs '').Count | Should Be 0
    @(ConvertFrom-DeployLogs $null).Count | Should Be 0
  }
  It 'accepts logs already parsed' {
    $parsed = '[{"output":"a","type":"stdout","hidden":false},{"output":"s","type":"stdout","hidden":true}]' | ConvertFrom-Json
    $lines = @(ConvertFrom-DeployLogs $parsed)
    $lines.Count | Should Be 1
    $lines[0].output | Should BeExactly 'a'
  }
  It 'fails clearly on logs that are not JSON' {
    { ConvertFrom-DeployLogs 'not json' } | Should Throw 'not valid JSON'
  }
}

Describe 'Format-LogLine' {
  It 'prints timestamp, type and output' {
    $e = '{"output":"npm ci","type":"stdout","hidden":false,"timestamp":"2026-11-26T10:00:02.500000Z"}' | ConvertFrom-Json
    Format-LogLine $e | Should BeExactly '2026-11-26 10:00:02Z [stdout] npm ci'
  }
  It 'tolerates a missing timestamp' {
    $e = '{"output":"x","type":"stderr"}' | ConvertFrom-Json
    Format-LogLine $e | Should BeExactly '- [stderr] x'
  }
}

Describe 'ConvertFrom-CoolifyJson' {
  It 'parses a JSON body' {
    (ConvertFrom-CoolifyJson '{"a":1}' '/api/v1/applications').a | Should Be 1
  }
  It 'names the endpoint when the body is not JSON' {
    { ConvertFrom-CoolifyJson '<html>login</html>' '/api/v1/applications' } | Should Throw 'not JSON'
  }
  It 'fails on an empty body' {
    { ConvertFrom-CoolifyJson '' '/api/v1/applications' } | Should Throw 'empty'
  }
}

Describe 'Get-ApiErrorMessage' {
  It 'uses the message of a JSON body' {
    Get-ApiErrorMessage 404 '{"message":"Not found."}' '/api/v1/applications' | Should BeExactly 'Coolify GET /api/v1/applications failed (HTTP 404): Not found.'
  }
  It 'truncates a body that is not JSON' {
    $msg = Get-ApiErrorMessage 502 ('x' * 500) '/api/v1/deployments/abc'
    $msg | Should Match '^Coolify GET /api/v1/deployments/abc failed \(HTTP 502\): x+\.\.\.$'
    $msg.Length | Should BeLessThan 300
  }
  It 'explains a missing status' {
    Get-ApiErrorMessage $null $null '/api/v1/applications' | Should Match 'no response.*coolify-endpoint'
  }
  It 'adds a hint on 401' {
    Get-ApiErrorMessage 401 '' '/api/v1/applications' | Should BeExactly 'Coolify GET /api/v1/applications failed (HTTP 401). Check teammanix/coolify-token (credentials.ps1 check) and its read permission.'
  }
}
