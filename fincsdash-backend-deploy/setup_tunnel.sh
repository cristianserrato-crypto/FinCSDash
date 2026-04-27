#!/bin/bash

echo "Configurando subdominio amigoia.fincsdash.online..."

# 1. Agregar ruta DNS en Cloudflare
cloudflared tunnel route dns fincs-tunnel amigoia.fincsdash.online

# 2. Actualizar config.yml para incluir AmigoIA
cat << ECONF > /home/cristians/.cloudflared/config.yml
tunnel: 4ac26f19-0aa9-41f0-aabf-4665ec428e82
credentials-file: /home/cristians/.cloudflared/4ac26f19-0aa9-41f0-aabf-4665ec428e82.json

ingress:
  - hostname: amigoia.fincsdash.online
    service: http://localhost:5005
  - hostname: fincsdash.online
    service: http://localhost:80
  - service: http_status:404
ECONF

# 3. Reiniciar servicios
systemctl restart cloudflared
systemctl restart ia-amigo

echo "Listo! AmigoIA ahora accesible en https://amigoia.fincsdash.online"
