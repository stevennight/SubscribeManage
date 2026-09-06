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

Set `SUBSCRIBEMANAGE_VERSION` in `.env` to an exact release tag, for example `v0.1.3`. Set a production `SECRET_KEY` and default credentials before starting. If the GHCR packages are private, log in with a GitHub token that has `read:packages`:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u stevennight --password-stdin
```

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

## Outbound proxy (restricted networks)

If the server cannot reach `api.telegram.org`, `www.google.com` (favicon lookup) or the exchange-rate API directly, set a SOCKS/HTTP proxy under **Settings → 网络代理** in the web UI. It is applied only to those three outbound integrations; all other traffic is unaffected and ambient `HTTP(S)_PROXY` / `ALL_PROXY` environment variables are ignored. Supported forms: `socks5://`, `socks5h://` (remote DNS), `http://`, `https://`, optionally with `user:pass@`. Use **测试连通性** to verify the proxy can reach Telegram and Google.

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
git tag v0.1.3
git push origin v0.1.3
```

The release workflow validates the tag, builds both images for `linux/amd64` and `linux/arm64`, pushes versioned GHCR tags, and publishes GitHub release notes. Normal pushes and pull requests run backend/frontend checks and build both Docker images without pushing them.
