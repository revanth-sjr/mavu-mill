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

## 3. Deploying it online (free/cheap)

Two pieces to host: the Node app itself, and a MySQL database. Since this
server serves the frontend too, you only need to deploy **one service**.

A couple of realistic starting points as of mid-2026:

- **Railway** — deploys Node + MySQL together, and has historically been
  one of the easier ways to get a Node+Express+MySQL app online without
  needing a credit card up front.
- **Render** — free web service hosting for the Node app is easy to set
  up, but Render's own managed database is Postgres, not MySQL — you'd
  point it at a MySQL database hosted elsewhere (e.g. a small managed
  MySQL provider, or a MySQL instance on the same host as above).

**Free tiers on every hosting platform change often** (limits, sleep/cold-start
behavior, whether a credit card is required) — it's worth checking each
platform's current pricing page before committing, rather than trusting
any specific numbers as gospel. Whichever you pick, the steps are the same
shape:

1. Push this `server/` folder to a GitHub repo.
2. Create a MySQL database on your chosen provider; note the host, port,
   user, password, and database name.
3. Create a new Node web service pointing at your repo, with **Start
   Command**: `npm start`.
4. Set the environment variables from your `.env` (`DB_HOST`, `DB_PORT`,
   `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`) in the host's
   dashboard — never commit your real `.env` file.
5. Deploy. On first boot, the server creates its tables and seeds the two
   demo accounts automatically — same as local setup.
6. Log in, create your real accounts, delete the demo ones.

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
