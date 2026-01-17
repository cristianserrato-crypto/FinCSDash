"""
app.py
Backend principal de FinCSDash
Registro de usuarios con verificación por correo (Gmail API)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import random

# Base de datos
from database import conectar_db, crear_tablas

# Envío de correos con Gmail API
from gmail_service import enviar_correo

# =========================
# CONFIGURACIÓN APP
# =========================

app = Flask(__name__)
CORS(app)

# Crear tablas al iniciar
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

    # Generar código de 6 dígitos
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
# LOGIN
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
# INICIO SERVIDOR
# =========================

if __name__ == "__main__":
    app.run(debug=True)
