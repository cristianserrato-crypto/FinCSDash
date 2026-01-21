import smtplib
from email.mime.text import MIMEText
import os

# CONFIGURACIÓN DEL CORREO
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587


EMAIL_REMITENTE = "fincsdash@gmail.com"
EMAIL_PASSWORD = "zelj aekz souk mckt"


def enviar_correo(destinatario, asunto, mensaje):
    msg = MIMEText(mensaje)
    msg["Subject"] = asunto
    msg["From"] = EMAIL_REMITENTE
    msg["To"] = destinatario

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
        server.starttls()
        server.login(EMAIL_REMITENTE, EMAIL_PASSWORD)
        server.send_message(msg)
