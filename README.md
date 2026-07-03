# Company Portal

Company Portal is a PostgreSQL-backed people and operations platform for HR administrators, managers, approvers, and employees. The repository contains the administration web application, employee self-service application, and REST API in one pnpm monorepo.

## Features

- Employee directory with full profiles, filtering, pagination, Excel import/export, and automatic user-account creation
- Role-based access control for Admin, HR, Manager, Approver, and Employee roles
- Attendance check-in/check-out
- Leave, overtime, appraisal, and approval workflows
- Real-time-style pending and notification counters with read/unread status
- Announcements with document and image attachments
- Corporate payment and advance-clearance requests
- HR item masters for departments, organizations, and project locations
- Reports and Excel downloads
- Responsive desktop, tablet, and mobile layouts

## Repository structure

```text
company-portal/
├── apps/
│   ├── api/                 # Express REST API and PostgreSQL migrations
│   │   └── src/migrations/  # Ordered, idempotent database migrations
│   ├── web/                 # HR/admin/manager React web application
│   └── mobile/              # Employee self-service React application
├── scripts/                 # Windows development launchers
├── package.json             # Monorepo commands
├── pnpm-lock.yaml           # Reproducible dependency versions
└── pnpm-workspace.yaml      # Workspace configuration
```

## Technology

- React 19, TypeScript, Vite
- Node.js and Express 5
- PostgreSQL
- JWT authentication and bcrypt password hashing
- ExcelJS for employee and report workbooks
- pnpm workspaces

## Requirements

- Node.js 22 or newer
- pnpm 10.32.1 (the version declared in `package.json`)
- PostgreSQL 14 or newer

Enable pnpm with Corepack if it is not installed:

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
```

## Local setup

1. Install dependencies:

   ```bash
   pnpm install --frozen-lockfile
   ```

2. Create the PostgreSQL database and a restricted application user:

   ```sql
   CREATE DATABASE company_portal;
   CREATE USER company_portal_app WITH PASSWORD 'replace-with-a-strong-password';
   GRANT ALL PRIVILEGES ON DATABASE company_portal TO company_portal_app;
   ```

3. Copy `apps/api/.env.example` to `apps/api/.env` and update every value.

4. Copy `apps/web/.env.example` to `apps/web/.env` and `apps/mobile/.env.example` to `apps/mobile/.env`.

5. Apply migrations and optional development seed data:

   ```bash
   pnpm --filter @company-portal/api migrate
   pnpm --filter @company-portal/api seed
   ```

6. Start each service in a separate terminal:

   ```bash
   pnpm dev:api
   pnpm dev:web
   pnpm dev:mobile
   ```

Windows users can alternatively run the launchers in `scripts/`.

## Local URLs

| Service | URL |
| --- | --- |
| API | `http://localhost:4000` |
| API health check | `http://localhost:4000/health` |
| Administration web app | `http://localhost:5173` |
| Employee app | `http://localhost:5174` |

Development seed credentials are `kyaw thu` / `Admin@123`. Change all seeded credentials before exposing any environment publicly.

## Environment variables

### API — `apps/api/.env`

| Variable | Purpose |
| --- | --- |
| `PORT` | API listening port |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Long, random JWT signing secret |
| `WEB_ORIGIN` | Comma-separated allowed frontend origins |

### Web and employee applications

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Public API base URL, including `/api` |

Never commit `.env`, database dumps, generated uploads, access tokens, or production credentials.

## Validation

```bash
pnpm build
pnpm lint
```

Both commands must pass before deployment.

## Production deployment

1. Provision PostgreSQL and create a dedicated least-privilege database user.
2. Configure production environment variables. Use a strong random `JWT_SECRET` and HTTPS URLs in `WEB_ORIGIN` and `VITE_API_URL`.
3. Install exact dependencies and build all applications:

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @company-portal/api migrate
   pnpm build
   ```

4. Start the API from `apps/api` with `pnpm start` or a process manager such as systemd, PM2, or a container platform.
5. Serve `apps/web/dist` and `apps/mobile/dist` from a static host or reverse proxy.
6. Route HTTPS traffic to the API and persist the API `uploads` directory in durable storage.
7. Back up PostgreSQL and uploaded files regularly.

Migrations are applied in filename order. Do not rename or edit a migration after it has been deployed; add a new numbered migration instead.

## Security checklist

- Replace development users and passwords
- Rotate `JWT_SECRET`
- Restrict PostgreSQL network access
- Enforce HTTPS
- Set exact production CORS origins
- Store secrets in the deployment platform, not Git
- Scan uploaded files and configure size limits appropriate for production
- Schedule database and attachment backups

## License

Private project. All rights reserved.
