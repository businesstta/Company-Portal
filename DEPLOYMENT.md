# ESS Portal staging and production deployment

This guide keeps the Meeting Room application isolated while running ESS Portal staging and production on the same Ubuntu server.

## Deployment flow

- Local work is pushed to `develop` for automatic staging deployment.
- Reviewers use the staging domains to test the current `develop` revision.
- A reviewed pull request merges `develop` into `main`.
- A push or reviewed merge to `main` validates and automatically deploys the exact production commit.
- The manual `production` workflow target remains available for an authorized redeployment. A protected GitHub production environment can still require approval.

The workflow always runs `pnpm check` before either deployment. The remote deploy script backs up the existing database and uploaded files, rebuilds the Docker images, runs migrations during API startup, and verifies `/health`.

## Files supplied by the repository

- `.github/workflows/deploy.yml`: validation and SSH deployment workflow
- `deploy/deploy.sh`: backup, exact-revision deployment and health verification
- `deploy/staging.env.example`: isolated staging configuration
- `deploy/production.env.example`: isolated production configuration
- `docker-compose.yml`: supports isolated project names and loopback-only port binding

## One-time local setup

Create and publish the integration branch after the current work has been reviewed and committed:

```bash
git switch -c develop
git push -u origin develop
```

Normal development then uses:

```bash
git switch develop
git add <reviewed-files>
git commit -m "Describe the ESS Portal change"
git push origin develop
```

Do not commit `.env`, database dumps, upload archives, SSH private keys, JWT secrets or database passwords.

## One-time Ubuntu setup

These commands are examples. Confirm that ports do not conflict with Meeting Room before choosing them.

```bash
sudo mkdir -p /opt/ess-portal-staging /opt/ess-portal-production
sudo chown -R "$USER":"$USER" /opt/ess-portal-staging /opt/ess-portal-production

git clone --branch develop https://github.com/businesstta/Company-Portal.git /opt/ess-portal-staging
git clone --branch main https://github.com/businesstta/Company-Portal.git /opt/ess-portal-production

cd /opt/ess-portal-staging
cp deploy/staging.env.example .env
chmod 600 .env

cd /opt/ess-portal-production
cp deploy/production.env.example .env
chmod 600 .env
```

Edit both `.env` files. Use different database credentials, JWT secrets, Compose project names, ports and public origins. Generate each JWT secret independently:

```bash
openssl rand -hex 64
```

The supplied examples bind web ports to `127.0.0.1`. Nginx or Caddy on the host should be the only public entry point. Do not expose PostgreSQL or the API container directly.

Perform each first deployment manually:

```bash
cd /opt/ess-portal-staging
bash deploy/deploy.sh develop origin/develop

cd /opt/ess-portal-production
bash deploy/deploy.sh main origin/main
```

## SSH deploy identity

Create a dedicated deploy key on an administrator workstation. Do not overwrite an existing key:

```bash
ssh-keygen -t ed25519 -f ess_portal_deploy -C ess-portal-deploy
```

Install only the public key (`ess_portal_deploy.pub`) in the Ubuntu deploy user's `~/.ssh/authorized_keys`. Keep the private key for the GitHub environment secret described below. The deploy user needs permission to read the two deployment directories and run Docker. Avoid using the root account.

Record and independently verify the Ubuntu server host key before saving it to GitHub:

```bash
ssh-keyscan -H YOUR_SERVER_HOST
```

## GitHub environments

In repository **Settings → Environments**, create `staging` and `production`.

Add these same-named secrets separately to each environment:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | Ubuntu hostname or IP |
| `DEPLOY_USER` | Dedicated Ubuntu deployment user |
| `DEPLOY_SSH_KEY` | Contents of the deployment private key |
| `DEPLOY_KNOWN_HOSTS` | Verified `ssh-keyscan` output |

Add these variables separately to each environment:

| Variable | Staging example | Production example |
| --- | --- | --- |
| `DEPLOY_PORT` | `22` | `22` |
| `DEPLOY_PATH` | `/opt/ess-portal-staging` | `/opt/ess-portal-production` |

On the `production` environment, enable required reviewers. Restrict production deployment to the `main` branch. Restrict staging deployment to `develop`.

## Reverse proxy routing

Use distinct hostnames, for example:

| Application | Hostname | Loopback target |
| --- | --- | --- |
| ESS staging admin | `dev-ess.example.com` | `127.0.0.1:8180` |
| ESS staging employee | `dev-employee.example.com` | `127.0.0.1:8181` |
| ESS production admin | `ess.example.com` | `127.0.0.1:8280` |
| ESS production employee | `employee.example.com` | `127.0.0.1:8281` |

Replace every example hostname and port with approved values. Obtain TLS certificates and redirect HTTP to HTTPS. Existing Meeting Room proxy rules and containers must remain unchanged.

## Updating and monitoring

Pushing `develop` runs validation and deploys staging. Pushing or merging to `main` validates the exact commit and automatically starts production deployment. If the production Environment has required reviewers, approve the waiting job in GitHub Actions. The manual path remains available from **Actions → Validate and deploy → Run workflow** by selecting the `main` branch and `production` target.

On Ubuntu:

```bash
cd /opt/ess-portal-staging
docker compose --project-name ess-portal-staging --env-file .env ps
docker compose --project-name ess-portal-staging --env-file .env logs -f api
```

Backups are written under each deployment directory's `backups/` folder. Copy them to independent storage and define a retention policy. Never run `docker compose down -v` because it deletes persistent volumes.

## Values still required from the server administrator

- Ubuntu hostname/IP and SSH port
- Dedicated deploy username and SSH public-key installation
- Four final domain names, or two if only the admin and production apps are required
- Confirmed unused staging and production ports
- DNS records and HTTPS certificates
- GitHub environment secrets and variables
- Production environment approval rule
