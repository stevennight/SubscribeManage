# Deployment

SubscribeManage is released as two GHCR images:

- `ghcr.io/stevennight/subscribemanage-backend`
- `ghcr.io/stevennight/subscribemanage-frontend`

Production Compose only references images. It does not compile source code on the server.

## Production

```bash
git clone https://github.com/stevennight/SubscribeManage.git
cd SubscribeManage
cp .env.example .env
```

Set `SUBSCRIBEMANAGE_VERSION` in `.env` to an exact release tag, for example `v0.1.0`. Set a production `SECRET_KEY` and default credentials before starting:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

The web UI is exposed on `SUBSCRIBEMANAGE_PORT` (default `3000`). The backend health endpoint is available at `/api/health` on the backend port. The running build metadata is available at `/api/version`.

To upgrade, update only `SUBSCRIBEMANAGE_VERSION`, then pull and recreate the services:

```bash
docker compose pull
docker compose up -d
```

The SQLite database and uploaded files are stored under `backend/data` and `backend/uploads`. Back up these directories before upgrades. Do not use `docker compose down --volumes`.

## Local source build

Use the separate build Compose file when validating local source changes:

```bash
docker compose -f compose.build.yaml up -d --build
docker compose -f compose.build.yaml ps
```

This uses `subscribemanage-backend:local` and `subscribemanage-frontend:local`; it does not change the production image tags.

## Releases

Push a SemVer tag with the `v` prefix:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow validates the tag, builds both images for `linux/amd64` and `linux/arm64`, pushes versioned GHCR tags, and publishes GitHub release notes. Normal pushes and pull requests run backend/frontend checks and build both Docker images without pushing them.
