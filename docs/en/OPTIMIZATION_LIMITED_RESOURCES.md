# 💪 Optimization for VPS with Limited Resources

Guide to running **Obsidita** on servers with **limited RAM** (512 MB - 2 GB).

---

## 📊 Requirements Table by Available RAM

| VPS RAM | Swap | Node Heap | Recommended Config | Performance |
|---------|------|-----------|-------------------|------------|
| **512 MB** | 2 GB | 256 MB | Minimal | Slow, much swap |
| **1 GB** | 2 GB | 512 MB | Basic | Acceptable |
| **2 GB** | 1 GB | 1024 MB | Standard | Good |
| **4+ GB** | Optional | 1.5-2 GB | Premium | Excellent |

---

## 🚨 Your Current Situation

```
RAM: 854 MB
Available: ~70 MB (very critical)
Swap: 2 GB (well configured)
```

**Status:** Viable but at limit. You need optimizations.

---

## 🔧 Step 1: Check and Expand Swap

### Check current swap

```bash
# See current status
free -h
swapon --show

# Check if there's a swapfile
ls -lh /swapfile
```

### If you don't have swap or it's insufficient

```bash
# Create or expand swap to 3-4 GB
sudo swapoff /swapfile  # disable if exists
sudo rm -f /swapfile    # remove if exists

# Create new swapfile (3 GB for safety)
sudo fallocate -l 3G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Verify
free -h

# Make permanent (if not in fstab)
grep swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Optimize swap (important on VPS)

```bash
# Reduce swap usage (use only if necessary)
# Values: 0-100, default 60
# Lower = less swap usage
sudo sysctl vm.swappiness=30  # temporary

# Permanent:
echo 'vm.swappiness=30' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## 🎯 Step 2: Configure Node.js for Low Memory

### During Installation

```bash
# To install dependencies
NODE_OPTIONS="--max-old-space-size=512" npm install

# To compile frontend (if you have > 1 GB RAM)
NODE_OPTIONS="--max-old-space-size=1024" npm run web:build

# If still fails (512 MB RAM):
NODE_OPTIONS="--max-old-space-size=256" npm run web:build
```

### In Production (.env file)

```bash
# Edit .env
sudo nano /opt/obsidita/.env

# Add:
NODE_OPTIONS="--max-old-space-size=512"
```

### Systemd service file

```bash
sudo nano /etc/systemd/system/obsidita.service
```

Inside `[Service]`, add:

```ini
[Service]
Type=simple
User=obsidita
WorkingDirectory=/opt/obsidita
Environment="NODE_ENV=production"
Environment="NODE_OPTIONS=--max-old-space-size=512"
ExecStart=/usr/bin/node server/index.js
...
```

Then reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart obsidita
```

---

## 🔍 Step 3: Optimize Search (Major Memory Impact)

**Indexed search** consumes the most memory. In `.env`:

```env
# === OPTIMIZED SEARCH FOR LOW MEMORY ===

# Reduce files indexed (critical)
# Default: 200 MB in memory
# For 512 MB RAM: max 50 MB
SEARCH_MAX_SCANNED_MB=50

# Don't index files > 1 MB
# Default: 2 MB
SEARCH_MAX_FILE_MB=0.5

# Maximum results (avoid processing too much)
SEARCH_MAX_RESULTS=100

# Matches per file
SEARCH_MAX_MATCHES_PER_FILE=3

# Maximum concurrent searches
SEARCH_RATE_MAX=30

# Maximum search length
SEARCH_MAX_QUERY_LENGTH=150
```

**Impact:** Reduce memory from 200+ MB to 50-100 MB.

---

## 📦 Step 4: Reduce Unnecessary Dependencies

### Install only what's needed

```bash
# Install ONLY production dependencies
npm ci --only=production

# Clean npm cache
npm cache clean --force

# See installed size
du -sh node_modules/
```

**Expected savings:** 50-100 MB.

---

## 💾 Step 5: Optimize Application Limits

In `.env`:

```env
# === SIZE LIMITS ===

