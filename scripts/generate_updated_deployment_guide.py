from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Preformatted
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs" / "ESS_Portal_Production_Setup_and_Deployment_Guide_Updated.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#071B4F")
TEAL = colors.HexColor("#167D7F")
GOLD = colors.HexColor("#FFBD2E")
INK = colors.HexColor("#18324A")
MUTED = colors.HexColor("#647687")
PALE = colors.HexColor("#F2F7F8")
GREEN = colors.HexColor("#137248")
RED = colors.HexColor("#A82929")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="DocTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=30, textColor=NAVY, spaceAfter=14))
styles.add(ParagraphStyle(name="SubTitle", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=12, leading=16, textColor=TEAL, spaceAfter=18))
styles.add(ParagraphStyle(name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=NAVY, spaceBefore=4, spaceAfter=12))
styles.add(ParagraphStyle(name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=TEAL, spaceBefore=9, spaceAfter=6, keepWithNext=True))
styles.add(ParagraphStyle(name="Bodyx", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.3, leading=13.2, textColor=INK, spaceAfter=7))
styles.add(ParagraphStyle(name="Smallx", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, leading=11, textColor=MUTED, spaceAfter=5))
styles.add(ParagraphStyle(name="Bulletx", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.1, leading=12.7, textColor=INK, leftIndent=13, firstLineIndent=-8, bulletIndent=3, spaceAfter=4))
styles.add(ParagraphStyle(name="Callout", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=NAVY, backColor=colors.HexColor("#FFF5D6"), borderColor=GOLD, borderWidth=1, borderPadding=8, spaceBefore=6, spaceAfter=10))
styles.add(ParagraphStyle(name="Codex", parent=styles["Code"], fontName="Courier", fontSize=7.2, leading=9.4, textColor=NAVY, backColor=PALE, borderColor=colors.HexColor("#C8D9DE"), borderWidth=.6, borderPadding=8, spaceAfter=9))

def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, h - 18*mm, w, 18*mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(18*mm, h - 11.5*mm, "ESS PORTAL / PRODUCTION HANDOVER")
    canvas.setFillColor(GOLD)
    canvas.rect(18*mm, h - 18.8*mm, 40*mm, 1.8*mm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(18*mm, 11*mm, "Company Portal - Automatic Deployment Guide")
    canvas.drawRightString(w - 18*mm, 11*mm, f"Page {doc.page}")
    canvas.restoreState()

doc = BaseDocTemplate(str(OUT), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=25*mm, bottomMargin=18*mm, title="ESS Portal Production Setup and Automatic Deployment Guide", author="Company Portal")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
doc.addPageTemplates(PageTemplate(id="main", frames=[frame], onPage=header_footer))
story = []

def p(text, style="Bodyx"):
    story.append(Paragraph(text, styles[style]))

def h1(text): p(text, "H1x")
def h2(text): p(text, "H2x")
def bullet(text): story.append(Paragraph(text, styles["Bulletx"], bulletText="•"))
def code(text): story.append(Preformatted(text.strip(), styles["Codex"]))
def page(): story.append(PageBreak())
def table(rows, widths=None):
    data = [[Paragraph(str(cell), styles["Smallx"]) for cell in row] for row in rows]
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY), ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("GRID", (0,0), (-1,-1), .45, colors.HexColor("#D7E2E7")),
        ("BACKGROUND", (0,1), (-1,-1), colors.white), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, PALE]),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.extend([t, Spacer(1, 8)])

# Cover
story.append(Spacer(1, 24*mm))
p("DEPLOYMENT AND OPERATIONS GUIDE", "SubTitle")
p("ESS Portal", "DocTitle")
p("Production Setup, CI/CD and Automatic Cloud Deployment", "DocTitle")
p("UPDATED PURPOSE", "H2x")
p("This revision explains how a developer can update the local codebase, push an approved Git revision, and have the cloud server update automatically through GitHub Actions. It also retains the server setup, backup, rollback, monitoring and security controls required for production.")
table([
    ["Document item", "Value"],
    ["Repository", "businesstta/Company-Portal"],
    ["Updated date", "20 August 2026"],
    ["Primary automation", "GitHub Actions + SSH + Docker Compose"],
    ["Staging trigger", "Push to develop"],
    ["Production trigger", "Push/merge to main after enabling the documented workflow change"],
    ["Document status", "Updated automatic deployment handover"],
], [48*mm, 122*mm])
p("IMPORTANT", "H2x")
p("Saving a file on localhost alone cannot update the cloud server. The automatic trigger occurs only after the change is committed and pushed to the configured Git branch. Git remains the release record and rollback reference.", "Callout")
page()

