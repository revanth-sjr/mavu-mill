# சக்தி எண்ணெய் மற்றும் மாவு ஆலை — Mill Billing App (Server + Frontend)

This folder is the whole app: an Express + MySQL backend with real login
(JWT-based), and the billing/dashboard/products frontend, served together
from one Node process. Deploy this one folder and you get the whole thing
at one URL.

## What's in here

```
server.js              Express app: API + serves the frontend
config/db.js            MySQL connection pool
middleware/auth.js       Token verification + admin-only gate
controllers/, routes/    API logic (auth, products, orders)
db/schema.sql            Reference schema (server also creates this automatically)
public/                  The frontend (login, billing, dashboard, products pages)
.env.example              Copy to .env and fill in your own values
```

## 1. Local setup

You'll need Node.js 18+ and a MySQL (or MariaDB) server.

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=mavu_mill
JWT_SECRET=<generate one — see below>
PORT=4000
```

Generate a real `JWT_SECRET` (don't ship the example value):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the database (the app creates its own tables automatically, you
just need the empty database to exist):

```sql
CREATE DATABASE mavu_mill;
CREATE USER 'mavu_app'@'localhost' IDENTIFIED BY 'your_mysql_password';
GRANT ALL PRIVILEGES ON mavu_mill.* TO 'mavu_app'@'localhost';
FLUSH PRIVILEGES;
```

Start it:

```bash
npm start
```

Open **http://localhost:4000** — you'll land on the login page. On first
boot the server automatically creates the tables and seeds two accounts:

- **Admin** — `admin` / `admin123`
- **Staff** — `staff` / `staff123`

**Change these passwords before going live.** The simplest way: log in as
admin, go to the Products page → Team Accounts, create your own real admin
account with a strong password, then delete the `admin` and `staff` demo
accounts (you'll need at least one other admin to exist before you can
delete an admin account — that's a safety rule, not a bug).

## 2. How the login actually works now

- Passwords are hashed with bcrypt before they ever touch the database —
  the database never stores a plain-text password.
- Logging in returns a signed JWT (JSON Web Token) that the browser stores
  and sends back on every request. The server verifies it and looks the
  user up fresh from the database on every request, so if you delete
  someone's account or change their role, it takes effect immediately —
  not just after their token expires.
- Tokens expire after 12 hours, so people will need to log in again daily.
- Admin-only actions (adding products, changing prices, clearing dashboard
  data, managing accounts) are enforced **on the server**, not just hidden
  in the UI. Even if someone tampered with the frontend, the API itself
  refuses the request.

## 3. Deploying it online

Two pieces to host: the Node app, and a MySQL database. Because this server
serves the frontend too, you only deploy **one app service** plus a database.

**Checked August 2026 — but free tiers change constantly, so confirm current
terms on each provider's own pricing page before committing.**

### Option A — Free (₹0/month)

- **Database: Aiven for MySQL free tier** — always-free managed MySQL,
  roughly 1GB storage, no credit card required. This is currently one of the
  few genuinely always-free managed *MySQL* options (many providers only
  offer free PostgreSQL).
- **App: Render free web service** — deploys Node straight from GitHub, no
  credit card, 750 instance-hours/month.

The catch worth knowing up front: Render's free web services **sleep after
15 minutes of inactivity**, and the next request takes roughly 30–60 seconds
to wake up. For a mill counter where a customer is waiting for their receipt,
that delay is genuinely annoying.

Workaround: point a free uptime monitor (e.g. UptimeRobot) at
`https://your-app.onrender.com/api/health` every ~10 minutes. That keeps the
service awake. 750 hours/month is just about a full month of always-on for a
single service, so this fits — but it leaves no headroom for a second service.

### Option C — Vercel (Frontend CDN + Serverless Express)

With the included `vercel.json` and `api/index.js`, you can deploy directly to Vercel:
- **Frontend**: Served automatically from `public/` via Vercel's global edge network with instant load times.
- **Backend**: Express API routes (`/api/*`) execute as serverless Node.js functions.
- **Database**: Connect to an online MySQL provider (e.g. TiDB Cloud Serverless, Aiven, or Railway MySQL).

**Steps on Vercel:**
1. Import this repository into Vercel.
2. Leave Framework Preset as **Other** and Root Directory as `./`.
3. Add Environment Variables under **Project Settings > Environment Variables**:
   - `DATABASE_URL` (or `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
   - `DB_SSL=true`
   - `JWT_SECRET`
4. Click **Deploy**.

### Deployment steps (Render, Railway, or VPS)

1. Push this folder to a GitHub repo. The included `.gitignore` already
   excludes `.env` and `node_modules` — **never commit your real `.env`**.
2. Create your MySQL database on your chosen provider. Note the host, port,
   user, password, database name — and download the **CA certificate** if
   they provide one (Aiven does).
3. Create a new Node web service pointing at your repo:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Set environment variables in the host's dashboard (not in a file):
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
     (or a single `DATABASE_URL` if your provider gives you one)
   - `DB_SSL=true` — **required by essentially every cloud MySQL provider**
   - `DB_SSL_CA` — paste the CA certificate contents if you have one
     (more secure; without it the connection is still encrypted, but the
     server's identity isn't verified)
   - `JWT_SECRET` — a long random string, generated as shown in section 1
   - Leave `PORT` unset; most hosts set it automatically.
5. Deploy. On first boot the server creates its tables and seeds the demo
   accounts automatically, same as local.
6. Open the URL, log in as `admin`/`admin123`, create your real admin
   account under Products → Team Accounts, then delete the demo accounts.

## 4. API reference (for your own reference / future frontend work)

All routes are under `/api`. Protected routes need `Authorization: Bearer
<token>` header.

| Method | Path                  | Who        | What                          |
|--------|-----------------------|------------|-------------------------------|
| POST   | /api/auth/login       | anyone     | Log in, get a token           |
| GET    | /api/auth/me          | logged in  | Confirm session, get fresh role |
| GET    | /api/auth/users       | admin      | List all accounts             |
| POST   | /api/auth/register    | admin      | Create a new account          |
| DELETE | /api/auth/users/:id   | admin      | Remove an account             |
| GET    | /api/products         | logged in  | List the product catalogue    |
| POST   | /api/products         | admin      | Add a product                 |
| PUT    | /api/products/:id     | admin      | Update a product's price      |
| DELETE | /api/products/:id     | admin      | Remove a product              |
| GET    | /api/orders           | logged in  | List all orders               |
| POST   | /api/orders           | logged in  | Record a new bill             |
| DELETE | /api/orders           | admin      | Clear all orders              |

## 5. What's still local-only / next steps

- There's no "forgot password" flow yet — if someone forgets their
  password, an admin needs to delete their account and create a new one
  (or you can add a password-reset endpoint later).
- No automated database backups — check what your hosting provider offers,
  or set up a periodic `mysqldump` if this becomes business-critical.
- No rate limiting on the login endpoint — fine for a small internal team,
  worth adding (e.g. `express-rate-limit`) if this is ever exposed more
  broadly.