# Maximum per note (default 20 MB)
# For low RAM: reduce to 5-10 MB
MAX_NOTE_MB=10

# Maximum per attachment (default 50 MB)
# For low RAM: reduce to 10-20 MB
MAX_UPLOAD_MB=20

# === SESSIONS ===
# Expire sessions faster to save memory
SESSION_MAX_DAYS=7
SESSION_IDLE_DAYS=1
```

---

## 🚀 Step 6: Compile on Different Machine (Recommended)

**If compilation still fails**, compile on your local machine or a more powerful server:

### On your PC/Mac:

```bash
# 1. Clone repository locally
git clone https://github.com/your-user/Obsidian-Web.git
cd Obsidian-Web

# 2. Install dependencies and compile
npm install
npm run web:build

# 3. Compress only what's needed
tar -czf obsidita-compiled.tar.gz \
  node_modules/ \
  web/dist/ \
  server/ \
  .env \
  package.json

# 4. Upload to VPS
scp obsidita-compiled.tar.gz root@your-vps:/tmp/

# 5. On VPS, extract
cd /opt/obsidita
tar -xzf /tmp/obsidita-compiled.tar.gz
```

---

## 📊 Real-time Memory Monitoring

### See current usage

```bash
# Memory per process
ps aux --sort=-%mem | grep node | head -5

# Real-time monitoring
watch -n 1 'free -h && echo "---" && ps aux --sort=-%mem | grep node | head -3'

# With htop (if installed)
sudo apt install htop
htop  # Search "node" with F3
```

### Automatic alerts

```bash
# Alert script if memory > 80%
sudo nano /usr/local/bin/check-memory.sh
```

**Content:**

```bash
#!/bin/bash
THRESHOLD=80
USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')

if [ $USAGE -gt $THRESHOLD ]; then
    echo "⚠️ ALERT: Memory at ${USAGE}%" | \
    tee -a /var/log/memory-alerts.log
    
    # Optional: restart service
    # sudo systemctl restart obsidita
fi
```

**Run every 5 minutes:**

```bash
sudo chmod +x /usr/local/bin/check-memory.sh
sudo crontab -e

# Add:
*/5 * * * * /usr/local/bin/check-memory.sh >> /var/log/memory-cron.log 2>&1
```

---

## 🎛️ Step 7: Limit Node Processes

### Using cgroups (resource limiting)

```bash
# Install cgroupsv2
sudo apt install cgroup-tools

# Create group for obsidita
sudo cgcreate -g memory:/obsidita

# Limit to 600 MB
echo 629145600 | sudo tee /sys/fs/cgroup/obsidita/memory.limit_in_bytes

# Start process within group
sudo cgexec -g memory:/obsidita node server/index.js
```

### Using systemd (easier)

In `/etc/systemd/system/obsidita.service`:

```ini
[Service]
MemoryLimit=600M
MemoryAccounting=yes
```

---

## 🔄 Step 8: Use Nginx Proxy for Caching

Nginx can cache responses, reducing Node load:

```nginx
# In /etc/nginx/sites-available/obsidita

proxy_cache_path /var/cache/nginx/obsidita levels=1:2 keys_zone=obsidita:10m max_size=100m;

upstream obsidita {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # Aggressive cache for static resources
    location /assets {
        proxy_pass http://obsidita;
        proxy_cache obsidita;
        proxy_cache_valid 200 7d;  # 7 days
        add_header X-Cache-Status $upstream_cache_status;
    }

    # DON'T cache API (real-time changes)
    location /api {
        proxy_pass http://obsidita;
        proxy_no_cache 1;
        proxy_cache_bypass 1;
    }

    location / {
        proxy_pass http://obsidita;
        proxy_cache obsidita;
        proxy_cache_valid 200 5m;  # 5 minutes
        proxy_cache_bypass $http_cache_control;
    }
}
```

---

## ⚡ Step 9: Minimal Complete Configuration

**.env file optimized for 512 MB - 1 GB RAM:**

```env
# === ENVIRONMENT ===
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
TRUST_PROXY=1
NODE_OPTIONS="--max-old-space-size=512"