h1("1. Desired Update Flow")
p("The intended operational flow is shown below. The cloud server never reads files directly from the developer's computer.")
code("LOCAL PC\n  edit + test\n      |\n      v\n  git commit + git push\n      |\n      v\nGITHUB REPOSITORY\n  GitHub Actions: install -> pnpm check\n      |\n      v\nSSH TO CLOUD SERVER\n  backup -> fetch exact revision -> build -> migrate -> start\n      |\n      v\nHEALTH CHECK\n  success = release complete / failure = investigate or rollback")
h2("1.1 Branch behavior")
table([
    ["Branch", "Purpose", "Recommended behavior"],
    ["feature/*", "Individual development", "Validation through pull request; no cloud deployment"],
    ["develop", "Shared testing", "Automatic staging deployment after validation"],
    ["main", "Live release", "Automatic production deployment after validation; protect main with pull-request review"],
], [32*mm, 50*mm, 88*mm])
h2("1.2 What 'automatic' means")
bullet("The developer tests locally and pushes a commit.")
bullet("GitHub Actions validates the exact commit before any server change.")
bullet("The workflow connects to the server using a dedicated SSH key.")
bullet("The server creates backups, rebuilds containers, runs pending migrations and checks health.")
bullet("The workflow result becomes the deployment audit trail.")
p("Do not configure a cloud server to continuously copy an uncommitted localhost folder. That removes review, audit and reliable rollback.", "Callout")
page()

h1("2. Current Repository Readiness")
p("The repository already includes the deployment building blocks below. The principal change needed for automatic production deployment is the production job trigger in the GitHub Actions workflow.")
table([
    ["Repository file", "Purpose"],
    ["docker-compose.yml", "Runs PostgreSQL, API, administration web and employee web with isolated project names and persistent volumes."],
    ["deploy/staging.env.example", "Safe staging defaults and isolated ports."],
    ["deploy/production.env.example", "Safe production defaults and isolated ports."],
    ["deploy/deploy.sh", "Backs up data, fetches an exact revision, rebuilds, starts services and performs health checks."],
    [".github/workflows/deploy.yml", "Validates pushes and deploys over SSH. Staging is currently automatic; production is currently manual until Section 6 is applied."],
    ["DEPLOYMENT.md", "Repository-level operational runbook."],
], [52*mm, 118*mm])
h2("2.1 Controls already provided")
bullet("pnpm install --frozen-lockfile and pnpm check run before deployment.")
bullet("The remote deployment script creates database and upload backups when services are running.")
bullet("The selected Git revision is deployed rather than an untracked server copy.")
bullet("Pending database migrations run during API startup.")
bullet("The deployment fails when the web health endpoint does not become healthy.")
page()

h1("3. Production Topology and Isolation")
p("ESS Portal can share an Ubuntu server with the Meeting Room application only when domains, ports, Docker project names, databases, networks and volumes remain separate.")
table([
    ["Environment", "Example URL", "Host port", "Git branch"],
    ["ESS staging admin", "dev-ess.example.com", "8180", "develop"],
    ["ESS staging employee", "dev-employee.example.com", "8181", "develop"],
    ["ESS production admin", "ess.example.com", "8280", "main"],
    ["ESS production employee", "employee.example.com", "8281", "main"],
], [42*mm, 58*mm, 30*mm, 40*mm])
h2("3.1 Server prerequisites")
bullet("Current Ubuntu LTS, Docker Engine 26 or newer, Docker Compose v2, Git and curl.")
bullet("At least 2 CPU cores and 4 GB RAM, adjusted for other applications on the host.")
bullet("DNS control, trusted HTTPS certificates and outbound access to GitHub/container registries.")
bullet("Dedicated non-root deployment account with permission to run Docker.")
h2("3.2 Conflict checks")
code("sudo ss -lntp\ndocker ps --format 'table {{.Names}}\\t{{.Ports}}\\t{{.Status}}'\ndocker network ls\ndocker volume ls\ndf -h\nfree -h")
p("STOP CONDITION: do not continue when an ESS port is already in use. Select a different port and update the matching environment file and reverse proxy target.", "Callout")
page()

