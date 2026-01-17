"""
FinCSDash - Prueba controlada de envío de correo con Gmail API

OBJETIVO:
- Verificar que Python puede enviar correos usando Gmail API
- NO usamos todavía registro, login ni base de datos
"""

# =========================
# IMPORTACIONES
# =========================

# Flask solo para mantener la estructura del proyecto
from flask import Flask

# Importamos la función que envía correos usando Gmail API
from gmail_service import enviar_correo


# =========================
# CREAR APP FLASK
# =========================

# Creamos la aplicación Flask
app = Flask(__name__)


# =========================
# PRUEBA CONTROLADA GMAIL API
# =========================

def prueba_envio_correo():
    """
    Envía un correo de prueba a la cuenta FinCSDash.
    Si esto funciona, Gmail API está correctamente configurada.
    """

    enviar_correo(
        destinatario="fincsdash@gmail.com",
        asunto="Prueba Gmail API - FinCSDash",
        mensaje="Si ves este correo, la integración con Gmail API funciona correctamente."
    )


# =========================
# PUNTO DE ENTRADA
# =========================

if __name__ == "__main__":
    # Ejecutamos la prueba SOLO UNA VEZ al iniciar
    prueba_envio_correo()

    # Iniciamos el servidor Flask (aunque no tenga rutas aún)
    app.run(debug=True)

