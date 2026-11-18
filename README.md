# Bareeq Cloud — Backend API

Backend REST API for the Bareeq School Management platform. Built with Node 22, Express 5, Drizzle ORM, PostgreSQL (Supabase), and TypeScript.

## Getting Started

### Prerequisites
- Node.js >= 22
- pnpm (or npm / yarn)
- Docker (for local Supabase stack or deployment)

### Installation
```bash
pnpm install
```

### Environment Variables
Copy `.env.example` to `.env` and fill in the database and Supabase credentials:
```bash
cp .env.example .env
```

| Variable | Description |
| :--- | :--- |
| `PORT` | API server port (default: 4000) |
| `DATABASE_URL` | Postgres pooler connection string |
| `DIRECT_DATABASE_URL` | Direct Postgres connection string (for migrations) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role secret key |
| `SUPABASE_JWKS_URL` | Supabase JWKS endpoint for JWT verification |
| `SUPABASE_JWT_ISSUER` | Supabase JWT issuer |
| `CORS_ORIGIN` | Allowed frontend origin (e.g. `http://localhost:5173`) |

### Development
```bash
pnpm dev
```
Starts the API in watch mode with `tsx` at `http://localhost:4000`.

### Database Commands
- Generate Drizzle migrations:
  ```bash
  pnpm db:generate
  ```
- Run migrations:
  ```bash
  pnpm db:migrate
  ```
- Seed database:
  ```bash
  pnpm db:seed
  ```

### Type Checking & Testing
```bash
pnpm typecheck
pnpm test
```

### Production Build & Run
```bash
pnpm build
pnpm start
```

### Docker
```bash
docker build -t bareeq-api .
docker run -p 4000:4000 --env-file .env bareeq-api
```
