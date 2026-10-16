# ⚡ Scripts Listos para Copiar/Pegar

Comandos y scripts **listos para usar** en tu VPS con recursos limitados.

---

## 🚀 Instalación Rápida (VPS 512 MB - 2 GB RAM)

### Script Completo de Instalación

Copia y pega en tu terminal (como root):

```bash
#!/bin/bash
set -e

echo "🚀 Instalando Obsidita en VPS con recursos limitados..."

# === VARIABLES ===
APP_DIR="/opt/obsidita"
DATA_DIR="$APP_DIR/data"
VAULTS_ROOT="/srv/vaults"
USER="obsidita"
SWAP_SIZE="3G"

# === PASO 1: ACTUALIZAR SISTEMA ===
echo "📦 Actualizando paquetes del sistema..."
apt update
apt upgrade -y
apt install -y curl git nginx

# === PASO 2: INSTALAR NODE.JS ===
echo "📝 Instalando Node.js >= 20..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version
npm --version

# === PASO 3: CREAR SWAP ===
echo "💾 Configurando swap..."
if [ ! -f /swapfile ]; then
    fallocate -l $SWAP_SIZE /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "✅ Swap creado: $SWAP_SIZE"
else
    echo "ℹ️  Swap ya existe"
fi

# === PASO 4: OPTIMIZAR SWAP ===
echo "⚙️  Optimizando swappiness..."
sysctl vm.swappiness=30
echo 'vm.swappiness=30' >> /etc/sysctl.conf
sysctl -p > /dev/null

# === PASO 5: CREAR USUARIO Y DIRECTORIOS ===
echo "👤 Creando usuario y directorios..."
if ! id "$USER" &>/dev/null; then
    useradd -r -s /bin/false $USER
    echo "✅ Usuario $USER creado"
fi

mkdir -p $APP_DIR $DATA_DIR $VAULTS_ROOT /var/log/obsidita
chown -R $USER:$USER $APP_DIR $DATA_DIR $VAULTS_ROOT /var/log/obsidita
chmod 700 $DATA_DIR $VAULTS_ROOT

# === PASO 6: DESCARGAR APLICACIÓN ===
echo "📥 Descargando Obsidita..."
if [ ! -d "$APP_DIR/.git" ]; then
    cd /opt
    git clone https://github.com/tu-usuario/Obsidian-Web.git obsidita
else
    echo "ℹ️  Directorio ya existe, actualizando..."
    cd $APP_DIR
    sudo -u $USER git pull origin main
fi

# === PASO 7: INSTALAR CON NODE_OPTIONS ===
echo "📚 Instalando dependencias (esto puede tardar)..."
cd $APP_DIR

# Para npm install
export NODE_OPTIONS="--max-old-space-size=512"

sudo -u $USER npm install --omit=dev 2>&1 | tail -20

echo "🏗️  Compilando frontend..."
sudo -u $USER npm run web:build 2>&1 | tail -20

# === PASO 8: CREAR .ENV ===
echo "🔧 Creando archivo .env..."
cat > $APP_DIR/.env << 'EOF'
# ===== ENTORNO =====
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
TRUST_PROXY=1
NODE_OPTIONS="--max-old-space-size=512"

# ===== MEMORIA Y LÍMITES =====
MAX_NOTE_MB=10
MAX_UPLOAD_MB=20

# ===== BÚSQUEDA OPTIMIZADA =====
SEARCH_MAX_SCANNED_MB=50
SEARCH_MAX_FILE_MB=0.5
SEARCH_MAX_RESULTS=100
SEARCH_MAX_MATCHES_PER_FILE=3
SEARCH_RATE_MAX=30

# ===== SESIONES =====
SESSION_MAX_DAYS=7
SESSION_IDLE_DAYS=1

# ===== VAULTS =====
VAULTS_ROOT=/srv/vaults

# ===== OTROS =====
UPDATE_CHECK=0
MIN_PASSWORD_LENGTH=12
EOF

chown $USER:$USER $APP_DIR/.env
chmod 600 $APP_DIR/.env
echo "✅ .env creado"

# === PASO 9: CREAR SERVICIO SYSTEMD ===
echo "⚙️  Creando servicio systemd..."
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
echo "✅ Servicio creado"

# === PASO 10: CONFIGURAR NGINX ===
echo "🌐 Configurando Nginx..."
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
echo "✅ Nginx configurado"

# === PASO 11: INICIAR SERVICIO ===
echo "🚀 Iniciando Obsidita..."
systemctl start obsidita
sleep 2

# === VERIFICACIÓN ===
echo ""
echo "========== ✅ INSTALACIÓN COMPLETADA =========="
echo ""
echo "📊 Estado:"
free -h
echo ""
echo "🔍 Proceso Node.js:"
ps aux | grep "node server" | grep -v grep || echo "⏳ Aún iniciando..."
echo ""
echo "🌐 Acceso:"
echo "  http://localhost:3000 (local)"
echo "  http://TU_IP:80 (desde otros equipos)"
echo ""
echo "📋 Logs en tiempo real:"
echo "  sudo journalctl -u obsidita -f"
echo ""
echo "⚙️  Configuración:"
echo "  .env: $APP_DIR/.env"
echo "  Nginx: /etc/nginx/sites-available/obsidita"
echo "  Systemd: /etc/systemd/system/obsidita.service"
echo ""
echo "🔐 Próximos pasos:"
echo "  1. Accede a http://TU_IP:80"
echo "  2. Completa el setup inicial"
echo "  3. Configura el vault"
echo "  4. ¡Usa Obsidita!"
echo ""
```

