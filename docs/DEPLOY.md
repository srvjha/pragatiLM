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

## 2. Getting in

The provider hands over `root` and a password. That combination on a public IP
is the one part of this setup that is attacked without being provoked: bots
sweep the whole address space for port 22, and `root` is the one username that
certainly exists, so half the guess is free. A new machine typically starts
seeing attempts within hours of being provisioned, before anything is deployed
on it.

A key ends that. The private half never leaves the laptop — the server sends a
challenge, the laptop answers it, and the secret itself is never transmitted.
There is no password left to guess.

**Check whether you already have one.** Most machines do, and a second key
solves nothing:

```bash
ls ~/.ssh/*.pub
```

If that prints `id_ed25519.pub`, use it. Only if there is nothing:

```bash
ssh-keygen -t ed25519 -C "your@email"
```

Accept the default path. A passphrase is worth setting — it is what protects
the key if the laptop is lost — and macOS will remember it in the keychain
after the first use.

**Install the public half.** Either paste the output of

```bash
cat ~/.ssh/id_ed25519.pub
```

into the provider's control panel (Contabo takes keys there after the server
exists, not only at checkout), or push it from here:

```bash
ssh-copy-id root@<vps-ip>
```

Only the `.pub` file is ever copied anywhere. The file without the extension
stays put; anyone holding it holds the server.

**Verify before locking the door.** In a second terminal, leaving the first
one connected:

```bash
ssh root@<vps-ip>
```

It should let you in without asking for a password. Once it does, and not
before:

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

The open session is the safety line. If the key turns out not to work and
passwords are already off, the way back in is the provider's rescue console or
a reinstall — so confirm the new way works while the old one is still there.

Everything below runs over that connection.

---

## 3. The machine

As root, once. The account name is yours to pick — `deploy` says what it is for
rather than who it belongs to, which matters only if someone else ever works on
this. Substitute it throughout if you choose otherwise:

```bash
USER=deploy
adduser $USER && usermod -aG sudo $USER
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER
```

Give it the same key, or it has no way in at all now that passwords are off — a
new account starts with an empty `authorized_keys`:

```bash
rsync --archive --chown=$USER:$USER ~/.ssh /home/$USER/
```

Then `ssh $USER@<vps-ip>` from the laptop, and stop using `root` for anything
that is not this section. What follows assumes that account's home directory,
so the one place the name is load bearing is the backup cron in section 8.

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

## 4. The code and its configuration

As that user, not root:

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

## 5. Start it

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

## 6. Check it works

```bash
curl https://backend-pragati.srvjha.in/api/health
```

`200` with a report means the API is up, the certificate was issued, and
Postgres, Redis and Qdrant are all reachable. `503` means the app is running but
something it depends on is not — the body says which.

If the certificate has not appeared, it is almost always DNS: `docker compose
-f docker-compose.prod.yml logs caddy` will say so plainly.

---

## 7. The front end

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

## 8. Backups

The one thing here that cannot be rebuilt is Postgres: Redis holds only jobs in
flight, and Qdrant's vectors are regenerated from the chunks in Postgres
whenever a source is re-indexed.

```bash
crontab -e
```

```cron
30 21 * * * cd ~/pragatiLM/server && CONTAINER=pragati-postgres-1 ./scripts/backup-db.sh >> ~/backup.log 2>&1
```

`~` rather than a spelled-out home directory, so the line does not care what the
account is called. Check the container name first with `docker ps`; compose
prefixes it with the project name.

**cron runs in UTC.** `30 21` is 3am IST, which is the point of picking it. The
obvious-looking `0 3 * * *` runs at 8:30am IST — the middle of the working day,
which is exactly when a dump competing for the disk is least welcome. Check what
the machine thinks the time is with `date -u` before deciding.

### Getting a copy off the machine

A copy that lives only on the machine being backed up protects against a dropped
table and nothing worse. If the disk fails, the database and every backup of it
go together, and that is the failure that ends a product rather than costing an
afternoon.

`rclone` copies the dump to object storage. Cloudflare R2 is the cheapest fit —
no egress fees, so a restore costs nothing — and at this size the bill is
effectively zero either way.

```bash
sudo -v && curl https://rclone.org/install.sh | sudo bash
rclone config
```

`rclone config` is a set of prompts. The answers that matter: `n` for a new
remote, name it `r2`, choose **Cloudflare R2** (or S3 with R2 as the provider,
depending on the version), and paste the access key, secret and account id from
the R2 dashboard. Leave the rest at their defaults.

Then prove it works before trusting it:

```bash
rclone lsd r2:                      # the buckets it can see
rclone copy ~/backup.log r2:pragatilm-backups --no-traverse
rclone ls r2:pragatilm-backups      # the file should be listed
```

Once it does, add the remote to the cron line and cut local retention, since the
off-box copies are governed by the bucket's own lifecycle rules rather than by
this disk:

```cron
30 21 * * * cd ~/pragatiLM/server && CONTAINER=pragati-postgres-1 RCLONE_REMOTE=r2:pragatilm-backups KEEP=7 ./scripts/backup-db.sh >> ~/backup.log 2>&1
```

`KEEP` is the number of local dumps retained. Fourteen copies of a growing
database is the single largest consumer of this disk over time, and there is no
reason to hold two weeks locally once every one of them is also somewhere else.

### Knowing when it stops

The script exits non-zero on failure, and cron mails that to a local mailbox
nobody reads — so a backup that quietly stopped working is discovered on the day
it is needed. A free dead man's switch closes that:

```cron
30 21 * * * cd ~/pragatiLM/server && CONTAINER=pragati-postgres-1 RCLONE_REMOTE=r2:pragatilm-backups KEEP=7 ./scripts/backup-db.sh >> ~/backup.log 2>&1 && curl -fsS -m 10 https://hc-ping.com/YOUR-UUID
```

The `&&` is the point: no ping unless the backup actually succeeded, so silence
is what raises the alarm rather than an error nobody sees.

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

**SSH asks for a password that no longer works.** Password authentication was
turned off before the key was in place, or the key went to `root` and the
login is as `deploy`. The provider's rescue console or VNC is the way back in;
from there, put the public key in that user's `~/.ssh/authorized_keys`,
`chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`, and try again.

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
