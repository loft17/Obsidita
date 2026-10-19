# ⚡ Ready-to-Use Scripts for Copy/Paste

Commands and scripts **ready to use** on your VPS with limited resources.

---

## 🚀 Quick Installation (VPS 512 MB - 2 GB RAM)

### Complete Installation Script

Copy and paste in your terminal (as root):

```bash
#!/bin/bash
set -e

echo "🚀 Installing Obsidita on VPS with limited resources..."

# === VARIABLES ===
APP_DIR="/opt/obsidita"
DATA_DIR="$APP_DIR/data"
VAULTS_ROOT="/srv/vaults"
USER="obsidita"
SWAP_SIZE="3G"

# === STEP 1: UPDATE SYSTEM ===
echo "📦 Updating system packages..."
apt update
apt upgrade -y
apt install -y curl git nginx

# === STEP 2: INSTALL NODE.JS ===
echo "📝 Installing Node.js >= 20..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version
npm --version

# === STEP 3: CREATE SWAP ===
echo "💾 Configuring swap..."
if [ ! -f /swapfile ]; then
    fallocate -l $SWAP_SIZE /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "✅ Swap created: $SWAP_SIZE"
else
    echo "ℹ️  Swap already exists"
fi

# === STEP 4: OPTIMIZE SWAP ===
echo "⚙️  Optimizing swappiness..."
sysctl vm.swappiness=30
echo 'vm.swappiness=30' >> /etc/sysctl.conf
sysctl -p > /dev/null

# === STEP 5: CREATE USER AND DIRECTORIES ===
echo "👤 Creating user and directories..."
if ! id "$USER" &>/dev/null; then
    useradd -r -s /bin/false $USER
    echo "✅ User $USER created"
fi

mkdir -p $APP_DIR $DATA_DIR $VAULTS_ROOT /var/log/obsidita
chown -R $USER:$USER $APP_DIR $DATA_DIR $VAULTS_ROOT /var/log/obsidita
chmod 700 $DATA_DIR $VAULTS_ROOT

# === STEP 6: DOWNLOAD APPLICATION ===
echo "📥 Downloading Obsidita..."
if [ ! -d "$APP_DIR/.git" ]; then
    cd /opt
    git clone https://github.com/your-user/Obsidian-Web.git obsidita
else
    echo "ℹ️  Directory exists, updating..."
    cd $APP_DIR
    sudo -u $USER git pull origin main
fi

# === STEP 7: INSTALL WITH NODE_OPTIONS ===
echo "📚 Installing dependencies (this may take a while)..."
cd $APP_DIR

export NODE_OPTIONS="--max-old-space-size=512"

sudo -u $USER npm install --omit=dev 2>&1 | tail -20

echo "🏗️  Compiling frontend..."
sudo -u $USER npm run web:build 2>&1 | tail -20

# === STEP 8: CREATE .ENV ===
echo "🔧 Creating .env file..."
cat > $APP_DIR/.env << 'EOF'
# ===== ENVIRONMENT =====
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
TRUST_PROXY=1
NODE_OPTIONS="--max-old-space-size=512"

# ===== MEMORY AND LIMITS =====
MAX_NOTE_MB=10
MAX_UPLOAD_MB=20

# ===== OPTIMIZED SEARCH =====
SEARCH_MAX_SCANNED_MB=50
SEARCH_MAX_FILE_MB=0.5
SEARCH_MAX_RESULTS=100
SEARCH_MAX_MATCHES_PER_FILE=3
SEARCH_RATE_MAX=30

# ===== SESSIONS =====
SESSION_MAX_DAYS=7
SESSION_IDLE_DAYS=1

# ===== VAULTS =====
VAULTS_ROOT=/srv/vaults

# ===== OTHERS =====
UPDATE_CHECK=0
MIN_PASSWORD_LENGTH=12
EOF

chown $USER:$USER $APP_DIR/.env
chmod 600 $APP_DIR/.env
echo "✅ .env created"

# === STEP 9: CREATE SYSTEMD SERVICE ===
echo "⚙️  Creating systemd service..."
cat > /etc/systemd/system/obsidita.service << 'EOF'
[Unit]
Description=Obsidita - Obsidian Web Viewer
After=network.target

[Service]
Type=simple
User=obsidita
WorkingDirectory=/opt/obsidita
Environment="NODE_ENV=production"
Environment="NODE_OPTIONS=--max-old-space-size=512"
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
MemoryLimit=600M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable obsidita
echo "✅ Service created"

# === STEP 10: CONFIGURE NGINX ===
echo "🌐 Configuring Nginx..."
cat > /etc/nginx/sites-available/obsidita << 'NGINX_EOF'
upstream obsidita {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name _;
    
    client_max_body_size 20M;
    
    location / {
        proxy_pass http://obsidita;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    location /assets {
        proxy_pass http://obsidita;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000";
    }
}
NGINX_EOF

ln -sf /etc/nginx/sites-available/obsidita /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "✅ Nginx configured"

# === STEP 11: START SERVICE ===
echo "🚀 Starting Obsidita..."
systemctl start obsidita
sleep 2

# === VERIFICATION ===
echo ""
echo "========== ✅ INSTALLATION COMPLETE =========="
echo ""
echo "📊 Status:"
free -h
echo ""
echo "🔍 Node.js Process:"
ps aux | grep "node server" | grep -v grep || echo "⏳ Still starting..."
echo ""
echo "🌐 Access:"
echo "  http://localhost:3000 (local)"
echo "  http://YOUR_IP:80 (from other devices)"
echo ""
echo "📋 Real-time Logs:"
echo "  sudo journalctl -u obsidita -f"
echo ""
echo "⚙️  Configuration:"
echo "  .env: $APP_DIR/.env"
echo "  Nginx: /etc/nginx/sites-available/obsidita"
echo "  Systemd: /etc/systemd/system/obsidita.service"
echo ""
echo "🔐 Next Steps:"
echo "  1. Access http://YOUR_IP:80"
echo "  2. Complete initial setup"
echo "  3. Configure vault"
echo "  4. Enjoy Obsidita!"
echo ""
```

