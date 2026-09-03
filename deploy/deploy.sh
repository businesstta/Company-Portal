#!/usr/bin/env bash
set -Eeuo pipefail

branch="${1:?Usage: deploy/deploy.sh <branch> <commit-sha>}"
revision="${2:?Usage: deploy/deploy.sh <branch> <commit-sha>}"

repository_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_dir"

if [[ ! -f .env ]]; then
  echo "Missing $repository_dir/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

compose_project="${COMPOSE_PROJECT_NAME:?Set COMPOSE_PROJECT_NAME in .env}"
web_port="${WEB_PORT:?Set WEB_PORT in .env}"
health_host="${WEB_BIND_ADDRESS:-127.0.0.1}"
if [[ "$health_host" == "0.0.0.0" ]]; then
  health_host="127.0.0.1"
fi
compose=(docker compose --project-name "$compose_project" --env-file .env)
backup_dir="$repository_dir/backups"
previous_revision="$(git rev-parse HEAD)"

mkdir -p "$backup_dir"

timestamp="$(date +%Y%m%d-%H%M%S)"
if "${compose[@]}" ps --status running --services 2>/dev/null | grep -qx db; then
  echo "Creating database backup in $backup_dir"
  "${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
    > "$backup_dir/database-$timestamp.dump"
fi
if "${compose[@]}" ps --status running --services 2>/dev/null | grep -qx api; then
  echo "Creating upload backup in $backup_dir"
  "${compose[@]}" exec -T api tar -czf - -C /app/apps/api uploads \
    > "$backup_dir/uploads-$timestamp.tar.gz"
fi

echo "Fetching $branch at $revision"
git fetch --prune origin "$branch"
git checkout "$branch"
git reset --hard "$revision"

echo "Building $compose_project"
"${compose[@]}" config --quiet
"${compose[@]}" build --pull
"${compose[@]}" up -d --remove-orphans

echo "Waiting for application health"
healthy=0
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error "http://$health_host:$web_port/health" >/dev/null; then
    healthy=1
    break
  fi
  sleep 2
done

if [[ "$healthy" -ne 1 ]]; then
  echo "Deployment health check failed. Previous revision was $previous_revision." >&2
  "${compose[@]}" ps >&2
  "${compose[@]}" logs --tail=150 api web >&2
  exit 1
fi

"${compose[@]}" ps
echo "Successfully deployed $revision to $compose_project"