h1("4. One-Time Ubuntu Setup")
h2("4.1 Create isolated working copies")
code("sudo mkdir -p /opt/ess-portal-staging /opt/ess-portal-production\nsudo chown -R DEPLOY_USER:DEPLOY_USER /opt/ess-portal-staging /opt/ess-portal-production\n\ngit clone --branch develop https://github.com/businesstta/Company-Portal.git /opt/ess-portal-staging\ngit clone --branch main https://github.com/businesstta/Company-Portal.git /opt/ess-portal-production")
h2("4.2 Create protected environment files")
code("cd /opt/ess-portal-staging\ncp deploy/staging.env.example .env\nchmod 600 .env\n\ncd /opt/ess-portal-production\ncp deploy/production.env.example .env\nchmod 600 .env")
h2("4.3 Required separation")
bullet("Use different COMPOSE_PROJECT_NAME values.")
bullet("Use different databases, database users, passwords and JWT secrets.")
bullet("Use different loopback ports and public domains.")
bullet("Never commit .env, private keys, database dumps or upload archives.")
h2("4.4 Generate secrets")
code("openssl rand -hex 64\nopenssl rand -base64 36")
page()

h1("5. GitHub CI/CD Secrets")
h2("5.1 Create environments")
p("Open GitHub Repository Settings -> Environments. Create <b>staging</b> and <b>production</b>.")
table([
    ["Secret", "Required value"],
    ["DEPLOY_HOST", "Ubuntu hostname or public/private IP reachable by GitHub Actions"],
    ["DEPLOY_USER", "Dedicated Ubuntu deployment account"],
    ["DEPLOY_SSH_KEY", "Private key for the deploy account"],
    ["DEPLOY_KNOWN_HOSTS", "Independently verified SSH host-key entry"],
], [52*mm, 118*mm])
table([
    ["Variable", "Staging", "Production"],
    ["DEPLOY_PORT", "22 or approved SSH port", "22 or approved SSH port"],
    ["DEPLOY_PATH", "/opt/ess-portal-staging", "/opt/ess-portal-production"],
], [44*mm, 63*mm, 63*mm])
h2("5.2 Create a deploy key")
code("ssh-keygen -t ed25519 -f ess_portal_deploy -C ess-portal-deploy\nssh-keyscan -H YOUR_SERVER_HOST")
bullet("Install only the .pub key in DEPLOY_USER's ~/.ssh/authorized_keys.")
bullet("Store the private key only in GitHub Environment secrets.")
bullet("Verify the host key through a trusted channel before saving DEPLOY_KNOWN_HOSTS.")
page()

h1("6. Enable Automatic Production Deployment")
p("The current workflow deploys production only through workflow_dispatch. To make an approved main push update the cloud server automatically, change the deploy-production job condition in <b>.github/workflows/deploy.yml</b>.")
h2("6.1 Replace the current condition")
code("# CURRENT - manual production only\nif: github.event_name == 'workflow_dispatch' && inputs.target == 'production'")
h2("6.2 Use this condition")
code("# UPDATED - every push/merge to main deploys production\nif: >-\n  (github.event_name == 'push' && github.ref_name == 'main') ||\n  (github.event_name == 'workflow_dispatch' && inputs.target == 'production')")
h2("6.3 Deploy the exact pushed revision")
p("The production DEPLOY_REVISION expression should keep the pushed commit SHA for push events and origin/main for a manual run:")
code("DEPLOY_REVISION: ${{ github.event_name == 'workflow_dispatch' && 'origin/main' || github.sha }}")
h2("6.4 Protect main before enabling auto production")
bullet("Require a pull request before merging to main.")
bullet("Require the validation status check to pass.")
bullet("Block force pushes and direct deletion of main.")
bullet("Require at least one reviewer for production-impacting changes.")
p("If the production GitHub Environment has a required reviewer, the workflow starts automatically but waits for approval. Remove that reviewer rule only when fully unattended production deployment is explicitly accepted.", "Callout")
page()

