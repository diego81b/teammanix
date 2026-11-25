# Configuration logic against a mocked provider: no Coolify, no token, no passphrase.
# Run from infra/coolify: tofu init -backend=false (once), then tofu test.

mock_provider "coolify" {
  mock_resource "coolify_project" {
    defaults = { uuid = "11111111-1111-4111-8111-111111111111" }
  }
  mock_resource "coolify_environment" {
    defaults = { uuid = "22222222-2222-4222-8222-222222222222" }
  }
  mock_resource "coolify_private_key" {
    defaults = { uuid = "33333333-3333-4333-8333-333333333333" }
  }
  mock_resource "coolify_database_postgresql" {
    defaults = {
      uuid            = "44444444-4444-4444-8444-444444444444"
      internal_db_url = "postgres://teammanix:mock@db:5432/teammanix"
    }
  }
  mock_resource "coolify_application_private_git" {
    defaults = { uuid = "55555555-5555-4555-8555-555555555555" }
  }
  mock_resource "coolify_s3_storage" {
    defaults = { uuid = "66666666-6666-4666-8666-666666666666" }
  }
}

mock_provider "github" {
  mock_data "github_branch" {
    defaults = { sha = "0123456789abcdef0123456789abcdef01234567" }
  }
}

mock_provider "random" {}

variables {
  environment     = "staging"
  coolify_url     = "https://coolify.example.test"
  server_uuid     = "77777777-7777-4777-8777-777777777777"
  domain          = "staging.example.test"
  deploy_key_file = "tests/placeholder_deploy_key"
  secrets = {
    JWT_SECRET                  = "jwt-value"
    BREVO_API_KEY               = "brevo-value"
    MAIL_FROM_NAME              = ""
    BACKUP_S3_ENDPOINT          = "https://s3.example.test"
    BACKUP_S3_REGION            = "eu-central-1"
    BACKUP_S3_BUCKET            = "backups"
    BACKUP_S3_ACCESS_KEY_ID     = "backup-key-id"
    BACKUP_S3_SECRET_ACCESS_KEY = "backup-secret"
  }
}

run "first_plan" {
  command = plan

  assert {
    condition = toset(keys(coolify_environment_variable.app)) == toset([
      "JWT_SECRET", "BREVO_API_KEY", "DATABASE_URL", "APP_URL", "ALLOWED_ORIGINS",
    ])
    error_message = "The application must get its own keys and the computed ones: no BACKUP_S3_* and no empty key."
  }
}

# tofu.ps1 sets var.environment from TEAMMANIX_ENV; the Coolify names must follow it, never a leftover default.
run "prod_names" {
  command = plan

  variables {
    environment = "prod"
  }

  assert {
    condition = (
      coolify_project.this.name == "teammanix-prod"
      && coolify_environment.this.name == "prod"
      && coolify_private_key.deploy.name == "teammanix-prod-deploy"
    )
    error_message = "A prod environment must create project teammanix-prod, environment prod and its own deploy key name."
  }
}

run "backup_schedule" {
  command = plan

  assert {
    condition = (
      coolify_database_backup.db.frequency == "0 3 * * *"
      && coolify_database_backup.db.save_s3 == true
      && coolify_database_backup.db.s3_storage_uuid == coolify_s3_storage.backup.uuid
      && coolify_database_backup.db.retain_days_s3 == 30
      && coolify_database_backup.db.retain_days_locally == 7
    )
    error_message = "The backup must upload to the dedicated storage with the default schedule and retention."
  }
}

run "apply" {
  command = apply

  assert {
    condition = toset(keys(coolify_environment_variable.app)) == toset([
      "JWT_SECRET", "BREVO_API_KEY", "DATABASE_URL", "APP_URL", "ALLOWED_ORIGINS",
    ])
    error_message = "What the plan promised must be what the apply creates."
  }
}

run "removed_key" {
  command = plan

  variables {
    secrets = {
      JWT_SECRET                  = "jwt-value"
      MAIL_FROM_NAME              = ""
      BACKUP_S3_ENDPOINT          = "https://s3.example.test"
      BACKUP_S3_REGION            = "eu-central-1"
      BACKUP_S3_BUCKET            = "backups"
      BACKUP_S3_ACCESS_KEY_ID     = "backup-key-id"
      BACKUP_S3_SECRET_ACCESS_KEY = "backup-secret"
    }
  }

  assert {
    condition = toset(keys(coolify_environment_variable.app)) == toset([
      "JWT_SECRET", "DATABASE_URL", "APP_URL", "ALLOWED_ORIGINS",
    ])
    error_message = "A key removed from secrets must leave exactly that instance out of the set."
  }
}