# === MEMORY AND LIMITS ===
MAX_NOTE_MB=10
MAX_UPLOAD_MB=20

# === OPTIMIZED SEARCH ===
SEARCH_MAX_SCANNED_MB=50
SEARCH_MAX_FILE_MB=0.5
SEARCH_MAX_RESULTS=100
SEARCH_MAX_MATCHES_PER_FILE=3
SEARCH_RATE_MAX=30

# === SESSIONS ===
SESSION_MAX_DAYS=7
SESSION_IDLE_DAYS=1

# === VAULTS ===
VAULTS_ROOT=/srv/vaults

# === OTHERS ===
UPDATE_CHECK=0  # Disable GitHub check to save bandwidth
MIN_PASSWORD_LENGTH=12
```

---

## 📈 Step 10: Future Scaling

If you still lack memory even with these optimizations:

### Option 1: Upgrade VPS
- Move to 2GB RAM (small cost, big impact)

### Option 2: Multiple Vaults
- Divide large vaults among multiple small VPS

### Option 3: CDN for Assets
- Serve `/assets` from CloudFlare (free)
- Reduces server load

```nginx
# In nginx:
location /assets {
    # Redirect to CDN
    return 301 https://cdn.your-domain.com$request_uri;
}
```

---

## 🐛 Low Memory Troubleshooting

### Error: "ENOMEM: out of memory"

```bash
# 1. Increase swap
fallocate -l 1G /swapfile2
chmod 600 /swapfile2
mkswap /swapfile2
swapon /swapfile2

# 2. Reduce SEARCH_MAX_SCANNED_MB
sudo nano /opt/obsidita/.env
# Change to 30 MB

# 3. Restart
sudo systemctl restart obsidita
```

### Compilation fails with "killed"

```bash
# Use remote compilation (see Step 6)
# Or:

# Increase swap temporarily
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Compile with less heap
NODE_OPTIONS="--max-old-space-size=256" npm run web:build
```

### Application slow or freezes

```bash
# Check memory
free -h

# See if swap is active (bad)
vmstat 1 5

# If > 80% in use, reduce limits in .env:
SEARCH_MAX_SCANNED_MB=25
SESSION_MAX_DAYS=3

# Restart
sudo systemctl restart obsidita
```

---

## 📝 Checklist for Your VPS (854 MB RAM)

- [ ] Swap expanded to 3+ GB
- [ ] `vm.swappiness=30` configured
- [ ] `.env` with `NODE_OPTIONS="--max-old-space-size=512"`
- [ ] `SEARCH_MAX_SCANNED_MB=50` (or lower)
- [ ] `MAX_NOTE_MB=10`, `MAX_UPLOAD_MB=20`
- [ ] `node_modules` production only
- [ ] Nginx with caching configured
- [ ] Memory monitoring script running
- [ ] Test: create 5 MB note
- [ ] Test: search entire vault
- [ ] Test: upload 10 MB file

---

## 💡 Final Tips

1. **Monitor constantly:** `watch -n 2 'free -h'`
2. **Logs are your friend:** `sudo journalctl -u obsidita -f`
3. **Don't use too much swap:** Swap is slow, RAM is better
4. **Resize limits:** Start small, increase if space available
5. **Consider upgrading VPS:** 2GB costs little more

---

## 📊 Before vs After Comparison

| Metric | Before | After |
|--------|--------|-------|
| Free RAM | 70 MB | ~200 MB |
| Active Swap | 100%+ | 30-50% |
| Search in memory | 200 MB | 50 MB |
| Web compilation | ❌ Fails | ✅ OK |
| Performance | Very slow | Acceptable |

---

**Last Updated:** 2026-10-16  
**Version:** 1.0

If you apply these steps, your 854 MB VPS should work correctly. 🚀
