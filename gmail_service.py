import base64
from email.mime.text import MIMEText
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
import os
import pickle

# Permiso para enviar correos
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

def obtener_servicio_gmail():
    creds = None

    # Si ya existe token, lo reutilizamos
    if os.path.exists("token.pickle"):
        with open("token.pickle", "rb") as token:
            creds = pickle.load(token)

    # Si no hay credenciales válidas, pedimos autorización
    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(
            "credentials.json",
            SCOPES
        )

        # 🔐 MÉTODO COMPATIBLE CON TU VERSIÓN
        creds = flow.run_local_server(
            port=0,
            open_browser=True
        )

        # Guardamos el token para no volver a pedir permisos
        with open("token.pickle", "wb") as token:
            pickle.dump(creds, token)

    service = build("gmail", "v1", credentials=creds)
    return service


def enviar_correo(destinatario, asunto, mensaje):
    service = obtener_servicio_gmail()

    msg = MIMEText(mensaje)
    msg["to"] = destinatario
    msg["subject"] = asunto

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()

    service.users().messages().send(
        userId="me",
        body={"raw": raw}
    ).execute()