run "empty_backup_key" {
  command = plan

  variables {
    secrets = {
      JWT_SECRET                  = "jwt-value"
      BACKUP_S3_ENDPOINT          = "https://s3.example.test"
      BACKUP_S3_REGION            = "eu-central-1"
      BACKUP_S3_BUCKET            = ""
      BACKUP_S3_ACCESS_KEY_ID     = "backup-key-id"
      BACKUP_S3_SECRET_ACCESS_KEY = "backup-secret"
    }
  }

  expect_failures = [coolify_s3_storage.backup]

  assert {
    condition     = local.backup_missing == ["BACKUP_S3_BUCKET"]
    error_message = "Only the empty backup key must be reported."
  }

  assert {
    condition     = strcontains(local.backup_error, "BACKUP_S3_BUCKET") && !strcontains(local.backup_error, "BACKUP_S3_REGION")
    error_message = "The error text must name the empty key and no other."
  }
}

run "absent_backup_key_is_named" {
  command = plan

  variables {
    secrets = {
      JWT_SECRET                  = "jwt-value"
      BACKUP_S3_ENDPOINT          = "https://s3.example.test"
      BACKUP_S3_REGION            = "eu-central-1"
      BACKUP_S3_BUCKET            = "backups"
      BACKUP_S3_SECRET_ACCESS_KEY = "backup-secret"
    }
  }

  expect_failures = [coolify_s3_storage.backup]

  assert {
    condition     = local.backup_missing == ["BACKUP_S3_ACCESS_KEY_ID"]
    error_message = "A backup key absent from secrets must be reported like an empty one."
  }

  assert {
    condition     = strcontains(local.backup_error, "BACKUP_S3_ACCESS_KEY_ID")
    error_message = "The error text must name the absent key."
  }
}

# Every value is distinct, so a swapped field cannot pass.
run "backup_storage_mapping" {
  command = plan

  assert {
    condition = (
      coolify_s3_storage.backup.endpoint == "https://s3.example.test"
      && coolify_s3_storage.backup.region == "eu-central-1"
      && coolify_s3_storage.backup.bucket == "backups"
      && nonsensitive(coolify_s3_storage.backup.key) == "backup-key-id"
      && nonsensitive(coolify_s3_storage.backup.secret) == "backup-secret"
    )
    error_message = "Each BACKUP_S3_* value must reach its own field of the backup storage."
  }
}

# Staging: the checks guard the deploy branch, nothing restricts who pushes it.
run "staging_github" {
  command = plan

  variables {
    git_branch = "staging"
  }

  assert {
    condition = (
      local.github_owner == "diego81b" && local.github_name == "teammanix"
      && github_repository_ruleset.checks.conditions[0].ref_name[0].include == tolist(["refs/heads/staging"])
      && length(github_repository_ruleset.release) == 0
    )
    error_message = "Staging must require the checks on its own branch and create no release ruleset."
  }

  assert {
    condition = (
      toset([for c in github_repository_ruleset.checks.rules[0].required_status_checks[0].required_check : c.context]) == toset(["api", "web"])
      && alltrue([for c in github_repository_ruleset.checks.rules[0].required_status_checks[0].required_check : c.integration_id == 15368])
    )
    error_message = "The required checks must be the CI jobs, reported by GitHub Actions."
  }

  assert {
    condition = (
      github_repository_webhook.deploy.configuration[0].url == "https://coolify.example.test/webhooks/source/github/events/manual?environment=staging"
      && github_repository_webhook.deploy.events == toset(["push"])
    )
    error_message = "The webhook must send pushes to the manual GitHub endpoint of Coolify, unique per environment."
  }
}

# Prod: the checks guard main, and only the release workflow (or an admin) moves the deploy branch.
run "prod_github" {
  command = plan

  variables {
    environment    = "prod"
    git_branch     = "production"
    release_branch = "main"
  }

  assert {
    condition     = github_repository_ruleset.checks.conditions[0].ref_name[0].include == tolist(["refs/heads/main"])
    error_message = "Prod must require the checks on the branch the tags are cut from."
  }

  assert {
    condition = (
      github_repository_ruleset.release[0].conditions[0].ref_name[0].include == tolist(["refs/heads/production"])
      && github_repository_ruleset.release[0].rules[0].update == true
      && toset([for a in github_repository_ruleset.release[0].bypass_actors : "${a.actor_type}:${a.actor_id}"]) == toset(["Integration:15368", "RepositoryRole:5"])
    )
    error_message = "The prod deploy branch must accept pushes only from GitHub Actions and admins."
  }

  assert {
    condition     = endswith(github_repository_webhook.deploy.configuration[0].url, "?environment=prod")
    error_message = "The prod webhook URL must differ from the staging one."
  }
}

# Coolify verifies each push with the secret GitHub signs it with: both must be the same value.
run "webhook_secret_shared" {
  command = apply

  assert {
    condition     = nonsensitive(coolify_application_private_git.app.manual_webhook_secret_github == github_repository_webhook.deploy.configuration[0].secret)
    error_message = "Coolify and GitHub must share the webhook secret."
  }
}

run "missing_deploy_branch" {
  command = plan

  override_data {
    target = data.github_branch.deploy
    values = { sha = "" }
  }

  expect_failures = [coolify_application_private_git.app]
}
