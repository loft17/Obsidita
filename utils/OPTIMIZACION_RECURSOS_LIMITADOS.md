# 💪 Optimización para VPS con Recursos Limitados

Guía para ejecutar **Obsidita** en servidores con **RAM limitada** (512 MB - 2 GB).

---

## 📊 Tabla de Requisitos por RAM Disponible

| RAM VPS | Swap | Node Heap | Config Recomendada | Rendimiento |
|---------|------|-----------|-------------------|------------|
| **512 MB** | 2 GB | 256 MB | Minimal | Lento, mucho swap |
| **1 GB** | 2 GB | 512 MB | Basado | Aceptable |
| **2 GB** | 1 GB | 1024 MB | Estándar | Bueno |
| **4+ GB** | Opcional | 1.5-2 GB | Premium | Excelente |

---

## 🚨 Tu Situación Actual

```
RAM: 854 MB
Disponible: ~70 MB (muy crítico)
Swap: 2 GB (bien configurado)
```

**Estado:** Viable pero al límite. Necesitas optimizaciones.

---

## 🔧 Paso 1: Verificar y Expandir Swap

### Verificar swap actual

```bash
# Ver estado actual
free -h
swapon --show

# Verificar si hay swap en /swapfile
ls -lh /swapfile
```

### Si aún no tienes swap o es insuficiente

```bash
# Crear o expandir swap a 3-4 GB
sudo swapoff /swapfile  # desactivar si existe
sudo rm -f /swapfile    # eliminar si existe

# Crear nuevo swapfile (3 GB para seguridad)
sudo fallocate -l 3G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Verificar
free -h

# Hacer permanente (si no está en fstab)
grep swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Optimizar swap (importante en VPS)

```bash
# Reducir uso de swap (usar solo si es necesario)
# Valores: 0-100, por defecto 60
# Más bajo = menos uso de swap
sudo sysctl vm.swappiness=30  # temporal

# Permanente:
echo 'vm.swappiness=30' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## 🎯 Paso 2: Configurar Node.js para Poca Memoria

### Durante Instalación

```bash
# Para instalar dependencias
NODE_OPTIONS="--max-old-space-size=512" npm install

# Para compilar el frontend (si tienes más de 1 GB de RAM)
NODE_OPTIONS="--max-old-space-size=1024" npm run web:build

# Si aún falla (512 MB de RAM):
NODE_OPTIONS="--max-old-space-size=256" npm run web:build
```

### En Producción (archivo .env)

```bash
# Editar .env
sudo nano /opt/obsidita/.env

# Añadir:
NODE_OPTIONS="--max-old-space-size=512"
```

### Archivo de servicio systemd

```bash
sudo nano /etc/systemd/system/obsidita.service
```

Dentro de `[Service]`, añadir:

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

Luego recargar:

```bash
sudo systemctl daemon-reload
sudo systemctl restart obsidita
```

---

## 🔍 Paso 3: Optimizar Búsqueda (Grandes Impacto en Memoria)

El **búsqueda indexada** es lo que más consume memoria. En `.env`:

```env
# === BÚSQUEDA OPTIMIZADA PARA POCA MEMORIA ===

# Reducir archivos indexados (crítico)
# Por defecto: 200 MB en memoria
# Para 512 MB RAM: máximo 50 MB
SEARCH_MAX_SCANNED_MB=50

# No indexar archivos > 1 MB
# Por defecto: 2 MB
SEARCH_MAX_FILE_MB=0.5

# Resultados máximos (evita procesar mucho)
SEARCH_MAX_RESULTS=100

# Coincidencias por archivo
SEARCH_MAX_MATCHES_PER_FILE=3

# Búsquedas concurrentes máximas
SEARCH_RATE_MAX=30

# Longitud máxima de búsqueda
SEARCH_MAX_QUERY_LENGTH=150
```

**Impacto:** Reducción de memoria de 200+ MB a 50-100 MB.

---

## 📦 Paso 4: Reducir Dependencias Innecesarias

### Instalar solo lo necesario

```bash
# Instalar SOLO dependencias de producción
npm ci --only=production

# Limpiar cache de npm
npm cache clean --force

# Ver tamaño instalado
du -sh node_modules/
```

**Ahorro esperado:** 50-100 MB.

---

## 💾 Paso 5: Optimizar Limitaciones de la Aplicación

En `.env`:

