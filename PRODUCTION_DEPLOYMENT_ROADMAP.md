# Production Deployment & Security Hardening Roadmap

> **Target Application:** `tokkiweb-backend` (Node.js 20+ / Express 4.x / PostgreSQL / Clerk Auth / Sharp & Multer Image Pipeline)  
> **Production Domain:** `tokkishopve.com` (`api.tokkishopve.com` for API, `www.tokkishopve.com` for Frontend & Admin)  
> **Process Manager:** Native Linux `systemd` (Bare-Metal VPS)  
> **Status:** Actionable Deployment & Security Guide  

---

## Table of Contents
1. [Architecture, Domain & DNS Setup](#1-architecture-domain--dns-setup)
   - [DNS Records Configuration](#dns-records-configuration)
   - [Frontend Routing & CORS Origin Clarification](#frontend-routing--cors-origin-clarification)
2. [Server Setup from Scratch (Ubuntu/Debian VPS)](#2-server-setup-from-scratch-ubuntudebian-vps)
   - [Phase 1: OS Provisioning & Firewall Hardening](#phase-1-os-provisioning--firewall-hardening)
   - [Phase 2: Runtime & Tooling Installation](#phase-2-runtime--tooling-installation)
   - [Phase 3: PostgreSQL 16 Setup & Database Provisioning](#phase-3-postgresql-16-setup--database-provisioning)
   - [Phase 4: Application & Storage Directory Provisioning](#phase-4-application--storage-directory-provisioning)
   - [Phase 5: Environment Variables Configuration](#phase-5-environment-variables-configuration)
   - [Phase 6: Process Management with Native Systemd](#phase-6-process-management-with-native-systemd)
   - [Phase 7: Nginx Reverse Proxy, Static File Offload & SSL](#phase-7-nginx-reverse-proxy-static-file-offload--ssl)
3. [Security Hardening Roadmap](#3-security-hardening-roadmap)
   - [1. Helmet & HTTP Security Headers](#1-helmet--http-security-headers)
   - [2. Rate Limiting (`express-rate-limit`)](#2-rate-limiting-express-rate-limit)
   - [3. Express Trust Proxy Configuration](#3-express-trust-proxy-configuration)
   - [4. Request Body Payload Size Capping](#4-request-body-payload-size-capping)
   - [5. CORS Hardening](#5-cors-hardening)
   - [6. Database Query Log Sanitization & Least Privilege](#6-database-query-log-sanitization--least-privilege)
   - [7. Production Clerk Auth Transition](#7-production-clerk-auth-transition)
   - [8. Graceful Shutdown & Unhandled Error Protection](#8-graceful-shutdown--unhandled-error-protection)
   - [9. Dedicated Health Check Endpoint](#9-dedicated-health-check-endpoint)
   - [10. File Uploads & Upload Directory Isolation](#10-file-uploads--upload-directory-isolation)
4. [Disaster Recovery & Automated Backups](#4-disaster-recovery--automated-backups)
   - [Database Backup Cron Job](#database-backup-cron-job)
   - [Images Backup Cron Job](#images-backup-cron-job)
5. [Pre-Launch & Post-Deployment Checklist](#5-pre-launch--post-deployment-checklist)

---

## 1. Architecture, Domain & DNS Setup

### Production Topology

```
                  ┌──────────────────────────────────────────────┐
                  │                 CLIENT / WEB                 │
                  │   Storefront: https://www.tokkishopve.com    │
                  │   Admin:      https://www.tokkishopve.com    │
                  │               └─ /tokki-admin                │
                  └───────────────────────┬──────────────────────┘
                                          │ HTTPS (443)
                                          ▼
                  ┌──────────────────────────────────────────────┐
                  │          NGINX REVERSE PROXY (VPS)           │
                  │         https://api.tokkishopve.com          │
                  │   - TLS Termination (Let's Encrypt SSL)      │
                  │   - Gzip / Brotli compression                │
                  │   - Direct Static Offloading for /images/*   │
                  │   - HTTP/2 + Security Headers                │
                  └───────────────┬──────────────────────┬───────┘
                                  │                      │
         Proxy /api requests      │                      │ Direct static read
         (http://127.0.0.1:3000)  │                      │ (Bypasses Node.js)
                                  ▼                      ▼
               ┌──────────────────────────┐   ┌──────────────────────────┐
               │    NODE.JS (SYSTEMD)     │   │     UPLOAD STORAGE       │
               │   - Express 4.x / ESM    │──▶│   /var/www/tokki-uploads │
               │   - Helmet + Rate Limit  │   │   (products/*.webp)      │
               │   - Clerk Auth Guard     │   └──────────────────────────┘
               │   - Sharp WebP Pipeline  │
               └─────────────┬────────────┘
                             │ Parameterized SQL Pool
                             ▼
               ┌──────────────────────────┐
               │   POSTGRESQL 16 (DB)     │
               │   - Schema: tokki_shop   │
               │   - Row Locking (Locks)  │
               │   - Least-Privilege User │
               └──────────────────────────┘
```

---

### DNS Records Configuration

Since your admin panel is served under the frontend path `www.tokkishopve.com/tokki-admin` (single SPA routing), **you do NOT need an `admin.tokkishopve.com` subdomain or DNS record**.

Configure the following DNS records in your DNS provider (Cloudflare, Namecheap, Route 53, etc.):

| Type | Host / Name | Target / Value | Purpose |
|---|---|---|---|
| **A** | `api` | `<YOUR_BACKEND_VPS_IP>` | Backend API & Static Images (`api.tokkishopve.com`) |
| **CNAME** or **A** | `www` | `<FRONTEND_HOST>` (e.g. Vercel / Cloudflare / Netlify / VPS) | Storefront & Admin Panel (`www.tokkishopve.com`) |
| **A** / **ALIAS** | `@` (root domain) | `<FRONTEND_HOST>` or redirect to `www` | Root domain redirect (`tokkishopve.com`) |

---

### Frontend Routing & CORS Origin Clarification

CORS (Cross-Origin Resource Sharing) validates the **Origin** header sent by browsers. The Origin header consists solely of `scheme://domain:port` (it **never** contains the URL path like `/tokki-admin`):

- Storefront requests (`https://www.tokkishopve.com/products`) send:  
  `Origin: https://www.tokkishopve.com`
- Admin panel requests (`https://www.tokkishopve.com/tokki-admin`) send:  
  `Origin: https://www.tokkishopve.com`

Therefore, in the backend `.env`, you only need:
```ini
FRONTEND_ORIGINS=https://www.tokkishopve.com,https://tokkishopve.com
```

---

## 2. Server Setup from Scratch (Ubuntu/Debian VPS)

### Phase 1: OS Provisioning & Firewall Hardening

1. **Update system packages:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y curl wget git ufw build-essential fail2ban htop unzip
   ```

2. **Create a dedicated non-root application user:**
   ```bash
   sudo adduser --gecos "" tokki
   sudo usermod -aG sudo tokki
   ```

3. **Configure UFW Firewall:**
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw --force enable
   sudo ufw status verbose
   ```

4. **Set server timezone to UTC:**
   ```bash
   sudo timedatectl set-timezone UTC
   ```

---

### Phase 2: Runtime & Tooling Installation

1. **Install Node.js 20 LTS:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   node --version # v20.x.x
   ```

2. **Enable and install `pnpm`:**
   ```bash
   sudo corepack enable
   corepack prepare pnpm@latest --activate
   pnpm --version
   ```

---

### Phase 3: PostgreSQL 16 Setup & Database Security Hardening

> **How PostgreSQL Differs from MariaDB/MySQL:**  
> Unlike MySQL/MariaDB (which historically required `mysql_secure_installation` to set a root password and remove test DBs), PostgreSQL is secure by default:
> 1. The default superuser `postgres` uses **`peer` authentication** on local Unix sockets (only the Linux `postgres` user via `sudo -u postgres` can log in).
> 2. It has **no default password** and rejects password logins over TCP for `postgres`.
> 3. By default, it only listens on `localhost` (127.0.0.1), preventing external network access.

#### 1. Install PostgreSQL:
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

#### 2. Configure SCRAM-SHA-256 Password Encryption (`/etc/postgresql/16/main/postgresql.conf`):
Ensure passwords are stored with modern cryptographic hashing (not legacy md5):
```bash
sudo sed -i "s/#password_encryption = scram-sha-256/password_encryption = scram-sha-256/" /etc/postgresql/16/main/postgresql.conf
sudo systemctl reload postgresql
```

#### 3. Create a Dedicated Least-Privilege Application Role & Database:
```bash
sudo -u postgres psql
```

Execute the following SQL commands:
```sql
-- Create application user with strict limits (no superuser, no db creation, no role creation)
CREATE ROLE tokki_app WITH
    LOGIN
    ENCRYPTED PASSWORD 'GENERATE_STRONG_RANDOM_PASSWORD'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT;

-- Create production database owned by the application user
CREATE DATABASE tokki_prod OWNER tokki_app;

-- Connect to production database and restrict schema permissions
\c tokki_prod

-- Revoke default public permissions so other users/roles cannot access
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO tokki_app;

\q
```

#### 4. Lock Down Host-Based Authentication (`/etc/postgresql/16/main/pg_hba.conf`):
Ensure all password connections require `scram-sha-256` and no unauthenticated (`trust`) access exists.

Edit `/etc/postgresql/16/main/pg_hba.conf` so the connection rules look like:
```ini
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# 1. 'postgres' superuser: local Linux socket only (peer authentication via sudo)
local   all             postgres                                peer

# 2. 'tokki_app' user: local socket & localhost IPv4/IPv6 with SCRAM password
local   tokki_prod      tokki_app                               scram-sha-256
host    tokki_prod      tokki_app       127.0.0.1/32            scram-sha-256
host    tokki_prod      tokki_app       ::1/128                 scram-sha-256

# 3. Reject all other connections by default
```

Apply the security changes:
```bash
sudo systemctl restart postgresql
```

#### 5. Initialize the Authoritative Database Schema:
```bash
psql "postgresql://tokki_app:GENERATE_STRONG_RANDOM_PASSWORD@127.0.0.1:5432/tokki_prod" -f src/schema/tokki_schema.sql
```

---

### Phase 4: Application & Storage Directory Provisioning

1. **Create directories for the app and uploaded images:**
   ```bash
   sudo mkdir -p /var/www/tokkiweb-backend
   sudo mkdir -p /var/www/tokki-uploads/products
   
   # Set ownership to the app user
   sudo chown -R tokki:tokki /var/www/tokkiweb-backend
   sudo chown -R tokki:tokki /var/www/tokki-uploads
   sudo chmod -R 755 /var/www/tokki-uploads
   ```

2. **Clone codebase and install production dependencies:**
   ```bash
   su - tokki
   git clone <YOUR_GIT_REPO_URL> /var/www/tokkiweb-backend
   cd /var/www/tokkiweb-backend

   # Install production dependencies only
   pnpm install --frozen-lockfile --prod
   ```

---

### Phase 5: Environment Variables Configuration

Create `/var/www/tokkiweb-backend/.env` with production values:

```ini
# Node Environment
NODE_ENV=production
PORT=3000

# PostgreSQL Connection String
DATABASE_URL=postgresql://tokki_app:GENERATE_STRONG_RANDOM_PASSWORD@127.0.0.1:5432/tokki_prod

# Clerk Production Credentials (from Clerk Dashboard > Production API Keys)
CLERK_SECRET_KEY=your_clerk_secret_key_here
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here

# CORS Allowed Origins
FRONTEND_ORIGINS=https://www.tokkishopve.com,https://tokkishopve.com

# Persistent Upload Directory for Product Images
UPLOAD_DIR=/var/www/tokki-uploads

# Public Base URL for Serving Product Images
PUBLIC_BASE_URL=https://api.tokkishopve.com
```

> **Security Note:** Restrict permissions so only the `tokki` user can read `.env`:
> ```bash
> chmod 600 /var/www/tokkiweb-backend/.env
> ```

---

### Phase 6: Process Management with Native Systemd

You can manage the Node.js backend using a native Linux systemd service unit.

1. **Create the systemd unit file (`/etc/systemd/system/tokki-backend.service`):**
   ```ini
   [Unit]
   Description=Tokki Shop Backend API (Node.js/Express)
   Documentation=https://github.com/your-org/tokkiweb-backend
   After=network.target postgresql.service
   Wants=postgresql.service

   [Service]
   Type=simple
   User=tokki
   Group=tokki
   WorkingDirectory=/var/www/tokkiweb-backend

   # Load environment variables
   Environment=NODE_ENV=production
   EnvironmentFile=/var/www/tokkiweb-backend/.env

   # Start command (verify path with 'which node')
   ExecStart=/usr/bin/node /var/www/tokkiweb-backend/server.js

   # Auto-restart policy
   Restart=always
   RestartSec=5s

   # File descriptor limits
   LimitNOFILE=65536

   # Journal logging
   StandardOutput=journal
   StandardError=journal
   SyslogIdentifier=tokki-backend

   [Install]
   WantedBy=multi-user.target
   ```

2. **Reload systemd, enable, and start the service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now tokki-backend.service
   ```

3. **Check status and logs:**
   ```bash
   # Check service status
   sudo systemctl status tokki-backend

   # Live follow logs
   sudo journalctl -u tokki-backend -f

   # Restart after updating code
   sudo systemctl restart tokki-backend
   ```

---

### Phase 7: Nginx Reverse Proxy, Static File Offload & SSL

1. **Install Nginx and Certbot:**
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

2. **Create Nginx site configuration (`/etc/nginx/sites-available/tokki-api`):**

   ```nginx
   # IP-level rate limiting zones
   limit_req_zone $binary_remote_addr zone=api_limit:10m rate=25r/s;
   limit_req_zone $binary_remote_addr zone=checkout_limit:10m rate=2r/s;

   server {
       listen 80;
       server_name api.tokkishopve.com;

       # Max upload body size (match backend 5MB + overhead)
       client_max_body_size 6M;

       # 1. Direct Static File Offloading for Images (Bypasses Node.js completely)
       location /images/ {
           alias /var/www/tokki-uploads/;
           
           # Cache WebP images in browser and CDN for 30 days
           expires 30d;
           add_header Cache-Control "public, max-age=2592000, immutable";
           add_header Access-Control-Allow-Origin "*";
           add_header X-Content-Type-Options "nosniff";

           # Security: Block execution of any uploaded scripts
           location ~* \.(php|pl|py|jsp|sh|cgi|exe|bat)$ {
               deny all;
           }

           try_files $uri =404;
       }

       # 2. Strict Rate Limiting on Checkout (POST /api/orders)
       location = /api/orders {
           limit_req zone=checkout_limit burst=5 nodelay;

           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # 3. Proxy all other API requests to Node.js backend
       location / {
           limit_req zone=api_limit burst=30 nodelay;

           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;

           # Connection Timeouts
           proxy_connect_timeout 10s;
           proxy_read_timeout 30s;
           proxy_send_timeout 30s;
       }
   }
   ```

3. **Enable site and reload Nginx:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/tokki-api /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **Obtain Let's Encrypt SSL Certificate:**
   ```bash
   sudo certbot --nginx -d api.tokkishopve.com --non-interactive --agree-tos -m admin@tokkishopve.com
   ```

---

## 3. Security Hardening Roadmap

### 1. Helmet & HTTP Security Headers

Install `helmet` to set security headers:

```bash
pnpm add helmet
```

#### Code Integration in `src/app.js`:

```javascript
import helmet from 'helmet';

app.use(
  helmet({
    // Essential: allows frontend at www.tokkishopve.com to embed /images/* without CORP blocking
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false // API serves JSON and static images
  })
);

app.disable('x-powered-by');
```

---

### 2. Rate Limiting (`express-rate-limit`)

Protect public catalog queries, order receipts, and guest checkouts from denial-of-service and inventory-locking attacks.

```bash
pnpm add express-rate-limit
```

#### Create `src/middleware/rateLimit.js`:

```javascript
import rateLimit from 'express-rate-limit';

// Global API Limiter: 150 requests per 15 minutes per IP
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

// Checkout Limiter: 10 orders per 15 minutes per IP (prevents inventory locking spam)
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many checkout attempts. Please try again shortly.' }
});

// Upload Limiter: 30 image uploads per 15 minutes per admin IP
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Upload limit reached. Please wait before uploading more images.' }
});
```

#### Wire limiters in `src/app.js` & routes:
- Add `app.use('/api', globalLimiter);` in `src/app.js`
- Add `checkoutLimiter` to `router.post('/', checkoutLimiter, ordersController.createOrder);` in `src/routes/orders.js`.
- Add `uploadLimiter` to `router.post('/:product_id/image', uploadLimiter, ...);` in `src/routes/products.js`.

---

### 3. Express Trust Proxy Configuration

When running behind Nginx, Express reads `127.0.0.1` instead of the client's actual IP unless `trust proxy` is enabled.

#### Add to `src/app.js`:

```javascript
// Trust the first proxy (Nginx)
app.set('trust proxy', 1);
```

---

### 4. Request Body Payload Size Capping

#### Update `src/app.js`:

```javascript
// Cap JSON and URL-encoded bodies to 10kb
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
```

---

### 5. CORS Hardening

#### Update `src/app.js`:

```javascript
const allowedOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server or tools with no origin in development only
      if (!origin && process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400
  })
);
```

---

### 6. Database Query Log Sanitization & Least Privilege

#### Hardening `src/config/db.js`:

```javascript
export const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;

  // Only log detailed queries in development or if query took > 1000ms
  if (process.env.NODE_ENV !== 'production') {
    console.log('executed query', { text, duration, rows: res.rowCount });
  } else if (duration > 1000) {
    console.warn('⚠️ Slow query detected', { text, duration, rows: res.rowCount });
  }
  return res;
};
```

---

### 7. Production Clerk Auth Transition

1. In the **Clerk Dashboard**:
   - Switch from `Development` instance to `Production` instance.
   - Configure Allowed Origins: `https://www.tokkishopve.com`, `https://tokkishopve.com`.
   - Set Redirect URL: `https://www.tokkishopve.com/tokki-admin`.
   - Assign `publicMetadata` role to admin accounts:
     ```json
     {
       "role": "owner"
     }
     ```
2. In the backend `.env`:
   - Set production live keys from Clerk Dashboard (`CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY`).

---

### 8. Graceful Shutdown & Unhandled Error Protection

#### Update `server.js`:

```javascript
import dotenv from 'dotenv';
import app from './src/app.js';
import * as db from './src/config/db.js';

dotenv.config();

const PORT = process.env.PORT || 3000;

let server;

db.query('SELECT NOW()')
  .then((res) => {
    console.log('✅ Database connected successfully. Server time:', res.rows[0].now);

    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} [NODE_ENV=${process.env.NODE_ENV || 'development'}]`);
    });
  })
  .catch((err) => {
    console.error('❌ Database connection failed. Server shutting down...', err.stack);
    process.exit(1);
  });

// Graceful shutdown on SIGTERM / SIGINT (systemd stop/restart)
const shutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  if (server) {
    server.close(async () => {
      console.log('🔒 HTTP server closed.');
      try {
        await db.endPool();
        console.log('🏊 Database pool drained.');
        process.exit(0);
      } catch (err) {
        console.error('❌ Error closing database pool:', err);
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});
```

---

### 9. Dedicated Health Check Endpoint

#### Add to `src/app.js`:

```javascript
import * as db from './config/db.js';

app.get('/health', async (req, res) => {
  try {
    const dbRes = await db.query('SELECT 1');
    return res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbRes.rows.length > 0 ? 'connected' : 'disconnected'
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      message: 'Database unreachable',
      timestamp: new Date().toISOString()
    });
  }
});
```

---

### 10. File Uploads & Upload Directory Isolation

- WebP normalization ≤1600px + magic byte sniffing is already active.
- Ensure the `UPLOAD_DIR` has permissions `755` and the Nginx configuration explicitly forbids script execution in `/images/`.

---

## 4. Disaster Recovery & Automated Backups

### Database Backup Cron Job

1. Create backup script `/home/tokki/scripts/backup_db.sh`:
   ```bash
   #!/bin/bash
   BACKUP_DIR="/home/tokki/backups/db"
   TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
   FILENAME="$BACKUP_DIR/tokki_prod_$TIMESTAMP.sql.gz"

   mkdir -p "$BACKUP_DIR"

   # Dump and compress database
   pg_dump -U tokki_app -h 127.0.0.1 tokki_prod | gzip > "$FILENAME"

   # Retain only last 14 days of backups
   find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +14 -exec rm {} \;

   echo "Backup created at $FILENAME"
   ```

2. Make executable and add to crontab:
   ```bash
   chmod +x /home/tokki/scripts/backup_db.sh
   crontab -e
   ```
   Add nightly backup at 03:00 AM:
   ```cron
   0 3 * * * /home/tokki/scripts/backup_db.sh > /home/tokki/backups/backup.log 2>&1
   ```

### Images Backup Cron Job

```cron
# Sync product images nightly to backup volume
30 3 * * * rsync -avz /var/www/tokki-uploads/ /home/tokki/backups/images/
```

---

## 5. Pre-Launch & Post-Deployment Checklist

| Stage | Task | Status |
|---|---|:---:|
| **Security** | Install and configure `helmet` with `crossOriginResourcePolicy: { policy: "cross-origin" }` | 🔲 |
| **Security** | Configure `express-rate-limit` on global API, checkout (`/api/orders`), and image upload | 🔲 |
| **Security** | Enable `app.set('trust proxy', 1)` in `src/app.js` | 🔲 |
| **Security** | Cap `express.json({ limit: '10kb' })` and urlencoded bodies | 🔲 |
| **Security** | Set `FRONTEND_ORIGINS=https://www.tokkishopve.com,https://tokkishopve.com` in `.env` | 🔲 |
| **Security** | Silence verbose query logging in `src/config/db.js` for production | 🔲 |
| **Auth** | Set production Clerk Secret & Publishable keys | 🔲 |
| **Auth** | Ensure admin user accounts have `publicMetadata: { role: "owner" }` in Clerk | 🔲 |
| **Infra** | Provision Linux VPS with UFW firewall (22, 80, 443 only) | 🔲 |
| **Database** | Create `tokki_prod` DB and `tokki_app` user with strong password | 🔲 |
| **Database** | Run `psql ... -f src/schema/tokki_schema.sql` to initialize tables | 🔲 |
| **Process** | Configure systemd service (`/etc/systemd/system/tokki-backend.service`) and enable on boot | 🔲 |
| **Web Server**| Configure Nginx for `api.tokkishopve.com` with SSL, proxy to 3000, and offload `/images/` | 🔲 |
| **Monitoring**| Implement `GET /health` route and set up external ping | 🔲 |
| **Backups** | Configure automated nightly `pg_dump` and image directory sync crons | 🔲 |
| **Testing** | Smoke test: Catalog query, Guest checkout, Public receipt, Admin login & Image upload | 🔲 |
