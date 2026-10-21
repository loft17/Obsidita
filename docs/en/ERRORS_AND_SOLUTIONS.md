# 🚨 Common Errors and Solutions

Complete guide of **errors, causes, and solutions** for Obsidita.

**Tip:** Use `Ctrl+F` to search for your specific error.

---

## 📋 Table of Contents

- [Installation Errors](#installation-errors)
- [Runtime Errors](#runtime-errors)
- [Memory Errors](#memory-errors)
- [Nginx Errors](#nginx-errors)
- [Authentication Errors](#authentication-errors)
- [Search Errors](#search-errors)
- [Permission Errors](#permission-errors)
- [SSL/HTTPS Errors](#sslhttps-errors)
- [Database Errors](#database-errors)
- [Performance Errors](#performance-errors)
- [AI Editing Errors](#-ai-editing-errors)

---

## 🔧 Installation Errors

### Error: "Node.js version not valid"

**Message:**
```
node: command not found
or
node: version 18.0.0 is not >= 20.0.0
```

**Cause:** Node.js not installed or old version.

**Solution:**

```bash
# 1. Check installed version
node --version

# 2. If old or missing, install Node.js 22 (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt update
sudo apt install -y nodejs

# 3. Verify again
node --version  # Must be >= 20.0.0
npm --version
```

**Prevention:** Always install LTS version of Node.js.

---

### Error: "npm install fails with insufficient memory"

**Message:**
```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
or
Killed
```

**Cause:** Insufficient RAM during installation. Common on VPS <= 1 GB.

**Solution:**

```bash
# 1. Create or expand swap (3 GB)
sudo fallocate -l 3G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 2. Install with less heap memory
NODE_OPTIONS="--max-old-space-size=512" npm install

# 3. If still fails, clean cache and retry
npm cache clean --force
NODE_OPTIONS="--max-old-space-size=512" npm install --omit=dev

# 4. Verify
npm list --depth=0
```

**Prevention:**
- Use `NODE_OPTIONS` always on systems with < 2GB RAM
- Create swap BEFORE installing

---

### Error: "npm run web:build fails"

**Message:**
```
Vite build error: Out of memory
or
Cannot find module '@vitejs/plugin-react'
```

**Cause:**
- Dependencies not installed correctly
- Insufficient memory

**Solution:**

```bash
# 1. Ensure npm install completed
npm list | head -20  # See first dependencies

# 2. Clean and reinstall
rm -rf node_modules package-lock.json
NODE_OPTIONS="--max-old-space-size=1024" npm install

# 3. Compile frontend
NODE_OPTIONS="--max-old-space-size=1024" npm run web:build

# 4. Verify output
ls -la web/dist/index.html
```

**If still fails on VPS:**
```bash
# Compile on local machine and upload
# See: OPTIMIZATION_LIMITED_RESOURCES.md → Compile on Different Machine
```

---

## ⚠️ Runtime Errors

### Error: "Port 3000 already in use"

**Message:**
```
Error: listen EADDRINUSE :::3000
or
Address already in use
```

**Cause:** Another process uses port 3000.

**Diagnosis:**
```bash
# See what uses port 3000
sudo lsof -i :3000
# or
sudo netstat -tlnp | grep 3000
```

**Solutions:**

**Option 1: Kill previous process**
```bash
# See process PID
PID=$(lsof -t -i :3000)
echo "Killing PID: $PID"
kill -9 $PID

# Restart Obsidita
sudo systemctl restart obsidita
```

**Option 2: Change port**
```bash
# Edit .env
sudo nano /opt/obsidita/.env

# Change:
# PORT=3000
PORT=3001

# Also change in nginx if you use it
sudo nano /etc/nginx/sites-available/obsidita
# Change: server 127.0.0.1:3000;
# To:      server 127.0.0.1:3001;

# Reload
sudo systemctl restart obsidita
sudo systemctl reload nginx
```

**Prevention:** Use systemd to manage process automatically.

---

### Error: "Connection refused / Cannot connect to server"

**Message:**
```
Cannot GET / Connection refused
or
ERR_CONNECTION_REFUSED
```

**Cause:** Service not running.

**Diagnosis:**
```bash
# Check if running
sudo systemctl status obsidita

# See logs
sudo journalctl -u obsidita -n 20

# Check if listening
sudo lsof -i :3000
```

**Solution:**

```bash
# 1. Start service
sudo systemctl start obsidita

# 2. Wait 2-3 seconds
sleep 3

# 3. Check status
sudo systemctl status obsidita

# 4. See logs if error
sudo journalctl -u obsidita -n 50
```

**Prevention:**
```bash
sudo systemctl enable obsidita  # Auto-start
```

---

## 💾 Memory Errors

### Error: "ENOMEM: out of memory"

**Message:**
```
ENOMEM: out of memory, read
or
killed process 12345 (node) total-vm:XXX kB
```

**Cause:** Application exceeds available memory (RAM + Swap).

**Quick Diagnosis:**
```bash
# See current memory
free -h

# Check if using swap
vmstat 1 5

# See Node process consumption
ps aux | grep node | grep -v grep | awk '{print "PID:"$2" CPU:"$3"% MEM:"$4"%"}'
```

**Solutions:**

**Short term (emergency):**
```bash
# 1. Increase emergency swap
sudo fallocate -l 1G /swapfile-emergency
sudo chmod 600 /swapfile-emergency
sudo mkswap /swapfile-emergency
sudo swapon /swapfile-emergency

# 2. Reduce search (immediate impact)
sudo nano /opt/obsidita/.env

# Change:
SEARCH_MAX_SCANNED_MB=50
# To:
SEARCH_MAX_SCANNED_MB=25

# 3. Restart
sudo systemctl restart obsidita

# 4. Monitor
watch -n 2 'free -h'
```

**Long term:**
```bash
# 1. Review OPTIMIZATION_LIMITED_RESOURCES.md
# 2. Adjust limits in .env:
#    - MAX_NOTE_MB=10
#    - MAX_UPLOAD_MB=20
#    - SEARCH_MAX_SCANNED_MB=50
# 3. Consider upgrading VPS to 2GB+ RAM
```

**Prevention:**
- Create swap of 2-3x available RAM
- Use NODE_OPTIONS="--max-old-space-size=512"
- Monitor memory regularly

---

## 🌐 Nginx Errors

### Error: "502 Bad Gateway"

**Page:** Browser shows 502 error.

**Cause:** Node.js not running or not responding.

**Diagnosis:**
```bash
# 1. Check if Node running
sudo systemctl status obsidita

# 2. Check if listening on 3000
sudo lsof -i :3000

# 3. See logs
sudo journalctl -u obsidita -n 20
```

**Solutions:**

```bash
# 1. Start Obsidita
sudo systemctl start obsidita

# 2. Wait to start
sleep 3

# 3. Test direct connection
curl -v http://127.0.0.1:3000

# 4. If works, problem in Nginx
# If not, problem in Node

# 5. If Node problem, see logs
sudo journalctl -u obsidita -f
```

**If Nginx misconfigured:**
```bash
# 1. Check syntax
sudo nginx -t

# 2. See specific errors
sudo nano /etc/nginx/sites-available/obsidita
# Look for errors like:
# - upstream misspelled
# - wrong ports

# 3. Reload
sudo systemctl reload nginx

# 4. See logs
tail -f /var/log/nginx/obsidita-error.log
```

---

### Error: "Connection timeout / timeouts on large operations"

**Symptom:** Loading large files, searches take too long.

**Cause:** Nginx timeouts too short.

**Solution:**

```bash
# Edit Nginx config
sudo nano /etc/nginx/sites-available/obsidita

# Find location / and add:
proxy_connect_timeout 120s;
proxy_send_timeout 120s;
proxy_read_timeout 120s;

# Also increase client_max_body_size if needed:
client_max_body_size 100M;

# Check and reload
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔐 Authentication Errors

### Error: "Too many failed login attempts"

**Message:**
```
{"error": "Too many attempts, try again later"}
or
403 Forbidden
```

**Cause:** Rate limiter activated by failed attempts.

**Diagnosis:**
```bash
# See login attempts in logs
sudo journalctl -u obsidita | grep -i "login\|auth" | tail -10

# See IP attempting
sudo journalctl -u obsidita | grep "failed" | tail -5
```

**Solution:**

```bash
# 1. Wait 15 minutes (resets automatically)

# 2. Or clean sessions database
sudo systemctl stop obsidita
sudo rm -rf /opt/obsidita/data/sessions/*
sudo systemctl start obsidita

# 3. Verify password
# If forgot password, see "Error: Lost password"
```

**Prevention:**
- Use strong password
- Ensure TRUST_PROXY=1 in .env if using Nginx

---

### Error: "Invalid session / Session expired"

**Symptom:** Randomly disconnects during the day.

**Cause:** Session expired by inactivity or max time.

**Solution:**

```bash
# Increase session duration in .env
sudo nano /opt/obsidita/.env

# Change (default are 7 and 7 days):
SESSION_MAX_DAYS=30      # Valid for max 30 days
SESSION_IDLE_DAYS=14     # Expires after 14 days of inactivity

# Restart
sudo systemctl restart obsidita
```

---

## 🔍 Search Errors

### Error: "Search slow or not working"

**Symptom:** Searches take > 10 seconds or don't return results.

**Cause:** Corrupt index or too large.

**Diagnosis:**
```bash
# Check if search works
curl -X GET http://localhost:3000/api/search?q=test

# See logs
sudo journalctl -u obsidita | grep -i search
```

**Solution:**

```bash
# 1. Stop service
sudo systemctl stop obsidita

# 2. Clean search cache
sudo rm -rf /opt/obsidita/data/.search*

# 3. Start
sudo systemctl start obsidita

# 4. Search will reindex automatically
# (may take time with large vaults)

# 5. Reduce limits if memory issue
sudo nano /opt/obsidita/.env
# SEARCH_MAX_SCANNED_MB=50
```

---

### Error: "Search: Out of memory"

**Message in logs:**
```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed
search index size exceeded
```

**Cause:** Vault too large for available memory.

**Solution:**

```bash
# 1. Reduce indexed files in .env
sudo nano /opt/obsidita/.env

SEARCH_MAX_SCANNED_MB=50    # Default 200
SEARCH_MAX_FILE_MB=0.5      # Don't index > 500 KB

# 2. Restart
sudo systemctl restart obsidita

# 3. If still fails, reduce more
SEARCH_MAX_SCANNED_MB=25
SEARCH_MAX_FILE_MB=0.2
```

---

## 📂 Permission Errors

### Error: "Permission denied / EACCES"

**Message:**
```
EACCES: permission denied, open '/opt/obsidita/data/config.json'
```

**Cause:** Incorrect file/folder permissions.

**Diagnosis:**
```bash
# See current permissions
ls -la /opt/obsidita/data/
ls -la /srv/vaults/

# See who runs the process
ps aux | grep "node server" | grep -v grep
```

**Solution:**

```bash
# 1. Fix permissions (as root)
sudo chown -R obsidita:obsidita /opt/obsidita/data
sudo chown -R obsidita:obsidita /srv/vaults

# 2. Set correct permissions
sudo chmod 700 /opt/obsidita/data
sudo chmod 600 /opt/obsidita/data/*
sudo chmod 700 /srv/vaults
sudo chmod 755 /srv/vaults/*/

# 3. For .env file
sudo chmod 600 /opt/obsidita/.env
sudo chown obsidita:obsidita /opt/obsidita/.env

# 4. Restart
sudo systemctl restart obsidita

# 5. Verify
sudo systemctl status obsidita
```

---

## 🗄️ Database Errors

### Error: "Cannot read/write files"

**Symptom:** Cannot save changes to notes.

**Message in logs:**
```
Error writing file
ENOENT: no such file or directory
```

**Cause:** Wrong vault path or file deleted.

**Solution:**

```bash
# 1. Verify configuration
cat /opt/obsidita/data/config.json | grep -i vault

# 2. Check folder exists
ls -la /srv/vaults/

# 3. If missing, create it
sudo mkdir -p /srv/vaults/my-vault
sudo chown obsidita:obsidita /srv/vaults/my-vault

# 4. Reconfigure in Settings
# Go to Settings > Vault
# Change path to: /srv/vaults/my-vault

# 5. Restart
sudo systemctl restart obsidita
```

---

## ⚡ Performance Errors

### Error: "Server CPU very high (> 80%)"

**Symptom:** CPU always > 80%, even idle.

**Diagnosis:**
```bash
# See what consumes CPU
ps aux --sort=-%cpu | head -10

# Real-time monitor
top -b -n 1 | head -15

# See Node threads
ps -eLf | grep node | wc -l
```

**Common Causes:**

1. **Search reindexing large vault**
   ```bash
   # Wait for reindexing to finish
   # Or reduce search limits
   ```

2. **Synchronization running**
   ```bash
   # Check if GitHub/Dropbox sync active
   # Wait to finish
   ```

3. **Memory leak (process growing)**
   ```bash
   # Restart
   sudo systemctl restart obsidita
   ```

---

### Error: "Disk full / No space left"

**Message:**
```
ENOSPC: no space left on device
```

**Diagnosis:**
```bash
# See available space
df -h

# See large folders
du -sh /opt/obsidita/* /srv/vaults/*

# See data size
du -sh /opt/obsidita/data
```

**Solutions:**

**Short term:**
```bash
# 1. Clean old logs
sudo journalctl --vacuum=7d

# 2. Clean npm cache
npm cache clean --force

# 3. Delete old backups
sudo rm /backup/obsidita/backup_*.tar.gz  # selectively

# 4. Compress logs
gzip /var/log/*.log
```

**Long term:**
```bash
# 1. Upgrade disk space (VPS)
# 2. Move vaults to another partition
# 3. Reduce vault size (delete unused attachments)
```

---

## ✨ AI Editing Errors

Errors from the AI bar and the **Test** button in Settings → AI (invalid key, unknown model, no credit, timeout...) are explained one by one in [AI editing → Troubleshooting](AI.md#-troubleshooting). The message includes the HTTP status and the provider's reason, e.g. `(HTTP 404: ... model ... not found)`.

---

## 📞 If Nothing Works

1. **Review complete logs:**
   ```bash
   sudo journalctl -u obsidita -n 100 > /tmp/obsidita-logs.txt
   cat /tmp/obsidita-logs.txt
   ```

2. **Make backup:**
   ```bash
   tar -czf /tmp/obsidita-backup.tar.gz /opt/obsidita/data /srv/vaults
   ```

3. **Clean reinstall:**
   ```bash
   sudo systemctl stop obsidita
   sudo rm -rf /opt/obsidita/data/config.json
   sudo systemctl start obsidita
   # Access http://your-domain.com/api/setup
   ```

4. **Check documentation:**
   - `INSTALLATION_AND_SETUP.md` → Troubleshooting
   - `OPTIMIZATION_LIMITED_RESOURCES.md` → Troubleshooting

5. **Report on GitHub:**
   - Include logs (command above)
   - Specify Node.js, Nginx versions
   - Describe steps to reproduce

---

**Last Updated:** 2026-10-16  
**Version:** 1.0

💡 **Tip:** Keep regular backups to recover quickly from any error.