h1("7. Daily Local-to-Cloud Procedure")
h2("7.1 Test locally")
code("pnpm install --frozen-lockfile\npnpm check\npnpm dev")
p("Confirm the changed screens and API behavior at localhost before creating the release commit.")
h2("7.2 Update staging automatically")
code("git switch develop\ngit pull --ff-only\ngit add <reviewed-files>\ngit commit -m \"Describe the ESS Portal change\"\ngit push origin develop")
p("GitHub Actions validates the push and deploys the exact commit to staging. Test the staging URLs; localhost is no longer involved after the push.")
h2("7.3 Update production automatically")
bullet("Create a pull request from develop to main.")
bullet("Wait for validation and staging acceptance.")
bullet("Review and merge the pull request.")
bullet("The resulting push to main starts the production deployment automatically.")
bullet("If an Environment approval gate is configured, approve it in GitHub Actions.")
bullet("Verify the production URL, login and the changed business workflow.")
h2("7.4 Direct main workflow - not recommended")
code("git switch main\ngit pull --ff-only\n# merge only reviewed work\ngit push origin main")
p("A direct main push is safe only when branch protection, review and organizational policy explicitly allow it.", "Callout")
page()

h1("8. What Happens on the Cloud Server")
p("GitHub Actions uses SSH to run deploy/deploy.sh inside the correct deployment directory. The script performs these operations in order:")
bullet("Loads the protected server .env file.")
bullet("Creates timestamped PostgreSQL and upload backups when containers are running.")
bullet("Fetches the named branch and resets the working copy to the requested exact revision.")
bullet("Validates Docker Compose configuration.")
bullet("Rebuilds images and starts/recreates services without deleting persistent volumes.")
bullet("Allows the API startup process to apply pending migrations.")
bullet("Waits for the web health endpoint and prints diagnostics on failure.")
h2("8.1 First manual verification")
code("cd /opt/ess-portal-production\ndocker compose --project-name ess-portal-production --env-file .env config --quiet\nbash deploy/deploy.sh main origin/main\ncurl --fail http://127.0.0.1:8280/health\ncurl --fail http://127.0.0.1:8280/healthz")
p("Complete one successful manual production deployment before switching on automatic main deployment. This validates credentials, paths, ports, Compose configuration, backups and health checks.", "Callout")
page()

h1("9. Reverse Proxy, DNS and HTTPS")
p("Nginx or Caddy should accept public traffic on ports 80 and 443. ESS containers should remain bound to 127.0.0.1.")
h2("9.1 Nginx pattern")
code("server {\n    listen 80;\n    server_name ess.example.com;\n    location / {\n        proxy_pass http://127.0.0.1:8280;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n    }\n}")
h2("9.2 Validate")
code("sudo nginx -t\nsudo systemctl reload nginx")
bullet("Create DNS records before requesting certificates.")
bullet("Issue trusted TLS certificates for every hostname and redirect HTTP to HTTPS.")
bullet("Set WEB_ORIGIN to the exact HTTPS browser origins without trailing slashes.")
bullet("Do not expose PostgreSQL or the API container port publicly.")
page()

h1("10. Monitoring and Transaction Logs")
h2("10.1 Server status")
code("cd /opt/ess-portal-production\ndocker compose --project-name ess-portal-production --env-file .env ps\ndocker compose --project-name ess-portal-production --env-file .env logs --tail=200 api db web mobile\ncurl --fail http://127.0.0.1:8280/health\ncurl --fail http://127.0.0.1:8280/healthz")
h2("10.2 Live API transaction monitoring")
code("docker compose --project-name ess-portal-production --env-file .env logs -f --tail=100 api")
p("Press Ctrl+C to stop following logs; the containers continue running. Avoid exposing passwords, tokens, personal data or full request bodies in production logs.")
h2("10.3 Minimum alerts")
bullet("Admin and employee HTTP health checks.")
bullet("Container restart/unhealthy-state alerts.")
bullet("Disk usage alerts for Docker, PostgreSQL, uploads and backups.")
bullet("Backup success and periodic restore-test records.")
bullet("TLS certificate expiry monitoring and retained API/reverse-proxy logs.")
page()