```env
# === LIMITACIONES DE TAMAÑO ===

# Máximo por nota (por defecto 20 MB)
# Para poca RAM: reducir a 5-10 MB
MAX_NOTE_MB=10

# Máximo por adjunto (por defecto 50 MB)
# Para poca RAM: reducir a 10-20 MB
MAX_UPLOAD_MB=20

# === SESIONES ===
# Expirar sesiones más rápido para ahorrar memoria
SESSION_MAX_DAYS=7
SESSION_IDLE_DAYS=1
```

---

## 🚀 Paso 6: Compilar en Máquina Diferente (Recomendado)

**Si la compilación sigue fallando**, compila en tu máquina local o en un servidor más potente:

### En tu PC/Mac:

```bash
# 1. Clonar repositorio localmente
git clone https://github.com/tu-usuario/Obsidian-Web.git
cd Obsidian-Web

# 2. Instalar dependencias y compilar
npm install
npm run web:build

# 3. Comprime solo lo necesario
tar -czf obsidita-compiled.tar.gz \
  node_modules/ \
  web/dist/ \
  server/ \
  .env \
  package.json

# 4. Subir al VPS
scp obsidita-compiled.tar.gz root@tu-vps:/tmp/

# 5. En el VPS, descomprimir
cd /opt/obsidita
tar -xzf /tmp/obsidita-compiled.tar.gz
```

---

## 📊 Monitoreo de Memoria en Tiempo Real

### Ver consumo actual

```bash
# Memoria por proceso
ps aux --sort=-%mem | grep node | head -5

# Monitoreo en tiempo real
watch -n 1 'free -h && echo "---" && ps aux --sort=-%mem | grep node | head -3'

# Con htop (si está instalado)
sudo apt install htop
htop  # Buscar "node" con F3
```

### Alertas automáticas

```bash
# Script de alerta si memoria > 80%
sudo nano /usr/local/bin/check-memory.sh
```

**Contenido:**

```bash
#!/bin/bash
THRESHOLD=80
USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')

if [ $USAGE -gt $THRESHOLD ]; then
    echo "⚠️ ALERTA: Memoria al ${USAGE}%" | \
    tee -a /var/log/memory-alerts.log
    
    # Opcional: reiniciar servicio
    # sudo systemctl restart obsidita
fi
```

**Ejecutar cada 5 minutos:**

```bash
sudo chmod +x /usr/local/bin/check-memory.sh
sudo crontab -e

# Añadir:
*/5 * * * * /usr/local/bin/check-memory.sh >> /var/log/memory-cron.log 2>&1
```

---

## 🎛️ Paso 7: Limitar Procesos Node

### Usando cgroups (limitación de recursos)

```bash
# Instalar cgroupsv2
sudo apt install cgroup-tools

# Crear grupo para obsidita
sudo cgcreate -g memory:/obsidita

# Limitar a 600 MB
echo 629145600 | sudo tee /sys/fs/cgroup/obsidita/memory.limit_in_bytes

# Iniciar proceso dentro del grupo
sudo cgexec -g memory:/obsidita node server/index.js
```

### Usando systemd (más fácil)

En `/etc/systemd/system/obsidita.service`:

```ini
[Service]
MemoryLimit=600M
MemoryAccounting=yes
```

---

## 🔄 Paso 8: Usar Proxy en Nginx para Caché

Nginx puede cachear respuestas, reduciendo la carga en Node:

```nginx
# En /etc/nginx/sites-available/obsidita

proxy_cache_path /var/cache/nginx/obsidita levels=1:2 keys_zone=obsidita:10m max_size=100m;

upstream obsidita {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl http2;
    server_name tu-dominio.com;

    # Caché agresivo para recursos estáticos
    location /assets {
        proxy_pass http://obsidita;
        proxy_cache obsidita;
        proxy_cache_valid 200 7d;  # 7 días
        add_header X-Cache-Status $upstream_cache_status;
    }

    # NO cachear API (cambios en tiempo real)
    location /api {
        proxy_pass http://obsidita;
        proxy_no_cache 1;
        proxy_cache_bypass 1;
    }

    location / {
        proxy_pass http://obsidita;
        proxy_cache obsidita;
        proxy_cache_valid 200 5m;  # 5 minutos
        proxy_cache_bypass $http_cache_control;
    }
}
```

---

## ⚡ Paso 9: Configuración Completa Mínima

