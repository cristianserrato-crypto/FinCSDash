#!/bin/bash

echo "Aplicando correcciones de migración..."

# 1. IA Amigo: Enlace simbólico a backend para dependencias compartidas
echo "Vinculando backend en IA Amigo..."
ln -sf /var/www/fincsdash/backend /var/www/ia-amigo/backend

# 2. Monitor: Crear venv e instalar flask
echo "Configurando entorno virtual para Monitor..."
python3 -m venv /var/www/monitor/venv
/var/www/monitor/venv/bin/pip install flask flask-cors 2>/dev/null

# Actualizar servicio Monitor para usar su venv
cat << ESVC > /etc/systemd/system/fincsdash-monitor.service
[Unit]
Description=Dashboard de Monitoreo FinCSDash
After=network.target

[Service]
User=cristians
Group=www-data
WorkingDirectory=/var/www/monitor
ExecStart=/var/www/monitor/venv/bin/python3 monitor.py
Restart=always

[Install]
WantedBy=multi-user.target
ESVC

# 3. Majic-3D: Liberar puerto 8020 si está ocupado y reiniciar
echo "Reiniciando Majic-3D..."
fuser -k 8020/tcp 2>/dev/null

# 4. Recargar y reiniciar todo
systemctl daemon-reload
systemctl restart ia-amigo fincsdash-monitor majic3d-landing

echo "Correcciones aplicadas. Verificando estados..."
systemctl is-active ia-amigo fincsdash-monitor majic3d-landing
