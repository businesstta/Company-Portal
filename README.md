# Company Portal

Company Portal is a PostgreSQL-backed people and operations platform for HR administrators, managers, approvers, and employees. The repository contains the administration web application, employee self-service application, and REST API in one pnpm monorepo.

## Features

- Employee directory with full profiles, filtering, pagination, Excel import/export, and automatic user-account creation
- Role-based access control for Admin, HR, Manager, Approver, and Employee roles
- Attendance check-in/check-out
- Leave, overtime, appraisal, and approval workflows
- Real-time-style pending and notification counters with read/unread status
- Announcements with document and image attachments
- Corporate payment requests with attachments, unique `PRF-YYYY-XXXXXXX` references, multi-step approval journeys, notifications, My Requests tracking, and A4 print views
- Approval setup for Department Head, Finance Approver, and Cashier workflow steps
- Navigation branding, system settings, nested navigation, and granular role access for menus and submenus
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
| Administration web app | `http://localhost:5180` |
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

### 1. Provision the server

Install Node.js 22+, pnpm 10.32.1, PostgreSQL 14+, and a reverse proxy such as Nginx. Clone this repository and check out the deployed branch or release tag.

### 2. Configure PostgreSQL

Create a dedicated database and application user. Do not reuse the PostgreSQL superuser. Back up the database before applying migrations to an existing installation.

### 3. Configure production environment

Create `apps/api/.env` from `apps/api/.env.example`:

```dotenv
PORT=4000
DATABASE_URL=postgresql://company_portal_app:STRONG_PASSWORD@127.0.0.1:5432/company_portal
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
WEB_ORIGIN=https://portal.example.com,https://employee.example.com
```

Create `apps/web/.env.production` and `apps/mobile/.env.production` before building:

```dotenv
VITE_API_URL=https://portal.example.com/api
```

`VITE_API_URL` is compiled into the frontend bundles. Rebuild the frontend whenever it changes.

### 4. Install, migrate, and build

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @company-portal/api migrate
pnpm build
```

Do not run `seed` in production. Employee master data should be imported from the production Employees module after deployment.

### 5. Run the API continuously

The API entry point after building is `apps/api/dist/server.js`. Run it from `apps/api` so the `.env` file and `uploads` directory resolve correctly. Use a service manager rather than a temporary terminal process.

Example with PM2:

```bash
cd apps/api
pm2 start dist/server.js --name company-portal-api
pm2 save
pm2 startup
```

Verify the API before exposing traffic:

```bash
curl http://127.0.0.1:4000/health
```

The response must report both `status: ok` and `database: connected`.

### 6. Serve the frontend and proxy the API

- Serve `apps/web/dist` as the main portal static site.
- Serve `apps/mobile/dist` separately if the employee application is deployed.
- Proxy `/api` and `/health` to `http://127.0.0.1:4000`.
- Enable HTTPS and redirect HTTP to HTTPS.
- Configure SPA fallback so unknown frontend routes return `index.html`.
- Increase reverse-proxy upload limits to at least 10 MB per attachment.

### 7. Persist application data

The following are not stored in Git and must be protected separately:

- PostgreSQL database
- `apps/api/uploads` attachment directory
- Production `.env` files and secrets

Back up both PostgreSQL and the uploads directory. Restoring only the database will not restore announcement or request attachments.

### 8. Deploy future updates

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm --filter @company-portal/api migrate
pnpm build
pm2 restart company-portal-api
```

After each deployment, verify `/health`, sign in with a non-admin test account, and test one permitted and one restricted navigation item.

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
