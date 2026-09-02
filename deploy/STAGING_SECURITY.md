# Staging security checklist

The application image now supplies browser security headers, blocks search-engine indexing, rate-limits login requests, and supports history-based frontend routes. Complete the infrastructure controls below on the cloud server.

## 1. Restrict staging access

Preferred: put the staging hostname behind the company VPN, Cloudflare Access, or another identity-aware proxy.

If the company has fixed public IP addresses, add an allowlist at the **outer** OpenResty/Nginx virtual host (the proxy that currently adds `X-Served-By`):

```nginx
allow 203.0.113.10/32; # replace with an approved office/VPN address
allow 198.51.100.0/24; # replace or remove
deny all;
```

Do not enable this until every required office/VPN IP has been confirmed. Reload only after validating the configuration:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 2. Firewall and exposed ports

- Allow public inbound traffic only to ports 80 and 443.
- Restrict SSH (22) to administrator/VPN IP addresses.
- Do not expose PostgreSQL 5432, the API container port, or internal Docker networks publicly.
- Confirm exposure with `sudo ss -lntup` and the cloud-provider firewall/security group.

## 3. TLS and proxy

- Keep HTTPS certificate renewal enabled and monitored.
- Redirect all HTTP traffic to HTTPS at the outer proxy.
- Preserve `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers.
- Do not remove the application security headers. If the outer proxy sets the same headers, keep one strict, consistent definition.

## 4. Secrets and data

- Use different database, JWT, SMTP, and integration secrets for staging and production.
- Rotate any secret that has ever appeared in a repository, terminal screenshot, chat, or shared file.
- Never copy production employee data into staging without approved masking/anonymization.
- Keep `.env`, backups, uploads, and SSH keys readable only by the deployment account.

## 5. Accounts and monitoring

- Remove default/test accounts and change temporary passwords.
- Require strong unique administrator passwords and use MFA at the access-proxy/VPN layer.
- Review failed-login and API error logs; configure alerts for repeated 401, 403, 429, and 500 responses.
- Keep automated database and upload backups, and test restoration periodically.

## 6. Verification after deployment

```bash
curl -I https://uatstagingportal.atoz.com.mm/
curl https://uatstagingportal.atoz.com.mm/robots.txt
curl https://uatstagingportal.atoz.com.mm/health
```

Verify that the response includes CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and `X-Robots-Tag`. Also open a nested route directly, refresh it, and test browser Back/Forward navigation.
