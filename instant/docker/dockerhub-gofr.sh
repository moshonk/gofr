#!/usr/bin/env bash
set -ex

# automate tagging with the short commit hash
# docker build --no-cache -t intrahealth/gofr:$(git rev-parse --short HEAD) .
# docker tag intrahealth/gofr:$(git rev-parse --short HEAD) intrahealth/gofr
# docker push intrahealth/gofr:$(git rev-parse --short HEAD)
# docker push intrahealth/gofr:latest

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load Docker Hub credentials from .env file
ENV_FILE="${SCRIPT_DIR}/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: env file not found at $ENV_FILE"
  echo "Create it with DOCKER_USERNAME and DOCKER_PASSWORD"
  exit 1
fi
set +x
source "$ENV_FILE"
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
set -x
docker build --no-cache -f "$REPO_ROOT/instant/docker/Dockerfile" -t moshonk/gofr:$(git rev-parse --short HEAD) "$REPO_ROOT"
docker tag moshonk/gofr:$(git rev-parse --short HEAD) moshonk/gofr
docker push moshonk/gofr:$(git rev-parse --short HEAD)
docker push moshonk/gofr:latest