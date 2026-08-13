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
- IT Asset Management with three-step registration, images, safe Excel import/export, auto-generated asset tags, barcode/QR labels, bulk delete, and multi-label printing
- Safe employee merge/full-sync import that preserves linked workflow identities and protects approvers, managers, and the signed-in account
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

## Production deployment with Docker Compose on Linux

For automatic `develop` → staging and approved `main` → production deployments on a shared Ubuntu server, see [DEPLOYMENT.md](DEPLOYMENT.md).

This is the recommended Linux deployment. It runs PostgreSQL, the API, the administration web app, and the employee app as separate containers. Database files and uploaded attachments are stored in named Docker volumes, so recreating a container does not erase application data.

### 1. Server requirements

- A current Ubuntu/Debian/RHEL-compatible Linux server
- Docker Engine 26 or newer with the Compose v2 plugin
- At least 2 CPU cores, 4 GB RAM, and sufficient disk space for PostgreSQL, images, and attachments
- DNS records for the administration and employee domains when exposing the apps publicly

Verify Docker before cloning the repository:

```bash
docker --version
docker compose version
git --version
```

Do not publish PostgreSQL or the API container port directly. The Compose network keeps both private; only the two frontend ports are bound to the host.

### 2. Clone and configure

```bash
sudo mkdir -p /opt/company-portal
sudo chown "$USER":"$USER" /opt/company-portal
git clone https://github.com/businesstta/Company-Portal.git /opt/company-portal
cd /opt/company-portal
cp docker.env.example .env
```

Edit `.env` and replace every example secret:

```bash
nano .env
```

Generate a strong JWT secret:

```bash
openssl rand -hex 64
```

Use a long URL-safe `POSTGRES_PASSWORD` containing letters, numbers, `_`, and `-`. `WEB_ORIGIN` must contain the exact public browser origins, separated by commas without spaces. For a first test using server ports, for example:

```dotenv
POSTGRES_DB=company_portal
POSTGRES_USER=company_portal_app
POSTGRES_PASSWORD=REPLACE_WITH_A_STRONG_URL_SAFE_PASSWORD
JWT_SECRET=REPLACE_WITH_OPENSSL_OUTPUT
WEB_ORIGIN=http://SERVER_IP:8080,http://SERVER_IP:8081
WEB_PORT=8080
MOBILE_PORT=8081
```

Protect the secrets file:

```bash
chmod 600 .env
```

### 3. Build and start

```bash
docker compose config
docker compose build --pull
docker compose up -d
docker compose ps
```

The API waits for PostgreSQL and runs all pending migrations automatically before starting. A migration failure stops the API instead of serving against an incomplete schema.

Follow startup logs and verify health:

```bash
docker compose logs -f api
curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/healthz
```

Default host endpoints are:

| Service | URL |
| --- | --- |
| Administration web app | `http://SERVER_IP:8080` |
| Employee app | `http://SERVER_IP:8081` |
| API health through web proxy | `http://SERVER_IP:8080/health` |

### 4. Create the first administrator

Do this once on a brand-new database. Do not run the development seed command in production.

```bash
read -rsp 'Initial admin password (12+ characters): ' ADMIN_PASSWORD && echo
docker compose exec \
  -e COMPANY_NAME='Your Company Name' \
  -e ADMIN_EMPLOYEE_NO='ADMIN-001' \
  -e ADMIN_FIRST_NAME='System' \
  -e ADMIN_LAST_NAME='Administrator' \
  -e ADMIN_EMAIL='admin@example.com' \
  -e ADMIN_USERNAME='admin' \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  api node dist/bootstrap-admin.js
unset ADMIN_PASSWORD
```

Sign in and replace the temporary password immediately.

### 5. Put HTTPS reverse proxy in front

Use Nginx, Caddy, Traefik, or a managed load balancer on the host. Route `portal.example.com` to `127.0.0.1:8080` and `employee.example.com` to `127.0.0.1:8081`. Terminate TLS at the reverse proxy and set:

```dotenv
WEB_ORIGIN=https://portal.example.com,https://employee.example.com
```

After changing `.env`, recreate the API:

```bash
docker compose up -d --force-recreate api
```

The frontend images already use the relative `/api` path, so browser API requests stay on the same domain and are proxied internally to the API service.

### 6. Deploy an update

Always back up before updating:

```bash
cd /opt/company-portal
mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/company-portal-$(date +%F-%H%M).dump"
docker run --rm -v company-portal_api_uploads:/source:ro -v "$PWD/backups":/backup alpine tar czf /backup/uploads-$(date +%F-%H%M).tar.gz -C /source .
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:${WEB_PORT:-8080}/health
```

Compose recreates only changed containers. The named database and upload volumes remain attached. Never use `docker compose down -v` in production because `-v` deletes persistent data.

### 7. Operations and troubleshooting

```bash
# Container state and health
docker compose ps

# Recent logs
docker compose logs --tail=200 api db web mobile

# Follow API logs
docker compose logs -f api

# Restart one service
docker compose restart api

# Stop without deleting data
docker compose down

# Start again
docker compose up -d
```

If the API is unhealthy, check `docker compose logs api` first. Common causes are an incorrect database password, an invalid `DATABASE_URL` caused by special password characters, a missing `JWT_SECRET`, or a failed migration. Do not edit a migration that has already run in production; add a new ordered migration.

### 8. Persistent data and backup policy

The deployment uses:

- `company-portal_postgres_data` for PostgreSQL
- `company-portal_api_uploads` for asset images and other uploaded attachments
- `.env` for production configuration and secrets

Back up the database, upload volume, and encrypted secrets independently. Test restoration regularly. Database restoration alone does not restore uploaded images or documents.

## Alternative production deployment (Ubuntu, PostgreSQL, Nginx, and systemd)

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
