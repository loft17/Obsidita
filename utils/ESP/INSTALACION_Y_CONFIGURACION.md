# 📚 Manual de Instalación y Configuración - Obsidita

Guía completa para instalar y configurar **Obsidita** (Obsidian Web) en tu servidor, incluyendo configuración con proxy nginx.

---

## 📋 Tabla de Contenidos

1. [Requisitos del Sistema](#requisitos-del-sistema)
2. [Instalación Básica](#instalación-básica)
3. [Instalación en Producción](#instalación-en-producción)
4. [Configuración Inicial](#configuración-inicial)
5. [Configuración con Nginx](#configuración-con-nginx)
6. [Variables de Entorno](#variables-de-entorno)
7. [Seguridad](#seguridad)
8. [Administración del Sistema](#administración-del-sistema)
9. [Monitoreo y Logs](#monitoreo-y-logs)
10. [Troubleshooting](#troubleshooting)
11. [Actualizaciones](#actualizaciones)
12. [Respaldo y Recuperación](#respaldo-y-recuperación)

---

## 📦 Requisitos del Sistema

### Requisitos Mínimos

| Componente | Versión | Descripción |
|-----------|---------|-------------|
| **Node.js** | >= 20.0.0 | Motor de JavaScript backend |
| **npm** | >= 10.0.0 | Gestor de paquetes (viene con Node.js) |
| **Git** | Última | Para descargar el repositorio (opcional) |
| **Espacio en disco** | >= 500 MB | Aplicación + dependencias + datos |
| **RAM** | >= 512 MB | Memoria para ejecutar la aplicación |

### Requisitos Recomendados para Producción

| Componente | Recomendación |
|-----------|--------------|
| **Node.js** | v22 LTS o v24 actual |
| **Nginx** | 1.24+ (proxy inverso) |
| **Servidor** | Ubuntu 22.04 LTS / Debian 12 |
| **Espacio en disco** | >= 10 GB (incluye vaults) |
| **RAM** | >= 2 GB |
| **CPU** | >= 2 cores |
| **SSL/TLS** | Let's Encrypt (gratuito) |

### Sistemas Operativos Soportados

- ✅ Linux (Ubuntu, Debian, Fedora, etc.)
- ✅ macOS (Intel y Apple Silicon)
- ✅ Windows (con Node.js y npm)
- ✅ Docker (mediante contenedor)

---

## ⚙️ Instalación Básica

### Paso 1: Instalar Node.js

#### En Ubuntu/Debian:
```bash
# Actualizar paquetes
sudo apt update
sudo apt upgrade -y

# Instalar Node.js (versión LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalación
node --version  # Debe ser >= 20.0.0
npm --version   # Debe ser >= 10.0.0
```

#### En macOS:
```bash
# Con Homebrew (recomendado)
brew install node

# O descarga desde https://nodejs.org/
```

#### En Windows:
1. Descarga el instalador desde [nodejs.org](https://nodejs.org/)
2. Ejecuta el instalador y sigue el asistente
3. Abre CMD o PowerShell y verifica: `node --version`

---

### Paso 2: Descargar la Aplicación

#### Opción A: Clonar con Git
```bash
cd /opt  # o tu ubicación preferida
git clone https://github.com/tu-usuario/Obsidian-Web.git obsidita
cd obsidita
```

#### Opción B: Descargar ZIP
```bash
cd /opt
wget https://github.com/tu-usuario/Obsidian-Web/archive/main.zip
unzip main.zip
mv Obsidian-Web-main obsidita
cd obsidita
```

---

### Paso 3: Instalar Dependencias

```bash
# Instalar todas las dependencias
npm install

# Compilar la interfaz web
npm run web:build
```

**Salida esperada:**
```
up to date, audited 450 packages in 2.5s
web/dist/index.html built successfully
```

---

### Paso 4: Prueba Inicial

```bash
# Ejecutar en desarrollo
npm run dev

# O iniciar en producción
npm start
```

**Salida esperada:**
```
Obsidita listening on http://localhost:3000
Setup required
```

Abre el navegador en `http://localhost:3000` y completa la configuración inicial.

---

## 🚀 Instalación en Producción

### Estructura de Directorios Recomendada

```
/opt/obsidita/                  # Carpeta principal
├── server/                      # Backend (Node.js/Express)
├── web/                         # Frontend (React)
├── data/                        # Datos persistentes (crear si no existe)
│   ├── config.json             # Configuración
│   ├── .secret                 # Secreto de cookies
│   └── sessions/               # Sesiones de usuarios
├── .env                         # Variables de entorno
├── package.json
└── start.sh                     # Script para iniciar

/srv/vaults/                    # Vaults de Obsidian (opcional pero recomendado)
├── mi-vault/                   # Carpeta del vault
│   ├── .obsidian/
│   └── notas/
└── otro-vault/
```

### Paso 1: Crear Usuario del Sistema

```bash
# Crear usuario sin acceso a shell
sudo useradd -r -s /bin/false obsidita

# Crear directorios
sudo mkdir -p /opt/obsidita /srv/vaults
sudo mkdir -p /var/log/obsidita

# Dar permisos
sudo chown -R obsidita:obsidita /opt/obsidita /srv/vaults /var/log/obsidita
sudo chmod 750 /srv/vaults
```

---

### Paso 2: Instalar Aplicación

```bash
# Como usuario root o con sudo
sudo -u obsidita git clone https://github.com/tu-usuario/Obsidian-Web.git /opt/obsidita
cd /opt/obsidita
sudo -u obsidita npm install
sudo -u obsidita npm run web:build
```

---

### Paso 3: Crear Archivo .env

```bash
sudo nano /opt/obsidita/.env
```

**Contenido mínimo para producción:**
```env
# ===== PRODUCCIÓN =====
NODE_ENV=production
PORT=3000
HOST=127.0.0.1

# Proxy inverso (nginx)
TRUST_PROXY=1

# Carpeta raíz de vaults
VAULTS_ROOT=/srv/vaults

# Límites
MAX_NOTE_MB=20
MAX_UPLOAD_MB=50

# Sesiones
SESSION_MAX_DAYS=30
SESSION_IDLE_DAYS=7
```

**Permisos:**
```bash
sudo chmod 600 /opt/obsidita/.env
sudo chown obsidita:obsidita /opt/obsidita/.env
```

---

### Paso 4: Crear Script de Inicio

```bash
sudo nano /opt/obsidita/start.sh
```

**Contenido:**
```bash
#!/bin/bash
set -e

# Variables
APP_DIR="/opt/obsidita"
USER="obsidita"
LOG_FILE="/var/log/obsidita/app.log"
PID_FILE="/run/obsidita.pid"

# Funciones
start() {
    echo "Iniciando Obsidita..."
    cd "$APP_DIR"
    sudo -u "$USER" node server/index.js >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Iniciado con PID $(cat $PID_FILE)"
}

stop() {
    if [ -f "$PID_FILE" ]; then
        echo "Deteniendo Obsidita..."
        kill $(cat "$PID_FILE") 2>/dev/null || true
        rm -f "$PID_FILE"
        echo "Detenido"
    fi
}

restart() {
    stop
    sleep 1
    start
}

case "$1" in
    start)  start ;;
    stop)   stop ;;
    restart) restart ;;
    *)      echo "Uso: $0 {start|stop|restart}" ;;
esac
```

**Permisos:**
```bash
sudo chmod +x /opt/obsidita/start.sh
```

---

### Paso 5: Crear Servicio Systemd

**Mejor opción:** Usar systemd para gestionar el servicio automáticamente.

```bash
sudo nano /etc/systemd/system/obsidita.service
```

**Contenido:**
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

**Activar servicio:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable obsidita
sudo systemctl start obsidita

# Ver estado
sudo systemctl status obsidita

# Ver logs
sudo journalctl -u obsidita -f
```

---

## 🔧 Configuración Inicial

### Primera Ejecución

1. **Abre la aplicación:**
   ```
   http://localhost:3000  (desarrollo)
   http://tu-servidor:3000 (producción, acceso local)
   ```

2. **Pantalla de Setup:**
   - Crea una contraseña (mínimo 12 caracteres)
   - Selecciona la carpeta del vault
   - Elige las opciones de sincronización (opcional)
   - Haz clic en "Setup"

3. **Acceso:**
   - Se creará un archivo `data/config.json`
   - Ya puedes iniciar sesión en la aplicación

---

## 🔌 Configuración con Nginx

### ¿Por qué Nginx?

- **Seguridad:** HTTPS/SSL, headers de seguridad
- **Rendimiento:** Proxy inverso, compresión
- **Escalabilidad:** Múltiples instancias
- **Caché:** Estático más eficiente

---

### Paso 1: Instalar Nginx

#### Ubuntu/Debian:
```bash
sudo apt update
sudo apt install -y nginx

# Iniciar servicio
sudo systemctl start nginx
sudo systemctl enable nginx

# Verificar
sudo systemctl status nginx
```

---

### Paso 2: Configuración Básica (sin HTTPS)

```bash
sudo nano /etc/nginx/sites-available/obsidita
```

**Contenido:**
```nginx
upstream obsidita {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name tu-dominio.com www.tu-dominio.com;

    client_max_body_size 50M;  # Máximo tamaño de adjuntos
    
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
        
        # WebSocket (para futuras características)
        proxy_set_header Connection "";
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Caché de assets (imágenes, CSS, JS)
    location /assets {
        proxy_pass http://obsidita;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

---

### Paso 3: Configuración HTTPS (Recomendado)

#### Opción A: Let's Encrypt + Certbot

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Generar certificado (automático)
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com

# Auto-renovación
sudo systemctl enable certbot.timer
```

#### Opción B: Configuración Manual HTTPS

```bash
sudo nano /etc/nginx/sites-available/obsidita
```

**Contenido completo (con HTTPS):**
```nginx
upstream obsidita {
    server 127.0.0.1:3000;
    keepalive 64;
}

# Redirigir HTTP a HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name tu-dominio.com www.tu-dominio.com;
    
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name tu-dominio.com www.tu-dominio.com;

    # Certificados SSL
    ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

    # Configuración SSL de seguridad
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Headers de seguridad
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

    # Caché de assets
    location /assets {
        proxy_pass http://obsidita;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

---

### Paso 4: Activar Configuración

```bash
# Crear enlace simbólico
sudo ln -s /etc/nginx/sites-available/obsidita /etc/nginx/sites-enabled/

# Verificar sintaxis
sudo nginx -t

# Recargar Nginx
sudo systemctl reload nginx

# Reiniciar si hay cambios importantes
sudo systemctl restart nginx
```

---

### Paso 5: Verificar

```bash
# Accede a https://tu-dominio.com

# Ver logs de error
tail -f /var/log/nginx/obsidita-error.log

# Ver peticiones
tail -f /var/log/nginx/obsidita-access.log
```

---

## 🌍 Variables de Entorno

Crea o edita el archivo `/opt/obsidita/.env`:

### Variables Principales

```env
# ===== PUERTO Y HOST =====
# Puerto donde escucha la aplicación
PORT=3000

# Host: 127.0.0.1 = solo local (recomendado con nginx)
# vacío = escucha en todas las interfaces
HOST=127.0.0.1

# ===== ENTORNO =====
NODE_ENV=production

# ===== PROXY INVERSO =====
# Pon 1 si está detrás de nginx/Caddy (para IP real del cliente)
TRUST_PROXY=1

# ===== VAULTS =====
# Carpeta raíz donde están los vaults
VAULTS_ROOT=/srv/vaults

# ===== LÍMITES DE TAMAÑO (MB) =====
# Máximo al guardar una nota
MAX_NOTE_MB=20

# Máximo de un adjunto subido
MAX_UPLOAD_MB=50

# ===== BÚSQUEDA =====
# Tamaño máximo de archivo a indexar (MB)
SEARCH_MAX_FILE_MB=2

# Total de MB a indexar en memoria
SEARCH_MAX_SCANNED_MB=200

# Máximo de caracteres en búsqueda
SEARCH_MAX_QUERY_LENGTH=200

# Resultados máximos
SEARCH_MAX_RESULTS=200

# Coincidencias por archivo
SEARCH_MAX_MATCHES_PER_FILE=5

# Búsquedas por minuto por IP
SEARCH_RATE_MAX=60

# ===== SESIONES (DÍAS) =====
# Duración máxima de sesión
SESSION_MAX_DAYS=30

# Inactividad antes de expirar
SESSION_IDLE_DAYS=7

# ===== CONTRASEÑA =====
# Longitud mínima requerida
MIN_PASSWORD_LENGTH=12

# ===== ACTUALIZACIONES =====
# Comprobar versiones nuevas en GitHub
UPDATE_CHECK=1

# ===== FUENTES PERSONALIZADAS =====
# Directorio con .woff2, .woff, .ttf, .otf
FONTS_DIR=/etc/obsidita/fonts
```

---

## 🔒 Seguridad

### Recomendaciones Críticas

#### 1. Contraseña Fuerte
```bash
# Al hacer setup, usa una contraseña de mínimo 12 caracteres
# Incluye mayúsculas, minúsculas, números y símbolos
# Ejemplo: Obsidita@2024!secure
```

#### 2. HTTPS Obligatorio
```bash
# Siempre usa SSL/TLS en producción
# Let's Encrypt es gratuito: certbot --nginx
```

#### 3. Firewall
```bash
# Permitir solo puertos necesarios
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP (redirige a HTTPS)
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
```

#### 4. Permisos de Archivos
```bash
# data/ contiene información sensible
sudo chmod 700 /opt/obsidita/data
sudo chmod 600 /opt/obsidita/data/*
sudo chmod 600 /opt/obsidita/.env
```

#### 5. Copias de Seguridad
```bash
# Backup automático diario
sudo nano /etc/cron.daily/obsidita-backup

#!/bin/bash
BACKUP_DIR="/backup/obsidita"
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/obsidita-$(date +%Y%m%d).tar.gz" \
    /opt/obsidita/data /srv/vaults
# Mantener solo últimos 7 días
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete
```

#### 6. Rate Limiting (en Nginx)
```nginx
# Añadir a la configuración nginx:
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

location / {
    limit_req zone=general burst=20;
}

location /api/auth {
    limit_req zone=login;
}
```

---

## 👨‍💼 Administración del Sistema

### Gestionar el Servicio

```bash
# Iniciar
sudo systemctl start obsidita

# Detener
sudo systemctl stop obsidita

# Reiniciar
sudo systemctl restart obsidita

# Recargar sin desconectar (si es posible)
sudo systemctl reload obsidita

# Ver estado
sudo systemctl status obsidita

# Habilitar al inicio
sudo systemctl enable obsidita

# Deshabilitar al inicio
sudo systemctl disable obsidita
```

### Ver Logs

```bash
# Logs del servicio (últimas 50 líneas)
sudo journalctl -u obsidita -n 50

# Logs en tiempo real
sudo journalctl -u obsidita -f

# Logs de nginx
tail -f /var/log/nginx/obsidita-error.log
tail -f /var/log/nginx/obsidita-access.log

# Logs con filtro de fecha
sudo journalctl -u obsidita --since "2 hours ago"
```

### Actualizar Configuración

```bash
# Editar .env
sudo nano /opt/obsidita/.env

# Reiniciar para aplicar cambios
sudo systemctl restart obsidita
```

---

## 📊 Monitoreo y Logs

### Monitoreo Básico

```bash
# Espacio en disco
df -h /srv/vaults
df -h /opt/obsidita

# Uso de memoria
free -h

# Procesos Node.js
ps aux | grep node

# Puerto en uso
sudo netstat -tlnp | grep 3000
```

### Monitoreo Avanzado (Opcional)

#### Con Prometheus + Grafana

```bash
# Instalar node_exporter
wget https://github.com/prometheus/node_exporter/releases/download/v1.6.0/node_exporter-1.6.0.linux-amd64.tar.gz
tar xzf node_exporter-1.6.0.linux-amd64.tar.gz
sudo mv node_exporter-1.6.0.linux-amd64/node_exporter /usr/local/bin/
```

#### Con PM2 (para múltiples instancias)

```bash
# Instalar PM2
sudo npm install -g pm2

# Iniciar con PM2
pm2 start server/index.js --name obsidita

# Ver estado
pm2 status

# Logs
pm2 logs obsidita

# Monitoreo en tiempo real
pm2 monit
```

---

## 🚨 Troubleshooting

### La aplicación no inicia

**Error:** `Error listening on port 3000`

```bash
# Verificar qué usa el puerto 3000
sudo lsof -i :3000

# Matar proceso si es necesario
kill -9 <PID>

# Cambiar puerto en .env
PORT=3001
```

---

### Permisos denegados en data/

**Error:** `EACCES: permission denied, open '.../data/config.json'`

```bash
# Dar permisos correctos
sudo chown -R obsidita:obsidita /opt/obsidita/data
sudo chmod 755 /opt/obsidita/data
sudo chmod 644 /opt/obsidita/data/*
```

---

### Nginx devuelve 502 Bad Gateway

**Causa:** Obsidita no está corriendo o no responde

```bash
# Verificar estado
sudo systemctl status obsidita

# Iniciar si está parado
sudo systemctl start obsidita

# Ver logs
sudo journalctl -u obsidita -n 20

# Verificar conectividad
curl -v http://127.0.0.1:3000
```

---

### Problema: "Not configured"

**Error:** Pantalla que pide setup cada vez

```bash
# Verificar que data/config.json existe
ls -la /opt/obsidita/data/config.json

# Si no existe, acceder a http://dominio.com/api/setup
# e iniciar setup nuevamente

# Si existe pero no se lee:
sudo chown obsidita:obsidita /opt/obsidita/data/config.json
sudo chmod 600 /opt/obsidita/data/config.json
```

---

### Memoria alta / Crashes

**Causa:** Vault muy grande o búsqueda intensiva

```bash
# Reducir límites en .env
SEARCH_MAX_SCANNED_MB=100
SEARCH_MAX_FILE_MB=1

# O aumentar memoria del sistema
# Usar PM2 con --max-memory-restart
pm2 start server/index.js --max-memory-restart 500M
```

---

### Slow Upload

**Error:** Timeouts al subir archivos

```nginx
# En nginx, aumentar timeouts:
proxy_connect_timeout 120s;
proxy_send_timeout 120s;
proxy_read_timeout 120s;

# Y client_max_body_size:
client_max_body_size 100M;
```

---

## 🔄 Actualizaciones

### Actualizar a Nueva Versión

```bash
# Detener servicio
sudo systemctl stop obsidita

# Entrar en directorio
cd /opt/obsidita

# Descargar cambios
sudo -u obsidita git pull origin main

# Instalar dependencias nuevas (si las hay)
sudo -u obsidita npm install

# Compilar frontend
sudo -u obsidita npm run web:build

# Iniciar
sudo systemctl start obsidita

# Verificar
sudo systemctl status obsidita
```

### Rollback (volver a versión anterior)

```bash
cd /opt/obsidita

# Ver historial
git log --oneline -5

# Volver a commit anterior
sudo -u obsidita git checkout <commit-hash>

# Reinstalar
sudo -u obsidita npm install
sudo -u obsidita npm run web:build

# Reiniciar
sudo systemctl restart obsidita
```

---

## 💾 Respaldo y Recuperación

### Crear Respaldo Manual

```bash
#!/bin/bash
# Script: backup-obsidita.sh

BACKUP_DIR="/backup/obsidita"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/obsidita_$TIMESTAMP.tar.gz"

# Crear directorio
mkdir -p "$BACKUP_DIR"

# Respaldar
tar -czf "$BACKUP_FILE" \
    /opt/obsidita/data \
    /srv/vaults \
    /opt/obsidita/.env

echo "Respaldo creado: $BACKUP_FILE"

# Mantener solo últimos 7 días
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete
```

### Configurar Respaldo Automático

```bash
# Crear script
sudo nano /usr/local/bin/backup-obsidita.sh
# (Pegar contenido anterior)

# Hacer ejecutable
sudo chmod +x /usr/local/bin/backup-obsidita.sh

# Añadir a cron (cada día a las 02:00)
sudo crontab -e

# Añadir línea:
0 2 * * * /usr/local/bin/backup-obsidita.sh >> /var/log/backup-obsidita.log 2>&1
```

### Restaurar desde Respaldo

```bash
# Detener servicio
sudo systemctl stop obsidita

# Extraer respaldo
cd /
sudo tar -xzf /backup/obsidita/obsidita_YYYYMMDD_HHMMSS.tar.gz

# Ajustar permisos
sudo chown -R obsidita:obsidita /opt/obsidita/data /srv/vaults

# Reiniciar
sudo systemctl start obsidita
```

### Verificar Integridad

```bash
# Tamaño de respaldo
du -sh /backup/obsidita/*

# Contenido del respaldo
tar -tzf /backup/obsidita/obsidita_*.tar.gz | head -20

# Espacio disponible
df -h /backup
```

---

## 📈 Optimizaciones Avanzadas

### Múltiples Instancias (Load Balancing)

```nginx
upstream obsidita_cluster {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://obsidita_cluster;
        # ... resto de configuración
    }
}
```

### Caché de Assets Avanzado

```nginx
# Cache proxy
proxy_cache_path /var/cache/nginx/obsidita levels=1:2 keys_zone=obsidita:100m;

location /assets {
    proxy_pass http://obsidita;
    proxy_cache obsidita;
    proxy_cache_valid 200 1y;
    proxy_cache_bypass $http_cache_control;
    add_header X-Cache-Status $upstream_cache_status;
}
```

### Compresión

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript 
            application/json application/javascript application/xml+rss 
            application/atom+xml image/svg+xml;
```

---

## 📝 Checklist de Instalación

Usa este checklist para verificar que todo está configurado correctamente:

- [ ] Node.js >= 20.0.0 instalado
- [ ] Aplicación descargada y dependencias instaladas
- [ ] Archivo .env configurado
- [ ] Servicio systemd creado y habilitado
- [ ] Nginx instalado y configurado
- [ ] SSL/HTTPS con Let's Encrypt
- [ ] Firewall configurado (puertos 22, 80, 443)
- [ ] Permisos de directorios correctos
- [ ] Primer respaldo creado
- [ ] Cron de respaldo automático configurado
- [ ] Setup inicial completado
- [ ] Acceso por HTTPS funciona
- [ ] Búsqueda indexa correctamente
- [ ] Monitoreo básico en lugar
- [ ] Rate limiting activo

---

## 🎓 Recursos Adicionales

- **Documentación oficial:** [Obsidian Help](https://help.obsidian.md)
- **Node.js:** [nodejs.org](https://nodejs.org)
- **Nginx:** [nginx.org](https://nginx.org)
- **Let's Encrypt:** [letsencrypt.org](https://letsencrypt.org)
- **Systemd:** `man systemd.service`
- **PM2:** [pm2.keymetrics.io](https://pm2.keymetrics.io)

---

**Última actualización:** 2026-10-16  
**Versión:** 1.0  
**Autor:** Equipo de Obsidita

---

## 📞 Soporte

Si encuentras problemas:

1. Revisa la sección [Troubleshooting](#troubleshooting)
2. Verifica los logs: `sudo journalctl -u obsidita -f`
3. Consulta el repositorio de GitHub
4. Reporta issues con detalles del error

**¡Gracias por usar Obsidita!** 🎉
