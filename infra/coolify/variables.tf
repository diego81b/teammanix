variable "environment" {
  description = "Environment name, one per state: staging now, production later."
  type        = string
  default     = "staging"
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
  description = "Environment values of the API, flat NAME to value (secrets/<env>/secrets.json). DATABASE_URL, APP_URL and ALLOWED_ORIGINS are computed here and must not be in it."
  type        = map(string)
  sensitive   = true
}

variable "domains_enabled" {
  description = "Stage 2. Coolify takes the domain mapping of a compose app only after the first deploy has read the compose file: apply once with false, then with true."
  type        = bool
  default     = false
}
