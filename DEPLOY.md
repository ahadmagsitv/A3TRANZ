# Deploying A3TRANZ on a Linux server

Two Node processes under PM2: the Fastify API and the Next.js admin console.
Postgres runs alongside them. The mobile app is not deployed here — it ships
through TestFlight / the App Store and only needs the API's public URL.

| Process | Port | What it is |
|---|---|---|
| `a3tranz-api` | 4000 | Fastify API + WebSocket hub + background worker |
| `a3tranz-admin` | 3000 | Next.js admin console, served under `/A3TRANZ` |
| postgres | 5432 | database |

---

## 1. Prerequisites

```bash
node -v          # must be >= 22.11 — the API runs TypeScript directly
                 # via --experimental-strip-types, which needs it
npm i -g pm2
sudo apt install -y postgresql nginx
```

## 2. Database

```bash
sudo -u postgres psql
```
```sql
CREATE USER a3 WITH PASSWORD 'choose-a-real-password';
CREATE DATABASE a3tranz OWNER a3;
\q
```

## 3. Code

`api` is an npm workspace and resolves `@a3/domain` from the **root**
`node_modules`, so the root install is not optional. `admin-web` is not in the
workspace list and installs separately.

```bash
sudo mkdir -p /srv && cd /srv
git clone -b backend https://github.com/ahadmagsitv/A3TRANZ.git a3tranz
cd a3tranz

npm ci                      # ROOT — installs api + packages/domain
cd admin-web && npm ci && cd ..
```

Any of the three branches works — they all carry the whole repo.

## 4. api/.env

Never committed; the repo is public. Create it on the server:

```bash
cd /srv/a3tranz/api
cp .env.example .env
chmod 600 .env
```

```ini
DATABASE_URL=postgres://a3:choose-a-real-password@localhost:5432/a3tranz
PORT=4000
NODE_ENV=production

# Every origin the admin console is served from. A missing entry means the
# browser fails the CORS preflight and the console reports "cannot reach the
# server" against an API that is running perfectly.
CORS_ORIGINS=https://admin.example.com

# Cloudinary. REQUIRED in production — env.ts refuses to boot without them,
# deliberately: without real credentials the API hands out signatures nothing
# accepts and every upload fails at the client with no clue why.
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
# The primary/Root secret — delivery URLs are validated against this one.
CLOUDINARY_DELIVERY_SECRET=

# Push. A PATH, not the JSON — it is a private key and this repo is public.
# Unset simply means no push; notification rows are still written and the
# driver's Alerts tab still shows them.
FCM_CREDENTIALS=/srv/a3tranz/api/secrets/firebase-service-account.json
```

Upload the Firebase service-account JSON separately:

```bash
mkdir -p /srv/a3tranz/api/secrets
# scp it up, then:
chmod 600 /srv/a3tranz/api/secrets/firebase-service-account.json
```

## 5. Schema and the first admin

```bash
cd /srv/a3tranz/api
npm run migrate
```

There is no signup endpoint anywhere in the API, so an empty `users` table
means nobody can ever sign in. `seed:empty` leaves exactly one admin:

```bash
ADMIN_EMAIL=you@yourcompany.com ADMIN_PASSWORD='a-real-password' npm run seed:empty
```

> **`seed:empty` WIPES every table.** First install only. It refuses to run
> against a non-local `DATABASE_URL` as a guard, but that guard does not help
> if your production database is on localhost — which it is. Never run it
> again after go-live.

Everything else is created through the UI: drivers, customers, fleet, jobs.

## 6. Build the admin console

```bash
cd /srv/a3tranz/admin-web
NEXT_PUBLIC_API_URL=https://api.example.com npm run build
```

**`NEXT_PUBLIC_API_URL` is inlined into the browser bundle at build time.** It
is not read at runtime — putting it in PM2's `env` does nothing, and the site
will quietly call `http://localhost:4000` from your users' browsers. Changing
it means rebuilding.

The console is served under `basePath: "/A3TRANZ"` (`next.config.ts`), so the
real URL is `https://admin.example.com/A3TRANZ/`. The bare domain returns 404 —
that is the config, not a fault.

## 7. Start under PM2

```bash
cd /srv/a3tranz
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup          # run the command it prints, to survive reboots
```

```bash
pm2 status
pm2 logs a3tranz-api --lines 50
curl -s localhost:4000/health          # {"ok":true}
curl -sI localhost:3000/A3TRANZ/login/ # 200
```

Both apps run in **fork mode with one instance**, deliberately. The API keeps
its WebSocket clients in a module-level map and runs the background worker
in-process, so a second instance would strand half the live connections and run
every periodic sweep twice. Scale out only after moving the socket hub to Redis
(or Postgres `LISTEN/NOTIFY`) and the worker out of the API.

## 8. nginx + TLS

```nginx
server {
  server_name admin.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  server_name api.example.com;
  client_max_body_size 50M;          # attachments cap at 50 MB

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Live chat and badge updates. Without these two headers the upgrade fails
  # and the socket silently falls back to nothing: messages then only appear
  # when a screen refetches on its own.
  location /realtime {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
  }
}
```

```bash
sudo certbot --nginx -d admin.example.com -d api.example.com
```

The API trusts `X-Forwarded-*` (`trustProxy: true`), so the headers above are
what give it the real client protocol and address.

## 9. Point the mobile app at production

`mobile-app/src/data/api.ts` hardcodes a LAN address for development:

```ts
export const API_URL = 'http://192.168.100.8:4000';
```

Change it to `https://api.example.com` before building for release. Once it is
HTTPS you can also drop the ATS exception in
`mobile-app/ios/A3TranzDriver/Info.plist` (`NSExceptionDomains`), which exists
only to allow cleartext to the dev machine.

## 10. Deploying an update

```bash
cd /srv/a3tranz
git pull
npm ci
cd api && npm run migrate && cd ..
cd admin-web && npm ci && NEXT_PUBLIC_API_URL=https://api.example.com npm run build && cd ..
pm2 reload ecosystem.config.cjs
```

`pm2 reload` is a zero-downtime restart. The API does **not** watch files — a
`git pull` alone changes nothing until the process restarts. (This is worth
saying twice: a whole afternoon can go into debugging a fix that was never
running.)

## 11. When something is wrong

| Symptom | Cause |
|---|---|
| Console says "cannot reach the server" | `CORS_ORIGINS` missing the console's origin — the preflight is what fails, not the request |
| Browser calls `localhost:4000` in production | `NEXT_PUBLIC_API_URL` was not set **at build time**; rebuild |
| Bare domain 404s | Correct — the console lives at `/A3TRANZ/` |
| API boots then exits | A required env var is missing; `env.ts` throws by design. `pm2 logs a3tranz-api` names it |
| Chat only updates on navigation | `/realtime` is not proxying the WebSocket upgrade — see §8 |
| No push on the phone | `FCM_CREDENTIALS` path wrong or unreadable. Push fails soft: the notification row is still written, so if the Alerts tab shows it, the problem is push and not the trigger |
| PM2 online but nothing serves | Check `pm2 logs` for `api listening on :4000`; without that line the process started but never bound |