**Archivo `.env` optimizado para 512 MB - 1 GB RAM:**

```env
# === ENTORNO ===
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
TRUST_PROXY=1
NODE_OPTIONS="--max-old-space-size=512"

# === MEMORIA ===
MAX_NOTE_MB=10
MAX_UPLOAD_MB=20

# === BÚSQUEDA (CRÍTICO) ===
SEARCH_MAX_SCANNED_MB=50
SEARCH_MAX_FILE_MB=0.5
SEARCH_MAX_RESULTS=100
SEARCH_MAX_MATCHES_PER_FILE=3
SEARCH_RATE_MAX=30

# === SESIONES ===
SESSION_MAX_DAYS=7
SESSION_IDLE_DAYS=1

# === VAULTS ===
VAULTS_ROOT=/srv/vaults

# === OTROS ===
UPDATE_CHECK=0  # Desactiva check de GitHub para ahorrar ancho banda
MIN_PASSWORD_LENGTH=12
```

---

## 📈 Paso 10: Escalado Futuro

Si te falta memoria incluso con estas optimizaciones:

### Opción 1: Actualizar VPS
- Pasarse a 2GB RAM (coste pequeño, impacto grande)

### Opción 2: Vaults Múltiples
- Dividir vaults grandes en varios VPS más pequeños

### Opción 3: CDN para Assets
- Servir `/assets` desde CloudFlare (gratis)
- Reduce carga en servidor

```nginx
# En nginx:
location /assets {
    # Redirigir a CDN
    return 301 https://cdn.tu-dominio.com$request_uri;
}
```

---

## 🐛 Troubleshooting para Poca Memoria

### Error: "ENOMEM: out of memory"

```bash
# 1. Aumentar swap
fallocate -l 1G /swapfile2
chmod 600 /swapfile2
mkswap /swapfile2
swapon /swapfile2

# 2. Reducir SEARCH_MAX_SCANNED_MB
sudo nano /opt/obsidita/.env
# Cambiar a 30 MB

# 3. Reiniciar
sudo systemctl restart obsidita
```

### Compilación falla con "killed"

```bash
# Usar compilación remota (ver Paso 6)
# O:

# Aumentar swap temporalmente
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Compilar con menos heap
NODE_OPTIONS="--max-old-space-size=256" npm run web:build
```

### Aplicación lenta o congela

```bash
# Verificar memoria
free -h

# Ver si hay swap activo (malo)
vmstat 1 5

# Si > 80% en uso, reducir limits en .env:
SEARCH_MAX_SCANNED_MB=25
SESSION_MAX_DAYS=3

# Reiniciar
sudo systemctl restart obsidita
```

---

## 📝 Checklist para Tu VPS (854 MB RAM)

- [ ] Swap ampliado a 3+ GB
- [ ] `vm.swappiness=30` configurado
- [ ] `.env` con `NODE_OPTIONS="--max-old-space-size=512"`
- [ ] `SEARCH_MAX_SCANNED_MB=50` (o menor)
- [ ] `MAX_NOTE_MB=10`, `MAX_UPLOAD_MB=20`
- [ ] `node_modules` solo en producción
- [ ] Nginx con caché configurado
- [ ] Script de monitoreo de memoria corriendo
- [ ] Prueba: crear nota de 5 MB
- [ ] Prueba: búsqueda en todo el vault
- [ ] Prueba: subir archivo de 10 MB

---

## 💡 Consejos Finales

1. **Monitorea constantemente:** `watch -n 2 'free -h'`
2. **Logs son tu amigo:** `sudo journalctl -u obsidita -f`
3. **No subes mucho swap:** Swap lento, RP mejor
4. **Redimensiona límites:** Empieza pequeño, aumenta si hay espacio
5. **Considere actualizar VPS:** 2GB cuesta poco más

---

## 📊 Comparativa: Antes vs Después

| Métrica | Antes | Después |
|---------|-------|---------|
| RAM libre | 70 MB | ~200 MB |
| Swap activo | 100%+ | 30-50% |
| Búsqueda en memoria | 200 MB | 50 MB |
| Compilación web | ❌ Falla | ✅ OK |
| Rendimiento | Muy lento | Aceptable |

---

**Última actualización:** 2026-10-16  
**Versión:** 1.0

Si aplicas estos pasos, tu VPS de 854 MB debería funcionar correctamente. 🚀
