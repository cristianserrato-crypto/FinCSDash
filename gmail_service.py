import smtplib
from email.mime.text import MIMEText
import os

# CONFIGURACIÓN DEL CORREO
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587

# --- CORRECCIÓN ---
# Las credenciales se deben leer de variables de entorno con nombres genéricos.
EMAIL_REMITENTE = os.environ.get("fincsdash.gmail.com")
EMAIL_PASSWORD = os.environ.get("sozm wpvj tztj zipl)


def enviar_correo(destinatario, asunto, mensaje):
    msg = MIMEText(mensaje)
    msg["Subject"] = asunto
    msg["From"] = EMAIL_REMITENTE
    msg["To"] = destinatario

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
        server.starttls()
        server.login(EMAIL_REMITENTE, EMAIL_PASSWORD)
        server.send_message(msg)
