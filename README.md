# Bareeq Cloud — Backend API

Backend REST API for the Bareeq School Management platform. Built with Node 22, Express 5, Drizzle ORM, PostgreSQL, and TypeScript.

## Getting Started

### Prerequisites
- Node.js >= 22
- pnpm (or npm / yarn)
- PostgreSQL 14+ (managed, self-hosted, or local Docker)

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
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@127.0.0.1:5432/bareeq` |
| `DIRECT_DATABASE_URL` | Optional: direct connection for migrations | *(defaults to `DATABASE_URL`)* |
| `DATABASE_SSL` | Optional: SSL mode (`require`, `prefer`, `disable`) | *(auto-detected for remote hosts)* |
| `JWT_SECRET` | Signs session tokens; 32+ random chars, required in production | `openssl rand -base64 48` |
| `SESSION_TTL_HOURS` | Optional: how long a sign-in lasts (default 12) | `12` |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | First admin created by `pnpm db:seed` | `admin` |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:5173` |

### Running Database Migrations
To apply the database schema, views and triggers to your PostgreSQL server:
```bash
pnpm db:migrate
```

To seed the initial school, academic year, and admin account:
```bash
pnpm db:seed
```

### Authentication
Username + password, handled by the API itself (no external auth service):
- `POST /api/v1/auth/login` `{ username, password }` → `{ token, expiresAt }`; send the token as
  `Authorization: Bearer <token>`. Passwords are stored as bcrypt hashes in `profiles.password_hash`.
- `POST /api/v1/auth/change-password` — signed-in user changes their own password.
- Admins create users (`POST /api/v1/users`) and reset passwords (`PUT /api/v1/users/:id/password`).
  Password changes sign the user out on every other device.
- First admin: `pnpm db:seed`, or `POST /api/v1/setup/admin` (see `docs/prod-deployment.md`).

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
