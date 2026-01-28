import smtplib
import ssl
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def enviar_correo(destinatario, asunto, cuerpo):
    """
    Envía un correo electrónico real usando el servidor SMTP de Gmail.
    Requiere configurar las variables de entorno MAIL_USERNAME y MAIL_PASSWORD.
    """
    # 1. Obtener credenciales de las variables de entorno
    remitente = os.environ.get("fincsdash@gmail.com")
    password = os.environ.get("199507130202Cr*")

    if not remitente or not password:
        print("⚠️ Error: No se han configurado las credenciales de correo (MAIL_USERNAME, MAIL_PASSWORD).")
        return False

    # 2. Crear el mensaje
    mensaje = MIMEMultipart("alternative")
    mensaje["Subject"] = asunto
    mensaje["From"] = remitente
    mensaje["To"] = destinatario

    # El cuerpo se asume que es HTML (según app.py)
    mensaje.attach(MIMEText(cuerpo, "html"))

    # 3. Enviar usando SMTP_SSL de Gmail
    try:
        contexto = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=contexto) as server:
            server.login(remitente, password)
            server.send_message(mensaje)
        print(f"✅ Correo enviado a {destinatario}")
        return True
    except Exception as e:
        print(f"❌ Error enviando correo: {e}")
        return False