**Para usar:**

```bash
# 1. Crear archivo
nano /tmp/install-obsidita.sh

# 2. Pegar contenido anterior

# 3. Ejecutar
chmod +x /tmp/install-obsidita.sh
sudo /tmp/install-obsidita.sh

# 4. Seguir instrucciones en pantalla
```

---

## 🔍 Script de Monitoreo

Monitorea memoria, CPU y alerta si hay problemas:

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

# Memoria
MEM_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
SWAP_USAGE=$(free | grep Swap | awk '{print int($3/$2 * 100)}')
PID_OBSIDITA=$(pgrep -f "node server")

log_msg "=== MONITOREO OBSIDITA ==="
log_msg "Memoria RAM: ${MEM_USAGE}%"
log_msg "Swap: ${SWAP_USAGE}%"

if [ -n "$PID_OBSIDITA" ]; then
    MEM_PROC=$(ps -p $PID_OBSIDITA -o %mem= | tr -d ' ')
    CPU_PROC=$(ps -p $PID_OBSIDITA -o %cpu= | tr -d ' ')
    log_msg "Proceso Node (PID $PID_OBSIDITA): MEM ${MEM_PROC}%, CPU ${CPU_PROC}%"
else
    log_msg "⚠️  ALERTA: Proceso Node.js NO está corriendo"
fi

# Alertas
if [ "$MEM_USAGE" -gt "$THRESHOLD_MEM" ]; then
    log_msg "⚠️  CRÍTICO: Memoria RAM al ${MEM_USAGE}%"
fi

if [ "$SWAP_USAGE" -gt "$THRESHOLD_SWAP" ]; then
    log_msg "⚠️  CRÍTICO: Swap al ${SWAP_USAGE}% (muy lento)"
fi

# Hacer ejecutable
chmod +x $LOG_FILE
```

**Instalar:**

```bash
# Copiar script
sudo nano /usr/local/bin/monitor-obsidita.sh
# (pegar contenido anterior)

# Hacerlo ejecutable
sudo chmod +x /usr/local/bin/monitor-obsidita.sh

# Ejecutar cada 5 minutos
sudo crontab -e

# Añadir línea:
*/5 * * * * /usr/local/bin/monitor-obsidita.sh
```

**Ejecutar manualmente:**

```bash
sudo /usr/local/bin/monitor-obsidita.sh

# Ver logs
tail -f /var/log/obsidita-monitor.log
```

---

## 📊 Script de Diagnóstico

Genera un reporte completo del estado:

```bash
#!/bin/bash
# Script: diagnose-obsidita.sh

echo "=== DIAGNÓSTICO OBSIDITA ==="
echo ""

echo "📊 MEMORIA Y SWAP"
free -h
echo ""

echo "🔄 SWAP DETALLADO"
swapon --show
echo ""

echo "⚙️  SWAPPINESS"
cat /proc/sys/vm/swappiness
echo ""

echo "🖥️  PROCESOS NODE"
ps aux | grep node | grep -v grep
echo ""

echo "📁 ESPACIO EN DISCO"
df -h /opt/obsidita /srv/vaults /
echo ""

echo "📈 USO DE MEMORIA POR PROCESO"
ps aux --sort=-%mem | grep -E "PID|node|obsidita" | head -5
echo ""

echo "🌐 PUERTOS EN ESCUCHA"
sudo netstat -tlnp | grep -E "3000|80|443" || echo "ℹ️  Instala net-tools: apt install net-tools"
echo ""

echo "📋 ESTADO DEL SERVICIO"
systemctl status obsidita --no-pager | head -10
echo ""

echo "📝 ÚLTIMOS ERRORES EN LOGS"
sudo journalctl -u obsidita -n 5 --no-pager
echo ""

echo "✅ FIN DEL DIAGNÓSTICO"
```

**Para usar:**

```bash
chmod +x ./diagnose-obsidita.sh
./diagnose-obsidita.sh
```

---

## 🔄 Script de Actualización

Actualizar a nueva versión sin perder datos:

```bash
#!/bin/bash
# Script: update-obsidita.sh

