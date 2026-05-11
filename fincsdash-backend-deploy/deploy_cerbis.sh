#!/bin/bash

# --- CONFIGURACIÓN ---
REMOTE_USER="cristians"
REMOTE_HOST="192.168.1.49" # Cambiar por la IP o dominio si es necesario
REMOTE_PATH="/var/www/ia-amigo"
LOCAL_DIR="./amigoia"
SERVICE_NAME="ia-amigo.service"

echo "🚀 Iniciando despliegue de Cerbis..."

# 1. Subir archivos al servidor usando rsync (excluyendo lo innecesario)
echo "📤 Subiendo archivos a $REMOTE_HOST..."
rsync -avz --exclude 'venv' --exclude '__pycache__' --exclude '*.log' --exclude 'rename_db.py' \
    $LOCAL_DIR/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/

# 2. Reiniciar el servicio en el servidor
echo "🔄 Reiniciando servicio $SERVICE_NAME..."
ssh $REMOTE_USER@$REMOTE_HOST "sudo systemctl restart $SERVICE_NAME"

echo "✅ Despliegue completado con éxito."
