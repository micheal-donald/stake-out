# Secrets Management

This document describes the secrets management strategy for the StakeOutBet application.

## Overview

Proper secrets management is critical for maintaining the security of the application. This document outlines the approach for generating, storing, and managing secrets across different environments.

## Secret Generation

Use the provided script to generate cryptographically secure secrets:

```bash
node backend/scripts/generate-secrets.js
```

Alternatively, use OpenSSL:

```bash
# Generate a 32-byte hexadecimal secret
openssl rand -hex 32

# Generate a 32-byte base64 secret
openssl rand -base64 32
```

## Required Secrets

See [SECRETS_CHECKLIST.md](../SECRETS_CHECKLIST.md) for a complete list of required secrets and validation requirements.

## Environment-Specific Configuration

### Development

- Use `.env` file in the backend directory
- Secrets should be unique but not necessarily production-grade
- Never commit actual secrets to the repository

### Production

- Use `.env.production` file or environment variables
- All secrets must be production-grade
- Use the template file `.env.production.template` as a reference
- Never store production secrets in the code repository

## Storage Best Practices

### Local Development

1. Use `.env` files that are included in `.gitignore`
2. Share example files (`.env.example`) instead of actual secrets
3. Rotate secrets periodically

### Production

1. Use a secrets management system:
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault
   - Google Secret Manager

2. Never store secrets in:
   - Source code repositories
   - Configuration files committed to version control
   - Docker images
   - Plain text files on servers

## Secret Rotation

### Procedure

1. Generate new secrets using approved methods
2. Update secrets in the secrets management system
3. Update environment variables in all relevant services
4. Restart services to apply new secrets
5. Verify applications are working correctly with new secrets
6. Remove old secrets from the secrets management system after a grace period

### Frequency

- Rotate secrets at least annually
- Rotate immediately if a secret may have been compromised
- Rotate after employee departures with access to secrets

## Access Control

1. Limit access to secrets on a need-to-know basis
2. Use role-based access control (RBAC) where possible
3. Enable audit logging for secret access
4. Regularly review and prune access permissions

## Emergency Procedures

If a secret is suspected to be compromised:

1. Immediately generate a new secret
2. Update the secret in all relevant systems
3. Revoke the compromised secret
4. Investigate the cause of compromise
5. Document the incident
6. Review and update security practices as needed

## Validation

The application includes a validation script that checks environment variables at startup:

```bash
node backend/scripts/validate-env.js
```

This script ensures:
- Required secrets are present
- Secrets meet minimum length requirements
- URLs are properly formatted
- Numeric values are within acceptable ranges

## Tools and Libraries

- [dotenv](https://www.npmjs.com/package/dotenv) - For loading environment variables
- [crypto](https://nodejs.org/api/crypto.html) - For generating secure random values
- OpenSSL - For command-line secret generation

## References

- [SECRETS_CHECKLIST.md](../SECRETS_CHECKLIST.md) - Complete list of required secrets
- [.env.example](../backend/.env.example) - Example environment file
- [.env.production.template](../backend/.env.production.template) - Production environment template