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
├── run-localhost.bat        # Portable Windows development launcher
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

Windows users can alternatively run `run-localhost.bat` from the repository root.

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

## Production deployment (Ubuntu, PostgreSQL, Nginx, and systemd)

This deployment serves both React applications as static files and keeps the Node API running behind Nginx. Replace the example domains and passwords before running the commands.

### 1. Production topology

| Public endpoint | Served by |
| --- | --- |
| `https://portal.example.com` | `apps/web/dist` |
| `https://employee.example.com` | `apps/mobile/dist` |
| `/api/*` on either domain | API on `127.0.0.1:4000` |
| `/health` on either domain | API health endpoint |

Keep PostgreSQL and port `4000` private. Only ports `80` and `443` should be publicly reachable.

### 2. Install server packages

The following example targets a current Ubuntu LTS server. Install Node.js 22 from an approved Node.js repository for your environment, then verify every required version:

```bash
sudo apt update
sudo apt install -y git nginx postgresql postgresql-contrib curl
node --version
npm --version
sudo npm install --global pnpm@10.32.1
pnpm --version
```

Expected minimums are Node.js 22, pnpm 10.32.1, and PostgreSQL 14.

### 3. Create the database

Create a dedicated owner instead of running the application as the PostgreSQL superuser:

```bash
sudo -u postgres psql
```

```sql
CREATE ROLE company_portal_app LOGIN PASSWORD 'REPLACE_WITH_A_STRONG_DATABASE_PASSWORD';
CREATE DATABASE company_portal OWNER company_portal_app;
\q
```

For an existing deployment, take a verified backup before running any migration:

```bash
sudo -u postgres pg_dump --format=custom company_portal > company_portal-before-deploy.dump
```

### 4. Clone and install

Use a dedicated system account and deployment directory. Configure GitHub access for the private repository before cloning.

```bash
sudo useradd --system --home /opt/company-portal --shell /usr/sbin/nologin companyportal || true
sudo git clone https://github.com/OWNER/Company-Portal.git /opt/company-portal
sudo chown -R companyportal:companyportal /opt/company-portal
cd /opt/company-portal
sudo -u companyportal pnpm install --frozen-lockfile
```

Deploy a reviewed tag or protected branch in production rather than an unreviewed working branch.

### 5. Configure secrets and frontend API URLs

Create `/opt/company-portal/apps/api/.env` with permissions limited to the service account:

```dotenv
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://company_portal_app:URL_ENCODED_DATABASE_PASSWORD@127.0.0.1:5432/company_portal
JWT_SECRET=REPLACE_WITH_OUTPUT_FROM_OPENSSL_RAND_HEX_64
WEB_ORIGIN=https://portal.example.com,https://employee.example.com
```

Generate the JWT secret with `openssl rand -hex 64`. URL-encode special characters in the database password. `WEB_ORIGIN` is comma-separated with no spaces and must contain the exact HTTPS origins used by browsers.

```bash
sudo chown companyportal:companyportal /opt/company-portal/apps/api/.env
sudo chmod 600 /opt/company-portal/apps/api/.env
```

Create both production frontend files before building. A relative `/api` URL makes each frontend call the API through its own Nginx domain:

`apps/web/.env.production`:

```dotenv
VITE_API_URL=/api
```

`apps/mobile/.env.production`:

```dotenv
VITE_API_URL=/api
```

Vite compiles these values into the bundles. Any change requires a new frontend build.

### 6. Migrate, bootstrap the first administrator, and build

Run migrations before starting the new API version:

```bash
cd /opt/company-portal
sudo -u companyportal pnpm --filter @company-portal/api migrate
sudo -u companyportal pnpm build
```

On a brand-new empty database only, create the first administrator without development sample data. The password prompt below is hidden and is not stored in shell history:

```bash
cd /opt/company-portal
read -rsp 'Initial admin password (12+ characters): ' ADMIN_PASSWORD && echo
sudo -u companyportal env \
  COMPANY_NAME='Your Company Name' \
  ADMIN_EMPLOYEE_NO='ADMIN-001' \
  ADMIN_FIRST_NAME='System' \
  ADMIN_LAST_NAME='Administrator' \
  ADMIN_EMAIL='admin@example.com' \
  ADMIN_USERNAME='admin' \
  ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  pnpm --filter @company-portal/api bootstrap-admin
unset ADMIN_PASSWORD
```

Do not run `pnpm --filter @company-portal/api seed` in production. It creates development users, sample records, and known passwords. Use `bootstrap-admin` once, sign in, and immediately replace the temporary administrator password from the application.

### 7. Run the API with systemd

The API uses its current working directory for `.env` loading and the persistent `uploads` folder. Therefore `WorkingDirectory` must remain `apps/api`.

Create `/etc/systemd/system/company-portal-api.service`:

```ini
[Unit]
Description=Company Portal API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=companyportal
Group=companyportal
WorkingDirectory=/opt/company-portal/apps/api
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/company-portal/apps/api/dist/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Confirm the Node path with `command -v node` and update `ExecStart` if it is not `/usr/bin/node`. Then start and verify the service:

```bash
sudo mkdir -p /opt/company-portal/apps/api/uploads
sudo chown -R companyportal:companyportal /opt/company-portal/apps/api/uploads
sudo systemctl daemon-reload
sudo systemctl enable --now company-portal-api
sudo systemctl status company-portal-api --no-pager
curl --fail http://127.0.0.1:4000/health
```

The health response must contain `"status":"ok"` and `"database":"connected"`. View API logs with `sudo journalctl -u company-portal-api -f`.

### 8. Configure Nginx

Create `/etc/nginx/sites-available/company-portal`:

```nginx
server {
    listen 80;
    server_name portal.example.com;
    root /opt/company-portal/apps/web/dist;
    index index.html;
    client_max_body_size 12m;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name employee.example.com;
    root /opt/company-portal/apps/mobile/dist;
    index index.html;
    client_max_body_size 12m;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and test it:

```bash
sudo ln -s /etc/nginx/sites-available/company-portal /etc/nginx/sites-enabled/company-portal
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Ensure the `www-data` user can traverse `/opt/company-portal` and read both `dist` directories. Do not grant it access to `apps/api/.env`.

### 9. Enable HTTPS

After both DNS records point to the server, install Certbot and request certificates:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d portal.example.com -d employee.example.com
sudo certbot renew --dry-run
```

Use HTTPS URLs in `WEB_ORIGIN`, rebuild if a frontend API URL changed, and restart the API after editing its `.env`.

### 10. Production verification

```bash
curl --fail https://portal.example.com/health
curl --fail --head https://portal.example.com/
curl --fail --head https://employee.example.com/
```

Then verify in a browser:

- administrator login and immediate password replacement
- employee import/export and Ferry Management Excel import/export
- one permitted and one restricted role
- attachment upload and download
- one complete approval workflow
- mobile employee login

### 11. Deploy future updates

Back up first, then deploy an exact reviewed revision:

```bash
cd /opt/company-portal
sudo -u postgres pg_dump --format=custom company_portal > /var/backups/company-portal-$(date +%F-%H%M).dump
sudo -u companyportal git pull --ff-only
sudo -u companyportal pnpm install --frozen-lockfile
sudo -u companyportal pnpm --filter @company-portal/api migrate
sudo -u companyportal pnpm build
sudo systemctl restart company-portal-api
sudo nginx -t && sudo systemctl reload nginx
curl --fail http://127.0.0.1:4000/health
```

Migrations run in filename order. Never rename or modify a migration that has reached production; add a new migration instead. If a deployment fails after a schema change, roll the application back only to a version compatible with that schema or restore the pre-deployment database backup.

### 12. Persistent data and backups

Back up all three of these independently:

- PostgreSQL database
- `/opt/company-portal/apps/api/uploads`
- production `.env` files in a secure secret store

Restoring the database alone does not restore announcement or request attachments. Test both database and upload restoration regularly.

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
