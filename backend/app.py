"""
app.py
Backend principal de FinCSDash
Registro de usuarios con verificación por correo (Gmail API)
Login tradicional y Login con Google
"""

# =========================
# IMPORTS
# =========================
from flask import Flask, request, jsonify
from flask_cors import CORS
import random

# Google Login
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# Base de datos
from database import conectar_db, crear_tablas

# Envío de correos (Gmail API)
from gmail_service import enviar_correo


# =========================
# CONFIGURACIÓN APP
# =========================
app = Flask(__name__)
CORS(app)

GOOGLE_CLIENT_ID = "741392813029-8iavkp2iqcntpb1m4d16h8t02c028naf.apps.googleusercontent.com"

# Crear tablas al iniciar el backend
crear_tablas()


# =========================
# REGISTRO DE USUARIO
# =========================
@app.route("/register", methods=["POST"])
def register():
    """
    Registra un usuario:
    - Genera código de verificación
    - Guarda usuario NO verificado
    - Envía código por correo
    """
    data = request.json
    email = data.get("email")
    password = data.get("password")

    codigo = str(random.randint(100000, 999999))

    try:
        conn = conectar_db()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO usuarios (email, password, codigo_verificacion, verificado)
            VALUES (?, ?, ?, 0)
        """, (email, password, codigo))

        conn.commit()
        conn.close()

        # Enviar correo con el código
        enviar_correo(
            destinatario=email,
            asunto="Código de verificación - FinCSDash",
            mensaje=f"Tu código de verificación es: {codigo}"
        )

        return jsonify({
            "message": "Usuario registrado. Revisa tu correo para verificar la cuenta."
        }), 201

    except Exception as e:
        return jsonify({
            "message": "Error al registrar usuario",
            "error": str(e)
        }), 400


# =========================
# VERIFICAR CÓDIGO
# =========================
@app.route("/verify", methods=["POST"])
def verify():
    """
    Verifica el código enviado por correo
    """
    data = request.json
    email = data.get("email")
    codigo = data.get("codigo")

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id FROM usuarios
        WHERE email = ? AND codigo_verificacion = ?
    """, (email, codigo))

    user = cursor.fetchone()

    if user:
        cursor.execute("""
            UPDATE usuarios
            SET verificado = 1
            WHERE email = ?
        """, (email,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Cuenta verificada correctamente"}), 200
    else:
        conn.close()
        return jsonify({"message": "Código incorrecto"}), 400


# =========================
# LOGIN TRADICIONAL
# =========================
@app.route("/login", methods=["POST"])
def login():
    """
    Permite login SOLO si la cuenta está verificada
    """
    data = request.json
    email = data.get("email")
    password = data.get("password")

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id FROM usuarios
        WHERE email = ? AND password = ? AND verificado = 1
    """, (email, password))

    user = cursor.fetchone()
    conn.close()

    if user:
        return jsonify({"message": "Login exitoso"}), 200
    else:
        return jsonify({"message": "Credenciales incorrectas o cuenta no verificada"}), 401


# =========================
# LOGIN CON GOOGLE
# =========================
@app.route("/google-login", methods=["POST"])
def google_login():
    data = request.json
    token = data.get("token")

    try:
        info = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )

        email = info["email"]

        conn = conectar_db()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
        user = cursor.fetchone()

        if not user:
            cursor.execute("""
                INSERT INTO usuarios (email, password, verificado)
                VALUES (?, ?, 1)
            """, (email, "google"))
            conn.commit()

        conn.close()

        return jsonify({
            "message": "Login con Google exitoso",
            "email": email
        }), 200

    except Exception as e:
        print("ERROR GOOGLE LOGIN:", e)
        return jsonify({"message": "Token inválido"}), 401


# =========================
# AGREGAR INGRESO
# =========================
@app.route("/add-income", methods=["POST"])
def add_income():
    data = request.json
    email = data.get("email")
    monto = data.get("monto")
    fecha = data.get("fecha")

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404

    usuario_id = user[0]

    cursor.execute("""
        INSERT INTO ingresos (usuario_id, monto, fecha)
        VALUES (?, ?, ?)
    """, (usuario_id, monto, fecha))

    conn.commit()
    conn.close()

    return jsonify({"message": "Ingreso agregado correctamente"}), 201


# =========================
# AGREGAR GASTO
# =========================
@app.route("/add-expense", methods=["POST"])
def add_expense():
    data = request.json
    email = data.get("email")
    tipo = data.get("tipo")
    monto = data.get("monto")
    fecha = data.get("fecha")

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404

    usuario_id = user[0]

    cursor.execute("""
        INSERT INTO gastos (usuario_id, tipo, monto, fecha)
        VALUES (?, ?, ?, ?)
    """, (usuario_id, tipo, monto, fecha))

    conn.commit()
    conn.close()

    return jsonify({"message": "Gasto agregado correctamente"}), 201


# =========================
# CONSULTAR BALANCE
# =========================
@app.route("/balance", methods=["POST"])
def balance():
    data = request.json
    email = data.get("email")

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404

    usuario_id = user[0]

    cursor.execute("SELECT SUM(monto) FROM ingresos WHERE usuario_id = ?", (usuario_id,))
    total_ingresos = cursor.fetchone()[0] or 0

    cursor.execute("SELECT SUM(monto) FROM gastos WHERE usuario_id = ?", (usuario_id,))
    total_gastos = cursor.fetchone()[0] or 0

    conn.close()

    return jsonify({
        "ingresos": total_ingresos,
        "gastos": total_gastos,
        "balance": total_ingresos - total_gastos
    }), 200


# =========================
# INICIO DEL SERVIDOR
# =========================
if __name__ == "__main__":
    app.run(debug=True)