**To use:**

```bash
# 1. Create file
nano /tmp/install-obsidita.sh

# 2. Paste content above

# 3. Execute
chmod +x /tmp/install-obsidita.sh
sudo /tmp/install-obsidita.sh

# 4. Follow on-screen instructions
```

---

## 🔍 Monitoring Script

Monitors memory, CPU and alerts on problems:

```bash
#!/bin/bash
# Script: /usr/local/bin/monitor-obsidita.sh

LOG_FILE="/var/log/obsidita-monitor.log"
THRESHOLD_MEM=80
THRESHOLD_SWAP=70

# Timestamp
log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

# Memory
MEM_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
SWAP_USAGE=$(free | grep Swap | awk '{print int($3/$2 * 100)}')
PID_OBSIDITA=$(pgrep -f "node server")

log_msg "=== OBSIDITA MONITORING ==="
log_msg "RAM Memory: ${MEM_USAGE}%"
log_msg "Swap: ${SWAP_USAGE}%"

if [ -n "$PID_OBSIDITA" ]; then
    MEM_PROC=$(ps -p $PID_OBSIDITA -o %mem= | tr -d ' ')
    CPU_PROC=$(ps -p $PID_OBSIDITA -o %cpu= | tr -d ' ')
    log_msg "Node Process (PID $PID_OBSIDITA): MEM ${MEM_PROC}%, CPU ${CPU_PROC}%"
else
    log_msg "⚠️  ALERT: Node.js process NOT running"
fi

# Alerts
if [ "$MEM_USAGE" -gt "$THRESHOLD_MEM" ]; then
    log_msg "⚠️  CRITICAL: RAM Memory at ${MEM_USAGE}%"
fi

if [ "$SWAP_USAGE" -gt "$THRESHOLD_SWAP" ]; then
    log_msg "⚠️  CRITICAL: Swap at ${SWAP_USAGE}% (very slow)"
fi

chmod +x $LOG_FILE
```

**Install:**

```bash
# Copy script
sudo nano /usr/local/bin/monitor-obsidita.sh
# (paste content above)

# Make executable
sudo chmod +x /usr/local/bin/monitor-obsidita.sh

# Run every 5 minutes
sudo crontab -e

# Add line:
*/5 * * * * /usr/local/bin/monitor-obsidita.sh
```

**Run manually:**

```bash
sudo /usr/local/bin/monitor-obsidita.sh

# See logs
tail -f /var/log/obsidita-monitor.log
```

---

## 🔍 Diagnostic Script

Generates complete status report:

```bash
#!/bin/bash
# Script: diagnose-obsidita.sh

echo "=== OBSIDITA DIAGNOSTIC ==="
echo ""

echo "📊 MEMORY AND SWAP"
free -h
echo ""

echo "🔄 DETAILED SWAP"
swapon --show
echo ""

echo "⚙️  SWAPPINESS"
cat /proc/sys/vm/swappiness
echo ""

echo "🖥️  NODE PROCESSES"
ps aux | grep node | grep -v grep
echo ""

echo "📁 DISK SPACE"
df -h /opt/obsidita /srv/vaults /
echo ""

echo "📈 MEMORY USAGE PER PROCESS"
ps aux --sort=-%mem | grep -E "PID|node|obsidita" | head -5
echo ""

echo "🌐 LISTENING PORTS"
sudo netstat -tlnp | grep -E "3000|80|443" || echo "ℹ️  Install net-tools: apt install net-tools"
echo ""

echo "📋 SERVICE STATUS"
systemctl status obsidita --no-pager | head -10
echo ""

echo "📝 RECENT ERRORS IN LOGS"
sudo journalctl -u obsidita -n 5 --no-pager
echo ""

echo "✅ END OF DIAGNOSTIC"
```

