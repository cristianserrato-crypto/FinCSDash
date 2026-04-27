# SysDash — dashboard de servidor

Interfaz oscura (cian / azul) con gráficos: CPU, RAM, swap, carga, discos, procesos y servicios `systemd` activos.

## Cómo funciona

- **Backend:** Flask + `psutil` + `systemctl list-units` (solo lectura).
- **Frontend:** HTML/CSS/JS + Chart.js; mismo origen que la API (Gunicorn sirve estáticos y `/api/*`).
- **Seguridad:** variable `DASHBOARD_TOKEN`. El navegador guarda el token en `sessionStorage` y lo envía como `Authorization: Bearer <token>`.

## Local (Windows / Mac / Linux)

```bash
cd server-dashboard/backend
pip install -r requirements.txt
set DASHBOARD_TOKEN=tu_token   # Windows: set
export DASHBOARD_TOKEN=tu_token # Linux/macOS
python app.py
```

Abre `http://127.0.0.1:8001`, pega el token y listo.

## Servidor Linux (Gunicorn en otro puerto)

FinCSDash suele usar **8000**. SysDash usa **8001** en `127.0.0.1` para no chocar.

1. Copia la carpeta `server-dashboard` a `/var/www/server-dashboard` (o similar).
2. Crea venv e instala dependencias:

   ```bash
   python3 -m venv /var/www/server-dashboard/venv
   /var/www/server-dashboard/venv/bin/pip install -r backend/requirements.txt
   ```

3. Ajusta rutas en `sysdash.service.example`, copia a `/etc/systemd/system/sysdash.service`, define `DASHBOARD_TOKEN`.
4. `sudo systemctl daemon-reload && sudo systemctl enable --now sysdash`

## ¿Otro túnel Cloudflare?

**No hace falta un segundo proceso `cloudflared`.** En el mismo túnel añades otra regla de **ingress** (otro hostname) hacia `http://127.0.0.1:8001`.

Ejemplo conceptual en `config.yml` de Cloudflare Tunnel:

```yaml
ingress:
  - hostname: fincsdash.online
    service: http://127.0.0.1:80
  - hostname: dash.tudominio.com
    service: http://127.0.0.1:8001
  - service: http_status:404
```

Así **FinCSDash** sigue igual (puerto 80 / tu Nginx actual) y **SysDash** queda aislado en **8001**. Solo asegúrate de que Nginx no capture el nuevo hostname antes que el túnel, según cómo tengas el origen (si el túnel apunta directo a 8001, Nginx no interviene en ese hostname).

Alternativa: proxy en Nginx desde `dash.tudominio.com` → `127.0.0.1:8001` (ver `nginx-location.example.conf`).

## Dominio y HTTPS

- Si usas Cloudflare “proxied”, HTTPS lo termina Cloudflare hacia tu túnel.
- Si expones solo Nginx, añade `server_name` + Certbot para el subdominio del dashboard.

## FinCSDash (usuarios registrados)

El endpoint `/api/metrics` incluye `fincsdash_users`: total, cuántos verificados y lista `id` / `email` / `verificado` desde la tabla `usuarios`.

Requiere las mismas variables `DB_*` que el backend FinCSDash. En el servidor puedes fusionarlas desde el unit systemd:

```bash
python3 ~/server-dashboard/scripts/merge-db-from-fincsdash.py
```

Añade `DB_SSLMODE=disable` si PostgreSQL es local sin SSL. Reinicia Gunicorn después de editar `sysdash.env`.

## Notas

- El token en el navegador **no es ideal** si la URL es pública; para uso personal suele bastar. Para más seguridad: VPN, Basic Auth en Nginx, o IP allowlist.
- `systemctl` sin privilegios suele listar servicios en ejecución; si ves error en la tabla, revisa el usuario del servicio systemd.
