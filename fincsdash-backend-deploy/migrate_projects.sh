#!/bin/bash

# --- CONFIGURACIÓN ---
BACKUP_DIR="/var/www/fincsdash"
IA_DIR="/var/www/ia-amigo"
MONITOR_DIR="/var/www/monitor"
MAJIC_DIR="/var/www/majic-3d"

echo "Iniciando migración de proyectos..."

# 1. Crear directorios
mkdir -p $IA_DIR $MONITOR_DIR $MAJIC_DIR

# 2. Mover archivos de IA Amigo
echo "Organizando IA Amigo..."
if [ -f "$BACKUP_DIR/ia_amigo.py" ]; then
    mv $BACKUP_DIR/ia_amigo.py $IA_DIR/
fi
if [ -d "$BACKUP_DIR/venv_amigo" ]; then
    mv $BACKUP_DIR/venv_amigo $IA_DIR/venv
fi
[ -f "$BACKUP_DIR/ia_amigo.log" ] && mv $BACKUP_DIR/ia_amigo.log $IA_DIR/
[ -f "$BACKUP_DIR/ia_amigo_error.log" ] && mv $BACKUP_DIR/ia_amigo_error.log $IA_DIR/

# 3. Mover archivos de Monitor
echo "Organizando Monitor..."
if [ -f "$BACKUP_DIR/monitor.py" ]; then
    mv $BACKUP_DIR/monitor.py $MONITOR_DIR/
fi

# 4. Mover archivos de Majic.3D
echo "Organizando Majic.3D..."
if [ -d "$BACKUP_DIR/majic-3d-landing" ]; then
    mv $BACKUP_DIR/majic-3d-landing/* $MAJIC_DIR/ 2>/dev/null
    rmdir $BACKUP_DIR/majic-3d-landing 2>/dev/null
fi

# 5. Crear archivos de servicio Systemd
echo "Creando servicios Systemd..."

cat << ESVC > /etc/systemd/system/ia-amigo.service
[Unit]
Description=Servicio de AmigoIA
After=network.target

[Service]
User=cristians
Group=www-data
WorkingDirectory=/var/www/ia-amigo
ExecStart=/var/www/ia-amigo/venv/bin/python3 ia_amigo.py
Restart=always

[Install]
WantedBy=multi-user.target
ESVC

cat << ESVC > /etc/systemd/system/fincsdash-monitor.service
[Unit]
Description=Dashboard de Monitoreo FinCSDash
After=network.target

[Service]
User=cristians
Group=www-data
WorkingDirectory=/var/www/monitor
ExecStart=/usr/bin/python3 monitor.py
Restart=always

[Install]
WantedBy=multi-user.target
ESVC

cat << ESVC > /etc/systemd/system/majic3d-landing.service
[Unit]
Description=Landing page de Majic.3D
After=network.target

[Service]
User=cristians
Group=www-data
WorkingDirectory=/var/www/majic-3d
ExecStart=/usr/bin/python3 -m http.server 8020 --bind 0.0.0.0
Restart=always

[Install]
WantedBy=multi-user.target
ESVC

# 6. Permisos
echo "Ajustando permisos..."
chown -R cristians:www-data $IA_DIR $MONITOR_DIR $MAJIC_DIR

# 7. Activar servicios
echo "Activando servicios..."
systemctl daemon-reload
systemctl enable ia-amigo fincsdash-monitor majic3d-landing
systemctl restart ia-amigo fincsdash-monitor majic3d-landing

# 8. Mover configuración de Nginx si existe
if [ -f "$BACKUP_DIR/amigoia.conf" ]; then
    mv $BACKUP_DIR/amigoia.conf /etc/nginx/sites-available/ia_amigo.conf
    sed -i 's|/var/www/fincsdash|/var/www/ia-amigo|g' /etc/nginx/sites-available/ia_amigo.conf
    ln -sf /etc/nginx/sites-available/ia_amigo.conf /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
fi

echo "Migración completada con éxito."
