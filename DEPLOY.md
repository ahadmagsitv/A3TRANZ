# Deploying A3TRANZ on a Linux server

Two Node processes under PM2: the Fastify API and the Next.js admin console.
Postgres runs alongside them. The mobile app is not deployed here — it ships
through TestFlight / the App Store and only needs the API's public URL.

| Process | Port | What it is |
|---|---|---|
| `a3tranz-api` | 4001 | Fastify API + WebSocket hub + background worker |
| `a3tranz-admin` | 3000 | Next.js admin console, served under `/A3TRANZ` |
| postgres | 5432 | database |

No domain, no TLS: both apps are reached by the server's IP and port.

```bash
export SERVER_IP=203.0.113.10      # your server's public IP — used throughout
```

| | URL |
|---|---|
| Admin console | `http://SERVER_IP:3000/A3TRANZ/` |
| API | `http://SERVER_IP:4001` |

The API port is set in `ecosystem.config.cjs` (`PORT: 4001`). Change it there and
the four places below follow: `CORS_ORIGINS` is unaffected (that is the
console's port), but `NEXT_PUBLIC_API_URL`, the firewall rule, the mobile
`API_URL` and `api/.env`'s `PORT` all have to match it.

> **Plain HTTP means session tokens travel unencrypted.** Anyone on the path
> can read them and sign in as that user. This is acceptable to get running and
> for a trusted network; it is not acceptable long-term on the public internet.
> §8 is what you do the day you have a domain.

---

## 1. Prerequisites

```bash
node -v          # must be >= 22.11 — the API runs TypeScript directly
                 # via --experimental-strip-types, which needs it
npm i -g pm2
sudo apt install -y postgresql
# no nginx: without a domain there is nothing for it to terminate — see §8
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
PORT=4001
NODE_ENV=production

# Every origin the admin console is served from — scheme, host AND port, with
# no trailing slash, exactly as the browser sends it. A missing or misspelt
# entry means the browser fails the CORS preflight and the console reports
# "cannot reach the server" against an API that is running perfectly.
CORS_ORIGINS=http://203.0.113.10:3000

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
NEXT_PUBLIC_API_URL=http://$SERVER_IP:4001 npm run build
```

**`NEXT_PUBLIC_API_URL` is inlined into the browser bundle at build time.** It
is not read at runtime — putting it in PM2's `env` does nothing, and the site
will quietly call `http://localhost:4000` from your users' browsers. Changing
it means rebuilding.

The console is served under `basePath: "/A3TRANZ"` (`next.config.ts`), so the
real URL is `http://SERVER_IP:3000/A3TRANZ/`. `http://SERVER_IP:3000/` returns
404 — that is the config, not a fault.

Use the IP here, never `localhost`: this value ends up in the browser's
JavaScript, so `localhost` would mean *the viewer's own machine*, not the
server.

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
curl -s localhost:4001/health          # {"ok":true}
curl -sI localhost:3000/A3TRANZ/login/ # 200
```

That is on the server itself. §8 checks the same two from outside, which is
what actually matters.

Both apps run in **fork mode with one instance**, deliberately. The API keeps
its WebSocket clients in a module-level map and runs the background worker
in-process, so a second instance would strand half the live connections and run
every periodic sweep twice. Scale out only after moving the socket hub to Redis
(or Postgres `LISTEN/NOTIFY`) and the worker out of the API.

## 8. Open the two ports

No domain means no nginx and no TLS: Let's Encrypt will not issue a certificate
for a bare IP. The two Node processes are reached directly, so the firewall is
the only thing to configure.

```bash
sudo ufw allow 22/tcp        # do not lock yourself out
sudo ufw allow 3000/tcp      # admin console
sudo ufw allow 4001/tcp      # API — the mobile app talks to this too
sudo ufw enable
sudo ufw status
```

Postgres stays closed. It is only reached over `localhost` by the API on the
same box, so port 5432 must never be opened.

If the server is on a cloud provider, the provider's own firewall (AWS security
group, DigitalOcean cloud firewall, Azure NSG) has to allow 3000 and 4001 as
well — `ufw` alone is not enough there, and this is the usual reason a server
that looks fine locally is unreachable from outside.

Check from your own machine, not from the server:

```bash
curl -s http://$SERVER_IP:4001/health          # {"ok":true}
curl -sI http://$SERVER_IP:3000/A3TRANZ/login/ # 200
```

The WebSocket at `ws://SERVER_IP:4001/realtime` needs nothing extra — without a
reverse proxy in the way there is no upgrade to forward.

**Skipped deliberately: nginx, port 80, and TLS.** They buy nothing without a
domain, and a self-signed certificate is worse than plain HTTP here — iOS
rejects it outright, so the mobile app would stop working. Point a domain at
this IP when you have one; then add nginx (proxy 80/443 to 3000 and 4001,
forwarding `Upgrade`/`Connection` headers on `/realtime`), run
`certbot --nginx`, and change three values: `CORS_ORIGINS`,
`NEXT_PUBLIC_API_URL` (rebuild), and `API_URL` in the mobile app.

## 9. Point the mobile app at the server

Two edits, and the second one is not optional.

**a. The API address.** `mobile-app/src/data/api.ts` holds a LAN address for
development:

```ts
export const API_URL = 'http://192.168.100.8:4000';
```

Change it to `http://SERVER_IP:4001`.

**b. Allow cleartext to that IP.** iOS App Transport Security blocks plain HTTP
by default. The app currently carries an exception for the dev machine only:

```xml
<!-- mobile-app/ios/A3TranzDriver/Info.plist -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key><false/>
  <key>NSAllowsLocalNetworking</key><true/>
  <key>NSExceptionDomains</key>
  <dict>
    <key>192.168.100.8</key>
    <dict><key>NSExceptionAllowsInsecureHTTPLoads</key><true/></dict>
  </dict>
</dict>
```

`NSAllowsLocalNetworking` covers private ranges (192.168.x, 10.x, 172.16–31.x)
— it does **not** cover a public IP. Add the server's IP as a second entry
alongside the existing one:

```xml
    <key>203.0.113.10</key>
    <dict><key>NSExceptionAllowsInsecureHTTPLoads</key><true/></dict>
```

Miss this and every request fails at the network layer before it leaves the
phone. The app reports "Cannot reach the server. Check your connection."
against an API that is up and answering `curl` perfectly — there is no other
symptom, so it is worth checking first whenever the phone cannot log in.

> **Apple will not accept this on the App Store.** A cleartext exception needs
> justification in App Review, and an IP address cannot be justified for a
> shipping app. This is fine for a development build and for TestFlight
> internal testing; a domain with TLS is required before public release.

Rebuild the app after both edits — these are compiled in, not read at runtime.

## 10. Deploying an update

```bash
cd /srv/a3tranz
git pull
npm ci
cd api && npm run migrate && cd ..
cd admin-web && npm ci && NEXT_PUBLIC_API_URL=http://$SERVER_IP:4001 npm run build && cd ..
pm2 reload ecosystem.config.cjs
```

`pm2 reload` is a zero-downtime restart. The API does **not** watch files — a
`git pull` alone changes nothing until the process restarts. (This is worth
saying twice: a whole afternoon can go into debugging a fix that was never
running.)

## 11. When something is wrong

| Symptom | Cause |
|---|---|
| Console says "cannot reach the server" | `CORS_ORIGINS` must match the browser's origin exactly, **including the port** — `http://IP:3000`, no trailing slash. The preflight is what fails, not the request |
| Browser calls `localhost:4000` in production | `NEXT_PUBLIC_API_URL` was not set **at build time**, or was set to `localhost` — in browser code that means the viewer's machine. Rebuild with the IP |
| `http://IP:3000/` 404s | Correct — the console lives at `/A3TRANZ/` |
| API boots then exits | A required env var is missing; `env.ts` throws by design. `pm2 logs a3tranz-api` names it |
| Phone says "cannot reach the server" | The ATS exception is missing the server IP — see §9b. Nothing else produces this while `curl` works |
| Reachable on the server, not from outside | The cloud provider's firewall/security group still blocks 3000/4001 — `ufw` alone is not enough |
| No push on the phone | `FCM_CREDENTIALS` path wrong or unreadable. Push fails soft: the notification row is still written, so if the Alerts tab shows it, the problem is push and not the trigger |
| PM2 online but nothing serves | Check `pm2 logs` for `api listening on :4001`. No such line means the process started but never bound — the entry point must be `src/main.ts` (which always listens), never `src/server.ts` (which only exports `build()`) |

