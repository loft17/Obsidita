#!/bin/bash
# Diagnóstico de una instalación de Obsidita. Se puede lanzar desde cualquier carpeta.
# Ver utils/TROUBLESHOOTING.md

cd "$(dirname "$0")/.." || exit 1

echo "🔍 Diagnóstico de Obsidita"
echo "=============================="
echo "  Carpeta: $(pwd)"
echo ""

# Node.js
echo "✓ Node.js..."
if ! command -v node &> /dev/null; then
    echo "  ❌ No se encuentra Node.js. Instala la versión 20 o superior."
    exit 1
fi
NODE_VERSION=$(node --version)
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "  ❌ Node.js $NODE_VERSION: se necesita la 20 o superior"
else
    echo "  ✅ Node.js $NODE_VERSION"
fi

# npm
echo "✓ npm..."
if command -v npm &> /dev/null; then
    echo "  ✅ npm $(npm --version)"
else
    echo "  ❌ No se encuentra npm"
fi

# git (solo para la sincronización con GitHub)
echo "✓ git..."
if command -v git &> /dev/null; then
    echo "  ✅ $(git --version)"
else
    echo "  ℹ️  No se encuentra git (solo hace falta para sincronizar con GitHub)"
fi

# Dependencias
echo "✓ Dependencias..."
if [ ! -d "node_modules" ]; then
    echo "  ❌ No existe node_modules. Ejecuta: npm install"
elif npm list express cookie-parser markdown-it vite &> /dev/null; then
    echo "  ✅ Dependencias instaladas"
else
    echo "  ❌ Faltan dependencias o están rotas. Ejecuta: npm install (sin --omit=dev)"
fi

# Build del frontend
echo "✓ Frontend compilado..."
if [ -f "web/dist/index.html" ]; then
    echo "  ✅ web/dist existe"
else
    echo "  ❌ No existe web/dist. Ejecuta: npm run web:build"
fi

# Configuración
echo "✓ Configuración..."
if [ -f "data/config.json" ]; then
    echo "  ✅ data/config.json existe"
    VAULT_PATH=$(node -e 'try { console.log(JSON.parse(require("fs").readFileSync("data/config.json", "utf8")).vaultPath ?? "") } catch {}')
    PORT_CFG=$(node -e 'try { console.log(JSON.parse(require("fs").readFileSync("data/config.json", "utf8")).port ?? "") } catch {}')
    if [ -z "$VAULT_PATH" ]; then
        echo "    ❌ config.json no se puede leer o no tiene vaultPath"
    else
        echo "    Vault: $VAULT_PATH"
        if [ -d "$VAULT_PATH" ]; then
            FILE_COUNT=$(find "$VAULT_PATH" -name "*.md" -not -path "*/.trash/*" 2>/dev/null | wc -l)
            echo "    ✅ La carpeta existe ($FILE_COUNT notas .md)"
            if [ -w "$VAULT_PATH" ]; then
                echo "    ✅ Se puede escribir en el vault (con el usuario $(whoami))"
            else
                echo "    ❌ No se puede escribir en el vault con el usuario $(whoami)"
            fi
        else
            echo "    ❌ La carpeta del vault NO existe"
        fi
    fi
else
    echo "  ℹ️  No existe data/config.json: falta la configuración inicial"
fi

# Permisos
echo "✓ Permisos..."
if [ -d "data" ]; then
    if [ -w "data" ]; then
        echo "  ✅ Se puede escribir en data/ (con el usuario $(whoami))"
    else
        echo "  ❌ No se puede escribir en data/ con el usuario $(whoami)"
    fi
else
    echo "  ℹ️  data/ aún no existe (se crea al arrancar)"
fi
if [ "$(id -u)" -eq 0 ]; then
    echo "  ⚠️  Estás ejecutando el diagnóstico como root: las comprobaciones de escritura no reflejan las del usuario de la app"
fi

# Puerto
echo "✓ Puerto..."
PORT=${PORT_CFG:-${PORT:-3000}}
if command -v ss &> /dev/null; then
    if ss -ltn "sport = :$PORT" | grep -q LISTEN; then
        echo "  ℹ️  El puerto $PORT está en uso (si es Obsidita, el servidor está en marcha)"
    else
        echo "  ✅ El puerto $PORT está libre (el servidor no está en marcha)"
    fi
elif command -v lsof &> /dev/null; then
    if lsof -Pi :"$PORT" -sTCP:LISTEN -t > /dev/null 2>&1; then
        echo "  ℹ️  El puerto $PORT está en uso (PID $(lsof -Pi :"$PORT" -sTCP:LISTEN -t | head -1))"
    else
        echo "  ✅ El puerto $PORT está libre (el servidor no está en marcha)"
    fi
else
    echo "  ℹ️  No se puede comprobar (faltan ss y lsof)"
fi

echo ""
echo "=============================="
echo "Diagnóstico terminado. Soluciones en utils/TROUBLESHOOTING.md"
