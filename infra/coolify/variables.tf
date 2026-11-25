variable "environment" {
  description = "Environment name, one per state: staging now, prod later. No default: tofu.ps1 sets it from TEAMMANIX_ENV (TF_VAR_environment), the same name as the workspace."
  type        = string
}

variable "project_name" {
  type    = string
  default = "teammanix"
}

variable "server_uuid" {
  description = "UUID of the Coolify server (the id in the server page URL)."
  type        = string
}

variable "destination_uuid" {
  description = "Docker network (destination) of the server. Leave null when the server has one; the compose file joins the 'coolify' network."
  type        = string
  default     = null
}

variable "domain" {
  description = "Host name of the whole app, without scheme, for example staging.example.com. The web takes the root, the api takes /api."
  type        = string
}

variable "git_repository" {
  description = "SSH URL of the repository, cloned with the deploy key."
  type        = string
  default     = "git@github.com:diego81b/teammanix.git"
}

variable "git_branch" {
  description = "Branch the environment deploys."
  type        = string
  default     = "develop"
}

variable "deploy_key_file" {
  description = "Path of the SSH private key registered as read only deploy key (created by npm run coolify:secrets)."
  type        = string
}

variable "secrets" {
  description = "Environment values of the API, flat NAME to value (secrets/<env>/secrets.json). DATABASE_URL, APP_URL and ALLOWED_ORIGINS are computed here and must not be in it. It also holds the five BACKUP_S3_ENDPOINT, BACKUP_S3_REGION, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY of the Postgres backup bucket: they feed the backup storage and the app never receives them."
  type        = map(string)
  sensitive   = true
}

variable "domains_enabled" {
  description = "Stage 2. The provider sends the domain mapping in a PATCH right after creating the application, before Coolify has loaded the compose file, and gets a 422: apply once with false, then with true."
  type        = bool
  default     = false
}

variable "backup_frequency" {
  description = "Schedule of the Postgres backup: a cron expression or a Coolify keyword such as daily."
  type        = string
  default     = "0 3 * * *"
}

variable "backup_retention_days" {
  description = "Days a Postgres backup is kept in the backup bucket."
  type        = number
  default     = 30
}

variable "backup_retention_days_local" {
  description = "Days a Postgres backup is kept on the Coolify server, so dumps do not pile up on its disk."
  type        = number
  default     = 7
}

variable "coolify_url" {
  description = "Base URL of Coolify, no trailing slash, target of the GitHub webhook. tofu.ps1 sets it from teammanix/coolify-endpoint."
  type        = string
}

variable "release_branch" {
  description = "Prod only: branch the version tags are cut from (main). Required checks then guard it, and git_branch moves only through the release workflow. Null on staging, where the checks guard git_branch."
  type        = string
  default     = null
}

variable "required_checks" {
  description = "CI jobs that must pass before a commit reaches the checked branch (job names of .github/workflows/ci.yml)."
  type        = list(string)
  default     = ["api", "web"]
}