set -e

APP_DIR="/opt/obsidita"
BACKUP_DIR="/backup/obsidita"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🔄 Actualizando Obsidita..."

# Backup
echo "💾 Creando backup..."
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/backup_$TIMESTAMP.tar.gz" \
    "$APP_DIR/data" \
    "$APP_DIR/.env"

# Detener
echo "🛑 Deteniendo servicio..."
sudo systemctl stop obsidita

# Actualizar
echo "📥 Descargando cambios..."
cd "$APP_DIR"
sudo -u obsidita git pull origin main

# Instalar
echo "📚 Instalando dependencias..."
export NODE_OPTIONS="--max-old-space-size=512"
sudo -u obsidita npm install --omit=dev

# Compilar
echo "🏗️  Compilando frontend..."
sudo -u obsidita npm run web:build

# Iniciar
echo "🚀 Iniciando servicio..."
sudo systemctl start obsidita

# Verificar
sleep 2
if systemctl is-active --quiet obsidita; then
    echo "✅ Actualización exitosa"
    echo "📦 Backup guardado: $BACKUP_DIR/backup_$TIMESTAMP.tar.gz"
else
    echo "❌ Error: servicio no inició"
    echo "Revirtiendo..."
    cd "$APP_DIR"
    sudo -u obsidita git reset --hard HEAD~1
    sudo systemctl start obsidita
    exit 1
fi
```

---

## 🛠️ Comandos Útiles Rápidos

### Ver estado en tiempo real

```bash
# Memoria actualizada cada 2 segundos
watch -n 2 'free -h && echo "---" && ps aux | grep node | grep -v grep'

# Logs en tiempo real
sudo journalctl -u obsidita -f

# Espacio en disco
watch -n 5 'df -h /opt/obsidita /srv/vaults'
```

### Reiniciar y diagnosticar

```bash
# Reiniciar servicio
sudo systemctl restart obsidita

# Ver si arrancó bien
sleep 2 && sudo systemctl status obsidita

# Ver primeras líneas de error
sudo journalctl -u obsidita -n 20 --no-pager

# Ver últimas líneas (seguimiento)
sudo journalctl -u obsidita -f --lines=50
```

### Gestionar procesos

```bash
# Ver PID
pidof node

# Matar proceso (si está tascado)
sudo kill -9 $(pidof node)

# Esperar 5 segundos y reiniciar
sudo systemctl restart obsidita

# Verificar consumo
ps aux | grep node | grep -v grep | awk '{print "CPU:"$3"% MEM:"$4"%"}'
```

### Optimizaciones rápidas

```bash
# Vaciar caché de npm
npm cache clean --force

# Limpiar logs antiguos
sudo journalctl --vacuum=30d

# Reducir archivos temporales
rm -rf /tmp/npm-*

# Reiniciar Nginx si falla
sudo systemctl restart nginx
```

---

## 🚨 Comandos de Emergencia

Si la memoria se agota (OOM):

```bash
# 1. Ver estado inmediato
free -h && vmstat 1 5

# 2. Aumentar swap de emergencia
sudo fallocate -l 1G /swapfile-emergency
sudo chmod 600 /swapfile-emergency
sudo mkswap /swapfile-emergency
sudo swapon /swapfile-emergency

# 3. Reducir búsqueda
sudo nano /opt/obsidita/.env
# Cambiar: SEARCH_MAX_SCANNED_MB=25

# 4. Reiniciar
sudo systemctl restart obsidita

# 5. Monitorear
free -h && sleep 5 && free -h
```

---

## 📋 Checklist Rápido

Usa esto después de instalar:

```bash
#!/bin/bash

echo "✅ CHECKLIST INSTALACIÓN"

checks=(
    "Node.js: $(node --version)"
    "npm: $(npm --version)"
    "Swap: $(free -h | grep Swap | awk '{print $2}')"
    "APP DIR: $([ -d /opt/obsidita ] && echo '✓' || echo '✗')"
    ".env: $([ -f /opt/obsidita/.env ] && echo '✓' || echo '✗')"
    "Usuario obsidita: $(id obsidita 2>/dev/null && echo '✓' || echo '✗')"
    "Servicio activo: $(systemctl is-active obsidita)"
    "Nginx: $(systemctl is-active nginx)"
    "Escucha en 3000: $(lsof -i :3000 2>/dev/null && echo '✓' || echo '✗')"
    "Escucha en 80: $(lsof -i :80 2>/dev/null && echo '✓' || echo '✗')"
)

for check in "${checks[@]}"; do
    echo "  $check"
done
```

---

**Última actualización:** 2026-10-16  
**Versión:** 1.0

¿Necesitas help? Revisa `INSTALACION_Y_CONFIGURACION.md` para detalles.
