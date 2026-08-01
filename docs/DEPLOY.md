# Deploying

The front end goes to Vercel. The back end — the API, the worker, Postgres,
Redis and Qdrant — goes to one VPS, behind Caddy.

```
                    pragati.srvjha.in ─────> Vercel (Next.js)
Browser                                          │
   └────── backend-pragati.srvjha.in ──> VPS :443
                                          Caddy
                                            │ http://api:4000
                                          ┌─┴──────────────────────┐
                                          │ api      worker        │
                                          │ postgres redis qdrant  │  private
                                          └────────────────────────┘  network
```

Both names sit under `srvjha.in`, which is the point: same registrable domain
means the session cookie is an ordinary `SameSite=Lax` one, and none of the
cross-site cookie machinery is needed.

Nothing but Caddy is reachable from the internet. The data stores have no
published ports at all — in development they are published for convenience, and
on a public address that would be an open database, since Redis and Qdrant have
no password.

---

## Before you start

- A VPS. 8 GB RAM is comfortable: Postgres, Qdrant, Redis and two Node
  processes use 3–4 GB between them.
- The domain, with DNS you can edit.
- Keys: OpenAI, Cohere, Sarvam. Google OAuth if social sign-in is wanted.

---

## 1. DNS

Two records, before anything else — Caddy cannot obtain a certificate for a
name that does not yet point at the machine.

| Name | Type | Value |
|------|------|-------|
| `backend-pragati` | A | your VPS IP |
| `pragati` | CNAME | `cname.vercel-dns.com` |

Check it has propagated before moving on:

```bash
dig +short backend-pragati.srvjha.in
```

---

## 2. The machine

As root, once:

```bash
adduser deploy && usermod -aG sudo deploy
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Then the firewall. Only three ways in: SSH, and the two ports Caddy needs.

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

Nothing opens 5432, 6379 or 6333, and nothing should. The containers reach each
other on a private network; the host does not publish them.

---

## 3. The code and its configuration

As `deploy`:

```bash
git clone https://github.com/srvjha/pragatiLM.git
cd pragatiLM/server
cp .env.production.example .env
```

Then fill in `.env`. The values that matter most:

```bash
# Generate the secret rather than inventing one. The app refuses to start in
# production without it.
openssl rand -base64 32
```

| Variable | Value |
|----------|-------|
| `BETTER_AUTH_SECRET` | the generated string |
| `POSTGRES_PASSWORD` | a long random string |
| `DATABASE_URL` | `postgresql://postgres:<that password>@postgres:5432/notebook_rag` |
| `DATABASE_URL_READONLY` | `postgresql://notebook_ro:notebook_ro@postgres:5432/notebook_rag` |
| `WEB_ORIGIN` | `https://pragati.srvjha.in` |
| `BETTER_AUTH_URL` | `https://backend-pragati.srvjha.in` |
| `OPENAI_API_KEY`, `COHERE_API_KEY`, `SARVAM_API_KEY` | yours |

The host names are `postgres`, `redis` and `qdrant` — service names on the
compose network, not `localhost`. `localhost` inside a container is that
container.

`notebook_ro` is the least-privilege role the SQL retrieval route runs
generated statements as. Migration `0001` creates it, so there is nothing to do
by hand.

---

## 4. Start it

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The first build takes a few minutes. In order: the data stores come up and pass
their health checks, `migrate` applies the schema and exits, then `api` and
`worker` start. The API waits for the migration to succeed, so a deploy that
carries a schema change cannot serve requests against the old one.

Watch it:

```bash
docker compose -f docker-compose.prod.yml logs -f api worker
```

---

## 5. Check it works

```bash
curl https://backend-pragati.srvjha.in/api/health
```

`200` with a report means the API is up, the certificate was issued, and
Postgres, Redis and Qdrant are all reachable. `503` means the app is running but
something it depends on is not — the body says which.

If the certificate has not appeared, it is almost always DNS: `docker compose
-f docker-compose.prod.yml logs caddy` will say so plainly.

---

## 6. The front end

On Vercel, set the environment variable:

```
NEXT_PUBLIC_API_URL=https://backend-pragati.srvjha.in
```

and point the project at `pragati.srvjha.in`.

If Google sign-in is used, add the callback in the Google console:

```
https://backend-pragati.srvjha.in/api/auth/callback/google
```

The callback is built from `BETTER_AUTH_URL`, so it must match exactly.

---

## 7. Backups

The one thing here that cannot be rebuilt is Postgres: Redis holds only jobs in
flight, and Qdrant's vectors are regenerated from the chunks in Postgres
whenever a source is re-indexed.

```bash
crontab -e
```

```cron
0 3 * * * cd /home/deploy/pragatiLM/server && CONTAINER=pragati-postgres-1 ./scripts/backup-db.sh >> /var/log/dochat-backup.log 2>&1
```

Check the container name first with `docker ps`; compose prefixes it with the
project name.

A copy that lives only on the machine being backed up protects against a
dropped table and nothing worse. Install `rclone`, run `rclone config` once for
Cloudflare R2 or Backblaze B2 — both free at this size — and add
`RCLONE_REMOTE=r2:your-bucket` to that line.

Then restore one, once, before you need it:

```bash
DB_NAME=restore_test ./scripts/restore-db.sh backups/<file>.sql.gz
```

A backup nobody has restored is a hope, not a backup.

---

## Deploying a change

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Compose rebuilds, applies any new migration, and replaces the containers whose
image changed. The data stores are untouched because their images did not
change.

## Day to day

```bash
# what is running
docker compose -f docker-compose.prod.yml ps

# logs, one service or several
docker compose -f docker-compose.prod.yml logs -f worker

# restart one thing
docker compose -f docker-compose.prod.yml restart api

# a psql prompt
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres notebook_rag
```

**Never `docker compose down -v`.** The `-v` deletes the volumes, which is to
say the database. Plain `down` is safe.

---

## When something is wrong

**The API restarts in a loop.** Usually configuration: the app validates its
whole environment at boot and refuses to start on anything missing, naming it.
`logs api` will have the reason on the first line.

**Sign-in appears to work, then every request is logged out.** The cookie is
not coming back. Check `WEB_ORIGIN` matches the front end's address exactly,
scheme included, and that `BETTER_AUTH_URL` is the public API address rather
than `localhost`.

**YouTube sources fail, uploads are fine.** `yt-dlp` is a program rather than a
dependency, and lives in the image. `docker compose -f docker-compose.prod.yml
exec worker yt-dlp --version` should answer. YouTube changes things and yt-dlp
follows: bump `YTDLP_VERSION` in the Dockerfile and rebuild.

**Episodes fail at the synthesis step.** Check the Sarvam balance at
`dashboard.sarvam.ai/billing`. Credits run out quietly and the failure surfaces
as a refused request per turn.

**Disk filling.** `df -h`, then `du -sh /var/lib/docker/volumes/*`. Uploaded
files dominate, at roughly 28 MB per source. The cheap fix is the provider's
storage upgrade; the structural one is moving `source_files` and
`podcast_audio` out of Postgres into object storage.
