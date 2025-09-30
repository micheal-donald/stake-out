# Secrets Checklist

This document lists all the required environment variables and secrets for the StakeOutBet application.

## Backend Secrets

| Secret Name | Required | Description | Minimum Length | Default Value |
|-------------|----------|-------------|----------------|---------------|
| JWT_SECRET | Yes | Used to sign JWT tokens for authentication | 32 characters | None (must be set) |
| SESSION_SECRET | Yes | Used to sign session cookies | 32 characters | None (must be set) |
| PAYMENT_MODULE_API_KEY | Yes | API key for communication with the payment module | 32 characters | None (must be set) |
| DATABASE_URL | Yes | PostgreSQL connection string | N/A | postgresql://user:password@localhost:5432/stakeoutbet |
| REDIS_URL | Yes | Redis connection string | N/A | redis://localhost:6379 |
| BCRYPT_ROUNDS | No | Number of rounds for bcrypt hashing | N/A | 12 |

## Frontend Environment Variables

| Variable Name | Required | Description | Example Value |
|---------------|----------|-------------|---------------|
| REACT_APP_API_URL | Yes | Backend API URL | http://localhost:3001 |
| REACT_APP_SOCKET_URL | Yes | WebSocket URL | http://localhost:3001 |

## Production Specific Secrets

| Secret Name | Required | Description | Minimum Length |
|-------------|----------|-------------|----------------|
| DB_SSL_CA | Yes (Production) | Database SSL certificate | N/A |
| SENTRY_DSN | No | Sentry error tracking DSN | N/A |

## Validation Requirements

1. JWT_SECRET must be at least 32 characters long
2. SESSION_SECRET must be at least 32 characters long
3. PAYMENT_MODULE_API_KEY must be at least 32 characters long
4. DATABASE_URL must be a valid PostgreSQL connection string
5. All secrets should be unique and randomly generated

## Generation Commands

You can generate secure secrets using these commands:

```bash
# Generate a 32-byte hexadecimal secret
openssl rand -hex 32

# Generate a 32-byte base64 secret
openssl rand -base64 32

# Generate JWT secret
node backend/scripts/generate-secrets.js
```

## Secret Rotation Procedures

1. Generate new secrets using the generation commands above
2. Update secrets in your secret management system (e.g., 1Password, AWS Secrets Manager)
3. Update environment variables in all environments
4. Restart services to apply new secrets
5. Verify applications are working correctly with new secrets
6. Remove old secrets from configuration files (if stored there)
7. Document the rotation in your incident log