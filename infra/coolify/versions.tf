terraform {
  required_version = ">= 1.8"

  required_providers {
    coolify = {
      source  = "coolify-terraform/coolify"
      version = "0.1.33"
    }
  }

  # The state holds every secret in plaintext (database password, environment values), so it is always encrypted.
  # The passphrase never lives in a file: export it before every tofu command, 16 characters at least:
  #   export TF_ENCRYPTION='key_provider "pbkdf2" "main" { passphrase = "..." }'
  # Without it tofu refuses to run (enforced = true), it never writes a plaintext state.
  encryption {
    method "aes_gcm" "main" {
      keys = key_provider.pbkdf2.main
    }
    state {
      method   = method.aes_gcm.main
      enforced = true
    }
    plan {
      method   = method.aes_gcm.main
      enforced = true
    }
  }
}

# Endpoint and token come from COOLIFY_ENDPOINT and COOLIFY_TOKEN (token with the root permission, see README).
provider "coolify" {}
