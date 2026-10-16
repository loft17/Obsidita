# 📚 Installation and Configuration Manual - Obsidita

Complete guide to install and configure **Obsidita** (Obsidian Web) on your server, including nginx proxy configuration.

---

## 📋 Table of Contents

1. [System Requirements](#system-requirements)
2. [Basic Installation](#basic-installation)
3. [Production Installation](#production-installation)
4. [Initial Configuration](#initial-configuration)
5. [Nginx Configuration](#nginx-configuration)
6. [Environment Variables](#environment-variables)
7. [Security](#security)
8. [System Administration](#system-administration)
9. [Monitoring and Logs](#monitoring-and-logs)
10. [Troubleshooting](#troubleshooting)
11. [Updates](#updates)
12. [Backup and Recovery](#backup-and-recovery)

---

## 📦 System Requirements

### Minimum Requirements

| Component | Version | Description |
|-----------|---------|-------------|
| **Node.js** | >= 20.0.0 | JavaScript backend runtime |
| **npm** | >= 10.0.0 | Package manager (comes with Node.js) |
| **Git** | Latest | Download repository (optional) |
| **Disk Space** | >= 500 MB | Application + dependencies + data |
| **RAM** | >= 512 MB | Application runtime memory |

### Recommended for Production

| Component | Recommendation |
|-----------|--------------|
| **Node.js** | v22 LTS or v24 current |
| **Nginx** | 1.24+ (reverse proxy) |
| **Server** | Ubuntu 22.04 LTS / Debian 12 |
| **Disk Space** | >= 10 GB (includes vaults) |
| **RAM** | >= 2 GB |
| **CPU** | >= 2 cores |
| **SSL/TLS** | Let's Encrypt (free) |

### Supported Operating Systems

- ✅ Linux (Ubuntu, Debian, Fedora, etc.)
- ✅ macOS (Intel and Apple Silicon)
- ✅ Windows (with Node.js and npm)
- ✅ Docker (via container)

---

## ⚙️ Basic Installation

### Step 1: Install Node.js

#### On Ubuntu/Debian:
```bash
# Update packages
sudo apt update
sudo apt upgrade -y

# Install Node.js (LTS version)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Must be >= 20.0.0
npm --version   # Must be >= 10.0.0
```

#### On macOS:
```bash
# With Homebrew (recommended)
brew install node

# Or download from https://nodejs.org/
```

#### On Windows:
1. Download installer from [nodejs.org](https://nodejs.org/)
2. Run installer and follow wizard
3. Open CMD or PowerShell and verify: `node --version`

---

### Step 2: Download Application

#### Option A: Clone with Git
```bash
cd /opt  # or your preferred location
git clone https://github.com/your-user/Obsidian-Web.git obsidita
cd obsidita
```

#### Option B: Download ZIP
```bash
cd /opt
wget https://github.com/your-user/Obsidian-Web/archive/main.zip
unzip main.zip
mv Obsidian-Web-main obsidita
cd obsidita
```

---

### Step 3: Install Dependencies

```bash
# Install all dependencies
npm install

# Compile web interface
npm run web:build
```

**Expected output:**
```
up to date, audited 450 packages in 2.5s
web/dist/index.html built successfully
```

---

### Step 4: Initial Test

```bash
# Run in development
npm run dev

# Or start in production
npm start
```

**Expected output:**
```
Obsidita listening on http://localhost:3000
Setup required
```

Open browser to `http://localhost:3000` and complete initial setup.

---

## 🚀 Production Installation

### Recommended Directory Structure

```
/opt/obsidita/                  # Main folder
├── server/                      # Backend (Node.js/Express)
├── web/                         # Frontend (React)
├── data/                        # Persistent data (create if missing)
│   ├── config.json             # Configuration
│   ├── .secret                 # Cookie signing secret
│   └── sessions/               # User sessions
├── .env                         # Environment variables
├── package.json
└── start.sh                     # Start script

/srv/vaults/                    # Obsidian Vaults (optional but recommended)
├── my-vault/                   # Vault folder
│   ├── .obsidian/
│   └── notes/
└── another-vault/
```

### Step 1: Create System User

```bash
# Create user without shell access
sudo useradd -r -s /bin/false obsidita

# Create directories
sudo mkdir -p /opt/obsidita /srv/vaults
sudo mkdir -p /var/log/obsidita

# Set permissions
sudo chown -R obsidita:obsidita /opt/obsidita /srv/vaults /var/log/obsidita
sudo chmod 750 /srv/vaults
```

---

### Step 2: Install Application

```bash
# As root or with sudo
sudo -u obsidita git clone https://github.com/your-user/Obsidian-Web.git /opt/obsidita
cd /opt/obsidita
sudo -u obsidita npm install
sudo -u obsidita npm run web:build
```

---

### Step 3: Create .env File

```bash
sudo nano /opt/obsidita/.env
```

**Minimal content for production:**
```env
# ===== PRODUCTION =====
NODE_ENV=production
PORT=3000
HOST=127.0.0.1

# Reverse proxy (nginx)
TRUST_PROXY=1

# Vault root folder
VAULTS_ROOT=/srv/vaults

# Limits
MAX_NOTE_MB=20
MAX_UPLOAD_MB=50

# Sessions
SESSION_MAX_DAYS=30
SESSION_IDLE_DAYS=7
```

**Permissions:**
```bash
sudo chmod 600 /opt/obsidita/.env
sudo chown obsidita:obsidita /opt/obsidita/.env
```

---

### Step 4: Create Systemd Service

**Best option:** Use systemd to manage service automatically.

```bash
sudo nano /etc/systemd/system/obsidita.service
```

**Content:**
```ini
[Unit]
Description=Obsidita - Obsidian Web Viewer
After=network.target

[Service]
Type=simple
User=obsidita
WorkingDirectory=/opt/obsidita
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Activate service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable obsidita
sudo systemctl start obsidita

# See status
sudo systemctl status obsidita

# See logs
sudo journalctl -u obsidita -f
```

---

## 🔧 Initial Configuration

### First Run

1. **Open application:**
   ```
   http://localhost:3000  (development)
   http://your-server:3000 (production, local access)
   ```

2. **Setup Screen:**
   - Create password (minimum 12 characters)
   - Select vault folder
   - Choose sync options (optional)
   - Click "Setup"

3. **Access:**
   - File `data/config.json` will be created
   - You can now login to application

---

## 🔌 Nginx Configuration

### Why Nginx?

- **Security:** HTTPS/SSL, security headers
- **Performance:** Reverse proxy, compression
- **Scalability:** Multiple instances
- **Caching:** Efficient static serving

---

### Step 1: Install Nginx

#### Ubuntu/Debian:
```bash
sudo apt update
sudo apt install -y nginx

# Start service
sudo systemctl start nginx
sudo systemctl enable nginx

# Verify
sudo systemctl status nginx
```

---

### Step 2: Basic Configuration (without HTTPS)

```bash
sudo nano /etc/nginx/sites-available/obsidita
```

**Content:**
```nginx
upstream obsidita {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    client_max_body_size 50M;  # Max attachment size

    # Logs
    access_log /var/log/nginx/obsidita-access.log;
    error_log /var/log/nginx/obsidita-error.log;

    location / {
        proxy_pass http://obsidita;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket (for future features)
        proxy_set_header Connection "";
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Cache assets (images, CSS, JS)
    location /assets {
        proxy_pass http://obsidita;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

---

### Step 3: HTTPS Configuration (Recommended)

#### Option A: Let's Encrypt + Certbot

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Generate certificate (automatic)
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

#### Option B: Manual HTTPS

```bash
sudo nano /etc/nginx/sites-available/obsidita
```

**Complete content (with HTTPS):**
```nginx
upstream obsidita {
    server 127.0.0.1:3000;
    keepalive 64;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com www.your-domain.com;
    
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL Security Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 50M;
    
    # Logs
    access_log /var/log/nginx/obsidita-access.log combined;
    error_log /var/log/nginx/obsidita-error.log;

    location / {
        proxy_pass http://obsidita;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Cache assets
    location /assets {
        proxy_pass http://obsidita;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

---

### Step 4: Activate Configuration

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/obsidita /etc/nginx/sites-enabled/

# Verify syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Restart if major changes
sudo systemctl restart nginx
```

---

### Step 5: Verify

```bash
# Access https://your-domain.com

# See error logs
tail -f /var/log/nginx/obsidita-error.log

# See requests
tail -f /var/log/nginx/obsidita-access.log
```

---

## 🌍 Environment Variables

Create or edit `/opt/obsidita/.env`:

### Main Variables

```env
# ===== PORT AND HOST =====
PORT=3000
HOST=127.0.0.1

# ===== ENVIRONMENT =====
NODE_ENV=production

# ===== REVERSE PROXY =====
# Set to 1 if behind nginx/Caddy (for real client IP)
TRUST_PROXY=1

# ===== VAULTS =====
VAULTS_ROOT=/srv/vaults

# ===== SIZE LIMITS (MB) =====
MAX_NOTE_MB=20
MAX_UPLOAD_MB=50

# ===== SEARCH =====
SEARCH_MAX_FILE_MB=2
SEARCH_MAX_SCANNED_MB=200
SEARCH_MAX_QUERY_LENGTH=200
SEARCH_MAX_RESULTS=200
SEARCH_MAX_MATCHES_PER_FILE=5
SEARCH_RATE_MAX=60

# ===== SESSIONS (DAYS) =====
SESSION_MAX_DAYS=30
SESSION_IDLE_DAYS=7

# ===== PASSWORD =====
MIN_PASSWORD_LENGTH=12

# ===== UPDATES =====
UPDATE_CHECK=1

# ===== CUSTOM FONTS =====
FONTS_DIR=/etc/obsidita/fonts
```

---

## 🔒 Security

### Critical Recommendations

#### 1. Strong Password
```bash
# Use minimum 12 character password during setup
# Include uppercase, lowercase, numbers, and symbols
# Example: Obsidita@2024!secure
```

#### 2. HTTPS Mandatory
```bash
# Always use SSL/TLS in production
# Let's Encrypt is free: certbot --nginx
```

#### 3. Firewall
```bash
# Allow only necessary ports
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP (redirects to HTTPS)
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
```

#### 4. File Permissions
```bash
# data/ contains sensitive information
sudo chmod 700 /opt/obsidita/data
sudo chmod 600 /opt/obsidita/data/*
sudo chmod 600 /opt/obsidita/.env
```

#### 5. Backups
```bash
# Daily automatic backup
sudo nano /etc/cron.daily/obsidita-backup

#!/bin/bash
BACKUP_DIR="/backup/obsidita"
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/obsidita-$(date +%Y%m%d).tar.gz" \
    /opt/obsidita/data /srv/vaults
# Keep only last 7 days
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete
```

---

## 👨‍💼 System Administration

### Manage Service

```bash
# Start
sudo systemctl start obsidita

# Stop
sudo systemctl stop obsidita

# Restart
sudo systemctl restart obsidita

# See status
sudo systemctl status obsidita

# Enable at startup
sudo systemctl enable obsidita

# View logs
sudo journalctl -u obsidita -f
```

---

## 🚨 Troubleshooting

### Application won't start

**Error:** `Error listening on port 3000`

```bash
# Check what uses port 3000
sudo lsof -i :3000

# Kill if necessary
kill -9 <PID>

# Change port in .env
PORT=3001
```

### Permission denied

**Error:** `EACCES: permission denied, open '.../data/config.json'`

```bash
# Fix permissions
sudo chown -R obsidita:obsidita /opt/obsidita/data
sudo chmod 755 /opt/obsidita/data
```

### Nginx returns 502

**Cause:** Obsidita not running

```bash
# Check status
sudo systemctl status obsidita

# Start if stopped
sudo systemctl start obsidita

# See logs
sudo journalctl -u obsidita -n 20
```

---

## 🔄 Updates

### Update to New Version

```bash
# Stop service
sudo systemctl stop obsidita

# Update code
cd /opt/obsidita
sudo -u obsidita git pull origin main

# Install new dependencies
sudo -u obsidita npm install

# Compile frontend
sudo -u obsidita npm run web:build

# Start
sudo systemctl start obsidita

# Verify
sudo systemctl status obsidita
```

---

## 💾 Backup and Recovery

### Manual Backup

```bash
#!/bin/bash
BACKUP_DIR="/backup/obsidita"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/obsidita_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

tar -czf "$BACKUP_FILE" \
    /opt/obsidita/data \
    /srv/vaults \
    /opt/obsidita/.env

echo "Backup created: $BACKUP_FILE"

# Keep only last 7 days
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete
```

### Automatic Backup

```bash
# Create script
sudo nano /usr/local/bin/backup-obsidita.sh
# (paste content above)

# Make executable
sudo chmod +x /usr/local/bin/backup-obsidita.sh

# Add to cron (daily at 02:00)
sudo crontab -e

# Add line:
0 2 * * * /usr/local/bin/backup-obsidita.sh >> /var/log/backup-obsidita.log 2>&1
```

### Restore from Backup

```bash
# Stop service
sudo systemctl stop obsidita

# Extract backup
cd /
sudo tar -xzf /backup/obsidita/obsidita_YYYYMMDD_HHMMSS.tar.gz

# Fix permissions
sudo chown -R obsidita:obsidita /opt/obsidita/data /srv/vaults

# Restart
sudo systemctl start obsidita
```

---

## 📝 Installation Checklist

- [ ] Node.js >= 20.0.0 installed
- [ ] Application downloaded and dependencies installed
- [ ] .env file configured
- [ ] Systemd service created and enabled
- [ ] Nginx installed and configured
- [ ] SSL/HTTPS with Let's Encrypt
- [ ] Firewall configured (ports 22, 80, 443)
- [ ] Directory permissions correct
- [ ] First backup created
- [ ] Cron backup automated
- [ ] Initial setup completed
- [ ] HTTPS access works
- [ ] Search indexes correctly
- [ ] Basic monitoring in place
- [ ] Rate limiting active

---

## 🎓 Additional Resources

- **Official Docs:** [Obsidian Help](https://help.obsidian.md)
- **Node.js:** [nodejs.org](https://nodejs.org)
- **Nginx:** [nginx.org](https://nginx.org)
- **Let's Encrypt:** [letsencrypt.org](https://letsencrypt.org)
- **Systemd:** `man systemd.service`
- **PM2:** [pm2.keymetrics.io](https://pm2.keymetrics.io)

---

**Last Updated:** 2026-10-16  
**Version:** 1.0  
**Author:** Obsidita Team

---

## 📞 Support

If you encounter problems:

1. Check [Troubleshooting](#troubleshooting) section
2. Review logs: `sudo journalctl -u obsidita -f`
3. Check GitHub repository
4. Report issues with error details

**Thank you for using Obsidita!** 🎉
