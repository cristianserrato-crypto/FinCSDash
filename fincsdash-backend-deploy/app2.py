"""
app.py
Backend principal de FinCSDash
PostgreSQL + JWT + Google Login
Listo para AWS (EC2 / App Runner)
"""

# =========================
# IMPORTS
# =========================
import os
import re
import uuid
import base64
from datetime import datetime, timedelta, timezone

from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from werkzeug.security import generate_password_hash, check_password_hash

from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity
)

import psycopg2
from psycopg2.extras import RealDictCursor

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

import boto3

# =========================
# IMPORTS INTERNOS
# =========================
from database import conectar_db, crear_tablas
from gmail_service import enviar_correo
from bot import obtener_frase_motivacional

# =========================
# CONFIGURACIÓN APP
# =========================
app = Flask(__name__)

# CORS global para todo el backend
CORS(
    app,
    origins=["https://fincsdash.online"],
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"]
)

# =========================
# VARIABLES DE ENTORNO
# =========================
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")

if not JWT_SECRET_KEY:
    raise Exception("JWT_SECRET_KEY no configurado")

if not GOOGLE_CLIENT_ID:
    raise Exception("GOOGLE_CLIENT_ID no configurado")

# =========================
# JWT
# =========================
app.config["JWT_SECRET_KEY"] = JWT_SECRET_KEY
jwt = JWTManager(app)

# =========================
# CREAR TABLAS
# =========================
crear_tablas()

# =========================
# RUTA PRINCIPAL
# =========================
@app.route("/")
def index():
    return jsonify({"status": "FinCSDash API running"}), 200

# =========================
# REGISTRO
# =========================
@app.route("/register", methods=["POST"])
def register():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"message": "Email y contraseña requeridos"}), 400

    if not (
        8 <= len(password) <= 16
        and re.search("[a-z]", password)
        and re.search("[A-Z]", password)
        and re.search("[0-9]", password)
        and re.search("[^a-zA-Z0-9]", password)
    ):
        return jsonify({"message": "Contraseña insegura"}), 400

    hashed = generate_password_hash(password)

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM usuarios WHERE email = %s", (email,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"message": "Usuario ya existe"}), 400

    cursor.execute("""
        INSERT INTO usuarios (email, password, verificado)
        VALUES (%s, %s, 1)
    """, (email, hashed))

    conn.commit()
    conn.close()

    return jsonify({"message": "Usuario registrado"}), 201

# =========================
# LOGIN
# =========================
@app.route("/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT password FROM usuarios WHERE email = %s", (email,))
    row = cursor.fetchone()
    conn.close()

    if not row or not check_password_hash(row[0], password):
        return jsonify({"message": "Credenciales incorrectas"}), 401

    token = create_access_token(identity=email)
    return jsonify({"token": token}), 200

# =========================
# GOOGLE LOGIN
# =========================
@app.route("/google-login", methods=["POST"])
def google_login():
    token = request.json.get("token")

    try:
        info = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )

        email = info["email"]

        conn = conectar_db()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM usuarios WHERE email = %s", (email,))
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO usuarios (email, password, verificado)
                VALUES (%s, %s, 1)
            """, (email, str(uuid.uuid4())))
            conn.commit()

        conn.close()

        jwt_token = create_access_token(identity=email)
        return jsonify({"token": jwt_token}), 200

    except Exception:
        return jsonify({"message": "Token Google inválido"}), 401

# =========================
# PERFIL
# =========================
@app.route("/profile", methods=["GET"])
@jwt_required()
def profile():
    email = get_jwt_identity()

    conn = conectar_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    cursor.execute("""
        SELECT email, nombre, apellidos, edad, foto_perfil
        FROM usuarios WHERE email = %s
    """, (email,))

    data = cursor.fetchone()
    conn.close()

    return jsonify(data), 200

# =========================
# CHECK INITIAL PROFILE (FIX CORS)
# =========================
@app.route("/check-initial-profile", methods=["GET", "OPTIONS"])
@cross_origin(origins=["https://fincsdash.online"], supports_credentials=True)
@jwt_required()
def check_initial_profile():
    email = get_jwt_identity()

    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT nombre FROM usuarios WHERE email = %s", (email,))
    row = cursor.fetchone()
    conn.close()

    return jsonify({"hasProfile": bool(row and row[0])}), 200

# =========================
# HEALTH
# =========================
@app.route("/health")
def health():
    return "ok", 200
