# FinCSDash

FinCSDash es la aplicacion web financiera principal. Este repositorio queda dedicado exclusivamente a la app funcional con autenticacion, backend Flask y frontend desplegable.

## Estructura

```text
app.py          Entrada ligera de la aplicacion.
backend/        API Flask, autenticacion, base de datos y servicios de correo.
frontend/dist/  Frontend funcional actual desplegado en el servidor.
fincsdash.conf  Referencia de configuracion Nginx.
```

## Seguridad

No se versionan `.env`, bases de datos locales, tokens, credenciales ni logs. Los secretos deben vivir en variables de entorno o archivos `.env` privados del servidor.

## Ejecucion local

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
python backend/app.py
```
