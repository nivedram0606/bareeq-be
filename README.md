# Bareeq Cloud — Backend API

Backend REST API for the Bareeq School Management platform. Built with Node 22, Express 5, Drizzle ORM, PostgreSQL, and TypeScript.

## Getting Started

### Prerequisites
- Node.js >= 22
- pnpm (or npm / yarn)
- PostgreSQL database (remote cloud like Supabase, self-hosted, or local Docker)

### Installation
```bash
pnpm install
```

### Environment Variables
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | API server port (default: 4000) | `4000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres` |
| `DIRECT_DATABASE_URL` | Optional: direct connection for migrations | *(defaults to `DATABASE_URL`)* |
| `DATABASE_SSL` | Optional: SSL mode (`require`, `prefer`, `disable`) | *(auto-detected for remote hosts)* |
| `SUPABASE_URL` | Supabase project URL | `https://[PROJECT-REF].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role secret key | `eyJh...` |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:5173` |

### Running Database Migrations
To apply the database schema, views, triggers, and RLS tables to your PostgreSQL server:
```bash
pnpm db:migrate
```

To seed the initial school, academic year, and admin account:
```bash
pnpm db:seed
```

### Development
```bash
pnpm dev
```
Starts the API in watch mode with `tsx` at `http://localhost:4000`.

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
