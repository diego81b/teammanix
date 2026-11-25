# GitHub side of continuous deployment: the push webhook that tells Coolify to deploy, and the rulesets on the branches
# that feed this environment. Every object is scoped to this environment's branch, so the staging and prod workspaces
# never manage the same one.
#
# The token comes from GITHUB_TOKEN (tofu.ps1 reads teammanix/github-token from the Credential Manager). Without it,
# plan still works on the public repository, and apply fails on the GitHub resources.

locals {
  github_repo  = regex("github\\.com[:/]([^/]+)/([^/]+?)(?:\\.git)?$", var.git_repository)
  github_owner = local.github_repo[0]
  github_name  = local.github_repo[1]

  # App id of GitHub Actions: pins the required checks to the CI workflow and lets the release workflow move the
  # deploy branch of prod.
  github_actions_app_id = 15368

  # Staging: the checks guard the deploy branch itself. Prod: they guard the branch the tags are cut from, and the
  # deploy branch moves only through the release workflow.
  checked_branch = coalesce(var.release_branch, var.git_branch)

  # Coolify endpoint for manual GitHub webhooks. The query string only makes the URL unique per environment, because
  # GitHub refuses two hooks with the same URL on one repository; Coolify ignores it.
  webhook_url = "${var.coolify_url}/webhooks/source/github/events/manual?environment=${var.environment}"
}

provider "github" {
  owner = local.github_owner
}

# The deploy branch is plain git history, not infrastructure: it is created with git (staging) or by the release
# workflow (prod), never here, so a destroy can never delete it. This only stops the plan when it is missing.
data "github_branch" "deploy" {
  repository = local.github_name
  branch     = var.git_branch
}

# Shared by Coolify and GitHub: Coolify checks the signature of each push against it.
resource "random_password" "webhook" {
  length  = 40
  special = false
}

resource "github_repository_webhook" "deploy" {
  repository = local.github_name
  events     = ["push"]
  active     = true

  configuration {
    url          = local.webhook_url
    content_type = "json"
    secret       = random_password.webhook.result
    insecure_ssl = false
  }
}

resource "github_repository_ruleset" "checks" {
  name        = "${local.name}-checks"
  repository  = local.github_name
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["refs/heads/${local.checked_branch}"]
      exclude = []
    }
  }

  rules {
    deletion         = true
    non_fast_forward = true

    required_status_checks {
      strict_required_status_checks_policy = false

      dynamic "required_check" {
        for_each = var.required_checks
        content {
          context        = required_check.value
          integration_id = local.github_actions_app_id
        }
      }
    }
  }
}

# Prod only: nobody pushes the deploy branch but the release workflow, and an admin in an emergency.
resource "github_repository_ruleset" "release" {
  count = var.release_branch == null ? 0 : 1

  name        = "${local.name}-release"
  repository  = local.github_name
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["refs/heads/${var.git_branch}"]
      exclude = []
    }
  }

  bypass_actors {
    actor_id    = local.github_actions_app_id
    actor_type  = "Integration"
    bypass_mode = "always"
  }

  bypass_actors {
    actor_id    = 5 # repository admin role
    actor_type  = "RepositoryRole"
    bypass_mode = "always"
  }

  rules {
    deletion         = true
    non_fast_forward = true
    update           = true
  }
}
