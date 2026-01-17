"""
Prueba aislada de Gmail API - FinCSDash
Este archivo NO usa Flask.
"""

from gmail_service import enviar_correo

print("Iniciando prueba Gmail API...")

enviar_correo(
    destinatario="fincsdash@gmail.com",
    asunto="Prueba Gmail API - FinCSDash",
    mensaje="Si ves este correo, Gmail API funciona correctamente."
)

print("Correo enviado. Si no llegó, revisa permisos.")