**To use:**

```bash
chmod +x ./diagnose-obsidita.sh
./diagnose-obsidita.sh
```

---

## 🔄 Update Script

Update to new version without losing data:

```bash
#!/bin/bash
# Script: update-obsidita.sh

set -e

APP_DIR="/opt/obsidita"
BACKUP_DIR="/backup/obsidita"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🔄 Updating Obsidita..."

# Backup
echo "💾 Creating backup..."
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/backup_$TIMESTAMP.tar.gz" \
    "$APP_DIR/data" \
    "$APP_DIR/.env"

# Stop
echo "🛑 Stopping service..."
sudo systemctl stop obsidita

# Update
echo "📥 Downloading changes..."
cd "$APP_DIR"
sudo -u obsidita git pull origin main

# Install
echo "📚 Installing dependencies..."
export NODE_OPTIONS="--max-old-space-size=512"
sudo -u obsidita npm install --omit=dev

# Compile
echo "🏗️  Compiling frontend..."
sudo -u obsidita npm run web:build

# Start
echo "🚀 Starting service..."
sudo systemctl start obsidita

# Verify
sleep 2
if systemctl is-active --quiet obsidita; then
    echo "✅ Update successful"
    echo "📦 Backup saved: $BACKUP_DIR/backup_$TIMESTAMP.tar.gz"
else
    echo "❌ Error: service not started"
    echo "Rolling back..."
    cd "$APP_DIR"
    sudo -u obsidita git reset --hard HEAD~1
    sudo systemctl start obsidita
    exit 1
fi
```

---

## 🛠️ Quick Useful Commands

### See real-time status

```bash
# Memory updated every 2 seconds
watch -n 2 'free -h && echo "---" && ps aux | grep node | grep -v grep'

# Real-time logs
sudo journalctl -u obsidita -f

# Disk space
watch -n 5 'df -h /opt/obsidita /srv/vaults'
```

### Restart and diagnose

```bash
# Restart service
sudo systemctl restart obsidita

# Check if started well
sleep 2 && sudo systemctl status obsidita

# See first error lines
sudo journalctl -u obsidita -n 20 --no-pager

# See last lines (follow)
sudo journalctl -u obsidita -f --lines=50
```

### Manage processes

```bash
# See PID
pidof node

# Kill process (if stuck)
sudo kill -9 $(pidof node)

# Wait 5 seconds and restart
sudo systemctl restart obsidita

# Check consumption
ps aux | grep node | grep -v grep | awk '{print "CPU:"$3"% MEM:"$4"%"}'
```

### Quick optimizations

```bash
# Clear npm cache
npm cache clean --force

# Clean old logs
sudo journalctl --vacuum=30d

# Remove temp files
rm -rf /tmp/npm-*

# Restart Nginx if fails
sudo systemctl restart nginx
```

---

## 🚨 Emergency Commands

If memory runs out (OOM):

```bash
# 1. See immediate status
free -h && vmstat 1 5

# 2. Increase emergency swap
sudo fallocate -l 1G /swapfile-emergency
sudo chmod 600 /swapfile-emergency
sudo mkswap /swapfile-emergency
sudo swapon /swapfile-emergency

# 3. Reduce search
sudo nano /opt/obsidita/.env
# Change: SEARCH_MAX_SCANNED_MB=25

# 4. Restart
sudo systemctl restart obsidita

# 5. Monitor
free -h && sleep 5 && free -h
```

---

## 📋 Quick Checklist

Use after installing:

```bash
#!/bin/bash

echo "✅ INSTALLATION CHECKLIST"

checks=(
    "Node.js: $(node --version)"
    "npm: $(npm --version)"
    "Swap: $(free -h | grep Swap | awk '{print $2}')"
    "APP DIR: $([ -d /opt/obsidita ] && echo '✓' || echo '✗')"
    ".env: $([ -f /opt/obsidita/.env ] && echo '✓' || echo '✗')"
    "User obsidita: $(id obsidita 2>/dev/null && echo '✓' || echo '✗')"
    "Service active: $(systemctl is-active obsidita)"
    "Nginx: $(systemctl is-active nginx)"
    "Listening on 3000: $(lsof -i :3000 2>/dev/null && echo '✓' || echo '✗')"
    "Listening on 80: $(lsof -i :80 2>/dev/null && echo '✓' || echo '✗')"
)

for check in "${checks[@]}"; do
    echo "  $check"
done
```

---

**Last Updated:** 2026-10-16  
**Version:** 1.0

Need help? Check `INSTALLATION_AND_SETUP.md` for details.
