"""
app.py
Backend principal de FinCSDash
- Registro con verificación por correo
- Login tradicional
- Login con Google (OAuth clásico con redirección)
"""

from flask import Flask, request, jsonify, redirect, session
from flask_cors import CORS
import random
import os

from google_auth_oauthlib.flow import Flow
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# Base de datos
from database import conectar_db, crear_tablas

# Envío de correos
from gmail_service import enviar_correo

# =========================
# CONFIGURACIÓN APP
# =========================

app = Flask(__name__)
app.secret_key = "fincsdash_secret_key"
CORS(app, supports_credentials=True)

GOOGLE_CLIENT_ID = "741392813029-8iavkp2iqcntpb1m4d16h8t02c028naf.apps.googleusercontent.com"

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

crear_tablas()

# =========================
# REGISTRO
# =========================

@app.route("/register", methods=["POST"])
def register():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    codigo = str