h1("11. Backup, Rollback and Failure Handling")
h2("11.1 Backup policy")
bullet("Copy deployment backups to separate storage; local server copies are not sufficient.")
bullet("Encrypt backups at rest and in transit and define daily/weekly/monthly retention.")
bullet("Back up database and uploads as a matching recovery set.")
bullet("Test restoration regularly.")
h2("11.2 Application rollback")
code("cd /opt/ess-portal-production\ngit log --oneline -10\nbash deploy/deploy.sh main PREVIOUS_COMPATIBLE_COMMIT_SHA")
h2("11.3 Failed automatic deployment")
bullet("Open the failed GitHub Actions run and identify whether validation, SSH, build or health check failed.")
bullet("Check API, database and web logs on the server.")
bullet("Do not repeatedly rerun a deployment without understanding a migration or data failure.")
bullet("Fix forward when safe; otherwise deploy the previous compatible revision.")
p("Never run docker compose down -v in staging or production. The -v option deletes persistent database and upload volumes. Do not roll code back across an incompatible migration without restoring the matching pre-deployment backup.", "Callout")
page()

h1("12. Security and Acceptance Checklist")
h2("12.1 Security baseline")
bullet("Use a dedicated non-root deployment account and a dedicated SSH key.")
bullet("Restrict inbound SSH to approved sources where possible; publish only HTTPS.")
bullet("Keep databases and internal API networking private.")
bullet("Use unique staging and production credentials and rotate them under change control.")
bullet("Protect main with reviews and required CI checks before unattended production deployment.")
bullet("Patch Ubuntu, Docker and base images on a schedule.")
h2("12.2 Go-live checklist")
for item in [
    "Meeting Room remains healthy and unchanged.", "All ESS ports are confirmed unused.",
    "Staging and production use separate Compose projects, databases and volumes.",
    "Protected .env files exist with chmod 600 and are not tracked by Git.",
    "DNS and trusted HTTPS certificates are active.", "GitHub secrets, variables and host keys are verified.",
    "A manual first deployment and health check have passed.", "develop automatically updates staging.",
    "main branch protection is active before automatic production deployment.",
    "Database/upload backups are verified and copied off-server.",
    "Production login, core workflows, uploads, imports/exports and printing pass.",
    "Monitoring, retention and incident ownership are assigned.",
]: bullet("[ ] " + item)
page()

h1("Appendix A. Server Values Worksheet")
table([
    ["Configuration item", "Approved value / owner / date"],
    ["Ubuntu host / IP", ""], ["SSH port", ""], ["Deploy username", ""],
    ["Meeting Room occupied ports", ""], ["Staging domains / ports", ""],
    ["Production domains / ports", ""], ["Backup destination and retention", ""],
    ["Main branch reviewer", ""], ["Production approval policy", ""],
    ["Monitoring owner", ""], ["Planned go-live window", ""],
], [70*mm, 100*mm])
h1("Appendix B. Release Record")
table([
    ["Field", "Value"], ["Release commit SHA", ""], ["Pull request", ""],
    ["Staging validation date", ""], ["Production trigger time", ""],
    ["Database backup file", ""], ["Upload backup file", ""],
    ["GitHub Actions run", ""], ["Post-deployment verifier", ""],
], [70*mm, 100*mm])
h1("Appendix C. Reference Locations")
bullet("Repository: https://github.com/businesstta/Company-Portal")
bullet("Deployment workflow: .github/workflows/deploy.yml")
bullet("Remote deployment script: deploy/deploy.sh")
bullet("Docker configuration: docker-compose.yml")
bullet("Repository runbook: DEPLOYMENT.md")

doc.build(story)
print(OUT)
