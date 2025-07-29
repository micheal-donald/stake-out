# Database Specification

The project uses **PostgreSQL** for persistent storage. Schema creation scripts live in `database/`.

## Features
- User accounts with balances
- Game rounds and bet history
- Wallet transactions and M-Pesa records
- Session and settings tables

## Schema Files
- `init.sql` – Creates all tables and indexes
- `migrations/` – Additional migration scripts
- `run-migrations.js` – Helper script to apply migrations

### Usage
Start the database using Docker and run migrations:
```bash
docker compose up -d
node database/run-migrations.js
```
Adminer is available at `http://localhost:8080` for database inspection.

