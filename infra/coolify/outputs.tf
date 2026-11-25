output "url" {
  value = local.url
}

output "application_uuid" {
  value = coolify_application_private_git.app.uuid
}

output "deployment_status" {
  value = coolify_deployment.app.status
}

output "webhook_url" {
  value = local.webhook_url
}
