# --- CONFIGURACION ---
$REMOTE_USER = "cristians"
$REMOTE_HOST = "192.168.1.49"
$REMOTE_PATH = "/var/www/ia-amigo"
$LOCAL_DIR = "./amigoia/"
$SERVICE_NAME = "ia-amigo.service"

Write-Host "Iniciando despliegue de Cerbis desde Windows..." -ForegroundColor Cyan

# 1. Subir archivos al servidor usando scp
Write-Host "Subiendo archivos a $REMOTE_HOST..." -ForegroundColor Yellow

# Usar scp recursivo. Nos aseguramos de estar en el directorio correcto.
scp -r $LOCAL_DIR* "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/"

# 2. Reiniciar el servicio en el servidor
Write-Host "Reiniciando servicio $SERVICE_NAME..." -ForegroundColor Yellow
ssh "${REMOTE_USER}@${REMOTE_HOST}" "sudo systemctl restart $SERVICE_NAME"

Write-Host "Despliegue completado con exito." -ForegroundColor Green
