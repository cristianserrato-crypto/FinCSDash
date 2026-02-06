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
import random
import secrets
from datetime import datetime, timedelta, timezone
import calendar

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS, cross_origin
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity,
    verify_jwt_in_request
)
import psycopg2
from psycopg2.extras import RealDictCursor

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

import boto3
import base64
import io
from fpdf import FPDF

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
CORS(app, resources={
    r"/*": {
        "origins": ["https://fincsdash.online"],
        "allow_headers": ["Content-Type", "Authorization"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    }
})


# --- VARIABLES DE ENTORNO OBLIGATORIAS ---
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")



if not JWT_SECRET_KEY:
    raise Exception("JWT_SECRET_KEY no configurado")

if not GOOGLE_CLIENT_ID:
    raise Exception("GOOGLE_CLIENT_ID no configurado")

# --- JWT ---

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
    codigo = str(random.randint(100000, 999999))

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM usuarios WHERE email = %s", (email,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"message": "Usuario ya existe"}), 400

    cursor.execute("""
        INSERT INTO usuarios (email, password, verificado, codigo_verificacion)
        VALUES (%s, %s, 0, %s)
    """, (email, hashed, codigo))

    conn.commit()
    conn.close()

    # Enviar correo
    enviar_correo(email, "Verifica tu cuenta - FinCSDash", f"<h1>Tu código es: {codigo}</h1>")

    return jsonify({"message": "Usuario registrado. Revisa tu correo."}), 201
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

    # Verificar si está verificado (opcional, según tu lógica)
    # Si deseas bloquear login a no verificados, descomenta y ajusta la consulta SQL arriba para traer 'verificado'

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
# VERIFICACIÓN Y PASSWORD
# =========================
@app.route("/verify", methods=["POST"])
def verify_code():
    data = request.json
    email = data.get("email")
    codigo = data.get("codigo")
    
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT codigo_verificacion FROM usuarios WHERE email=%s", (email,))
    row = cursor.fetchone()
    
    if row and row[0] == codigo:
        cursor.execute("UPDATE usuarios SET verificado=1 WHERE email=%s", (email,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Cuenta verificada correctamente"}), 200
    
    conn.close()
    return jsonify({"message": "Código incorrecto"}), 400

@app.route("/resend-code", methods=["POST"])
def resend_code():
    data = request.json
    email = data.get("email")
    
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"message": "Email no registrado"}), 400
        
    codigo = str(random.randint(100000, 999999))
    cursor.execute("UPDATE usuarios SET codigo_verificacion=%s WHERE email=%s", (codigo, email))
    conn.commit()
    conn.close()
    
    enviar_correo(email, "Nuevo código de verificación", f"<h1>Tu nuevo código es: {codigo}</h1>")
    return jsonify({"message": "Código reenviado"}), 200

@app.route("/request-password-reset", methods=["POST"])
def request_password_reset():
    data = request.json
    email = data.get("email")
    
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email = %s", (email,))
    if not cursor.fetchone():
        conn.close()
        # Por seguridad, no indicamos si el correo existe o no, o devolvemos error genérico
        return jsonify({"message": "Si el correo existe, se envió el token."}), 200
    
    token = secrets.token_urlsafe(16)
    expires = (datetime.now() + timedelta(hours=1)).isoformat()
    
    cursor.execute("UPDATE usuarios SET reset_token=%s, reset_token_expires=%s WHERE email=%s", 
                   (token, expires, email))
    conn.commit()
    conn.close()
    
    enviar_correo(email, "Restablecer Contraseña", f"<h1>Tu token es: {token}</h1><p>Expira en 1 hora.</p>")
    return jsonify({"message": "Correo enviado con instrucciones."}), 200

@app.route("/reset-password-with-token", methods=["POST"])
def reset_password_with_token():
    data = request.json
    token = data.get("token")
    new_password = data.get("password")
    
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT email, reset_token_expires FROM usuarios WHERE reset_token = %s", (token,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return jsonify({"message": "Token inválido"}), 400
        
    email, expires_str = row
    if datetime.fromisoformat(expires_str) < datetime.now():
        conn.close()
        return jsonify({"message": "Token expirado"}), 400
        
    hashed = generate_password_hash(new_password)
    cursor.execute("UPDATE usuarios SET password=%s, reset_token=NULL, reset_token_expires=NULL WHERE email=%s", 
                   (hashed, email))
    conn.commit()
    conn.close()
    
    return jsonify({"message": "Contraseña actualizada correctamente"}), 200

# =========================
# PERFIL
# =========================
@app.route("/get-profile", methods=["GET"])
@jwt_required()
def get_profile():
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

@app.route("/update-profile", methods=["PUT"])
@jwt_required()
def update_profile():
    email = get_jwt_identity()
    data = request.json
    nombre = data.get("nombre")
    password = data.get("password")
    
    conn = conectar_db()
    cursor = conn.cursor()
    
    if nombre:
        cursor.execute("UPDATE usuarios SET nombre=%s WHERE email=%s", (nombre, email))
    
    if password:
        hashed = generate_password_hash(password)
        cursor.execute("UPDATE usuarios SET password=%s WHERE email=%s", (hashed, email))
        
    conn.commit()
    conn.close()
    return jsonify({"message": "Perfil actualizado"}), 200

@app.route("/delete-photo", methods=["DELETE"])
@jwt_required()
def delete_photo():
    email = get_jwt_identity()
    conn = conectar_db()
    conn.cursor().execute("UPDATE usuarios SET foto_perfil=NULL WHERE email=%s", (email,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Foto eliminada"}), 200

# =========================
# BALANCE
# =========================
@app.route("/balance", methods=["GET"])
@jwt_required()
def balance():
    email = get_jwt_identity()

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM usuarios WHERE email = %s", (email,))
    user_id = cursor.fetchone()[0]

    cursor.execute("SELECT COALESCE(SUM(monto),0) FROM ingresos WHERE usuario_id = %s", (user_id,))
    ingresos = cursor.fetchone()[0]

    cursor.execute("SELECT COALESCE(SUM(monto),0) FROM gastos WHERE usuario_id = %s", (user_id,))
    gastos = cursor.fetchone()[0]

    conn.close()

    return jsonify({
        "ingresos": ingresos,
        "gastos": gastos,
        "balance": ingresos - gastos
    }), 200

# =========================
# FOTO PERFIL (S3)
# =========================
@app.route("/update-photo", methods=["POST"])
@jwt_required()
def update_photo():
    email = get_jwt_identity()
    foto_base64 = request.json.get("foto")

    if not foto_base64:
        return jsonify({"message": "Imagen requerida"}), 400

    s3 = boto3.client("s3")
    bucket = os.environ.get("AWS_BUCKET_NAME")
    region = os.environ.get("AWS_REGION")

    if not bucket or not region:
        return jsonify({"message": "S3 no configurado"}), 500

    image_bytes = base64.b64decode(foto_base64)
    key = f"profiles/{uuid.uuid4()}.png"
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=image_bytes,
        ContentType="image/png",
        ACL="public-read"
    )

    url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"

    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE usuarios SET foto_perfil = %s WHERE email = %s", (url, email))
    conn.commit()
    conn.close()

    return jsonify({"foto": url}), 200

# =========================
# BOT
# =========================
@app.route("/run-bot", methods=["GET"])
@jwt_required()
def run_bot():
    return jsonify(obtener_frase_motivacional()), 200

# =========================
# CATEGORÍAS
# =========================
@app.route("/categories", methods=["GET"])
@jwt_required()
def get_categories():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    
    # Obtener ID usuario
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    user_id = cursor.fetchone()[0]
    
    # Categorías globales (0) + del usuario
    cursor.execute("SELECT nombre FROM categorias WHERE usuario_id=0 OR usuario_id=%s", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    return jsonify([r[0] for r in rows]), 200

@app.route("/add-category", methods=["POST"])
@jwt_required()
def add_category():
    email = get_jwt_identity()
    nombre = request.json.get("nombre")
    
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    user_id = cursor.fetchone()[0]
    
    try:
        cursor.execute("INSERT INTO categorias (usuario_id, nombre) VALUES (%s, %s)", (user_id, nombre))
        conn.commit()
        msg = "Categoría agregada"
    except:
        msg = "La categoría ya existe"
        
    conn.close()
    return jsonify({"message": msg}), 200

# =========================
# MOVIMIENTOS (Ingresos/Gastos)
# =========================
@app.route("/movements", methods=["GET"])
@jwt_required()
def get_movements():
    email = get_jwt_identity()
    month = request.args.get("month")
    year = request.args.get("year")
    
    conn = conectar_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    user_id = cursor.fetchone()[0]
    
    query_ingresos = "SELECT id, monto, fecha, categoria, 'Ingreso' as tipo, 0 as es_recurrente FROM ingresos WHERE usuario_id=%s"
    query_gastos = "SELECT id, monto, fecha, tipo as categoria, 'Gasto' as tipo, es_recurrente FROM gastos WHERE usuario_id=%s"
    params = [user_id]
    
    if month and year:
        date_filter = f"{year}-{month}-%"
        query_ingresos += " AND fecha LIKE %s"
        query_gastos += " AND fecha LIKE %s"
        params.append(date_filter)
        
    # Unir consultas
    full_query = f"{query_ingresos} UNION ALL {query_gastos} ORDER BY fecha DESC"
    
    # Duplicar params porque se usan en ambas partes del UNION
    cursor.execute(full_query, params * 2)
    data = cursor.fetchall()
    conn.close()
    
    return jsonify(data), 200

@app.route("/add-income", methods=["POST"])
@jwt_required()
def add_income():
    email = get_jwt_identity()
    data = request.json
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    user_id = cursor.fetchone()[0]
    
    cursor.execute("INSERT INTO ingresos (usuario_id, monto, fecha, categoria) VALUES (%s, %s, %s, %s)",
                   (user_id, data['monto'], data['fecha'], data.get('categoria', 'Ingreso')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Ingreso agregado"}), 200

@app.route("/add-expense", methods=["POST"])
@jwt_required()
def add_expense():
    email = get_jwt_identity()
    data = request.json
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    user_id = cursor.fetchone()[0]
    
    recurrente = 1 if data.get('es_recurrente') else 0
    cursor.execute("INSERT INTO gastos (usuario_id, tipo, monto, fecha, es_recurrente) VALUES (%s, %s, %s, %s, %s)",
                   (user_id, data['tipo'], data['monto'], data['fecha'], recurrente))
    conn.commit()
    conn.close()
    return jsonify({"message": "Gasto agregado"}), 200

@app.route("/delete-income/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_income(id):
    conn = conectar_db()
    conn.cursor().execute("DELETE FROM ingresos WHERE id=%s", (id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Ingreso eliminado"}), 200

@app.route("/delete-expense/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_expense(id):
    conn = conectar_db()
    conn.cursor().execute("DELETE FROM gastos WHERE id=%s", (id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Gasto eliminado"}), 200

# =========================
# ESTADO DE PAGOS (Recurrentes)
# =========================
@app.route("/payment-status", methods=["GET"])
@jwt_required()
def payment_status():
    email = get_jwt_identity()
    month = request.args.get("month")
    year = request.args.get("year")
    
    if not month or not year:
        now = datetime.now()
        month = str(now.month).zfill(2)
        year = str(now.year)
        
    conn = conectar_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT id, ingreso_mensual FROM usuarios WHERE email=%s", (email,))
    user_row = cursor.fetchone()
    user_id = user_row['id']
    ingreso_base = user_row['ingreso_mensual'] or 0
    
    # Obtener gastos recurrentes configurados
    cursor.execute("SELECT id, categoria, monto as monto_esperado, dia_limite FROM gastos_recurrentes WHERE usuario_id=%s", (user_id,))
    recurrentes = cursor.fetchall()
    
    # Obtener gastos reales hechos este mes que sean marcados como recurrentes
    date_filter = f"{year}-{month}-%"
    cursor.execute("SELECT tipo, monto FROM gastos WHERE usuario_id=%s AND es_recurrente=1 AND fecha LIKE %s", (user_id, date_filter))
    pagos_hechos = cursor.fetchall()
    
    # Calcular total gastos del mes (todos)
    cursor.execute("SELECT COALESCE(SUM(monto),0) FROM gastos WHERE usuario_id=%s AND fecha LIKE %s", (user_id, date_filter))
    total_gastos = cursor.fetchone()['coalesce']
    
    # Verificar ingreso principal
    cursor.execute("SELECT id FROM ingresos WHERE usuario_id=%s AND fecha LIKE %s AND categoria='Salario'", (user_id, date_filter))
    income_confirmed = bool(cursor.fetchone())
    
    conn.close()
    
    # Cruzar información
    resultado_pagos = []
    for rec in recurrentes:
        pagado = False
        # Buscar si existe un gasto con la misma categoría (tipo)
        for hecho in pagos_hechos:
            if hecho['tipo'] == rec['categoria']:
                pagado = True
                break
        
        rec['pagado'] = pagado
        resultado_pagos.append(rec)
        
    return jsonify({
        "ingreso_base": ingreso_base,
        "total_gastos_mes": total_gastos,
        "income_confirmed_this_month": income_confirmed,
        "pagos": resultado_pagos
    }), 200

@app.route("/add-recurring-expense", methods=["POST"])
@jwt_required()
def add_recurring():
    email = get_jwt_identity()
    data = request.json
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    user_id = cursor.fetchone()[0]
    
    cursor.execute("INSERT INTO gastos_recurrentes (usuario_id, categoria, monto, dia_limite) VALUES (%s, %s, %s, %s)",
                   (user_id, data['categoria'], data['monto'], data['dia']))
    conn.commit()
    conn.close()
    return jsonify({"message": "Gasto recurrente configurado"}), 200

@app.route("/edit-recurring-expense/<int:id>", methods=["PUT"])
@jwt_required()
def edit_recurring(id):
    data = request.json
    conn = conectar_db()
    conn.cursor().execute("UPDATE gastos_recurrentes SET monto=%s, dia_limite=%s WHERE id=%s", (data['monto'], data['dia'], id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Actualizado"}), 200

@app.route("/delete-recurring-expense/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_recurring(id):
    conn = conectar_db()
    conn.cursor().execute("DELETE FROM gastos_recurrentes WHERE id=%s", (id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Eliminado"}), 200

@app.route("/confirm-main-income", methods=["POST"])
@jwt_required()
def confirm_income():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, ingreso_mensual FROM usuarios WHERE email=%s", (email,))
    row = cursor.fetchone()
    user_id = row[0]
    monto = row[1]
    
    today = datetime.now().strftime("%Y-%m-%d")
    cursor.execute("INSERT INTO ingresos (usuario_id, monto, fecha, categoria) VALUES (%s, %s, %s, 'Salario')",
                   (user_id, monto, today))
    conn.commit()
    conn.close()
    return jsonify({"message": "Ingreso registrado"}), 200

# =========================
# METAS DE AHORRO
# =========================
@app.route("/savings-goals", methods=["GET"])
@jwt_required()
def get_savings():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    user_id = cursor.fetchone()['id']
    
    cursor.execute("SELECT id, nombre, monto_objetivo as objetivo, monto_actual as actual, fecha_limite as fecha, moneda FROM metas_ahorro WHERE usuario_id=%s", (user_id,))
    data = cursor.fetchall()
    conn.close()
    return jsonify(data), 200

@app.route("/add-savings-goal", methods=["POST"])
@jwt_required()
def add_saving():
    email = get_jwt_identity()
    data = request.json
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    user_id = cursor.fetchone()[0]
    
    cursor.execute("INSERT INTO metas_ahorro (usuario_id, nombre, monto_objetivo, fecha_limite, moneda) VALUES (%s, %s, %s, %s, %s)",
                   (user_id, data['nombre'], data['objetivo'], data['fecha'], data.get('moneda', 'COP')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Meta creada"}), 200

@app.route("/update-savings-goal/<int:id>", methods=["PUT"])
@jwt_required()
def update_saving(id):
    email = get_jwt_identity()
    data = request.json
    conn = conectar_db()
    cursor = conn.cursor()
    
    # Actualizar monto
    cursor.execute("UPDATE metas_ahorro SET monto_actual=%s WHERE id=%s", (data['monto_actual'], id))
    
    # Si se pide crear gasto (descontar del saldo)
    if data.get('crear_gasto') and data.get('monto_agregado'):
        cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
        user_id = cursor.fetchone()[0]
        today = datetime.now().strftime("%Y-%m-%d")
        cursor.execute("INSERT INTO gastos (usuario_id, tipo, monto, fecha, es_recurrente) VALUES (%s, 'Ahorro', %s, %s, 0)",
                       (user_id, data['monto_agregado'], today))
        
    conn.commit()
    conn.close()
    return jsonify({"message": "Ahorro actualizado"}), 200

@app.route("/delete-savings-goal/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_saving(id):
    conn = conectar_db()
    conn.cursor().execute("DELETE FROM metas_ahorro WHERE id=%s", (id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Meta eliminada"}), 200

# =========================
# CHAT
# =========================
@app.route("/chat", methods=["POST"])
@jwt_required()
def chat():
    msg = request.json.get("message", "").lower()
    
    # Lógica simple de respuestas (puedes expandir esto con IA real si quieres)
    response = "No entendí eso. Intenta 'Saldo', 'Mayor gasto' o 'Frase'."
    options = []
    
    if "saldo" in msg:
        return balance() # Reutiliza la función de balance
        
    if "frase" in msg:
        return run_bot()
        
    return jsonify({"response": response, "options": options}), 200

# =========================
# START
# =========================


@app.route("/check-initial-profile", methods=["GET", "OPTIONS"])
def check_initial_profile():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    verify_jwt_in_request()
    email = get_jwt_identity()

    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT nombre FROM usuarios WHERE email = %s", (email,))
    row = cursor.fetchone()
    conn.close()

    # Si tiene nombre, NO necesita perfil info.
    has_profile = bool(row and row[0])
    return jsonify({"needs_profile_info": not has_profile}), 200

@app.route("/save-initial-profile", methods=["POST", "OPTIONS"])
def save_initial_profile():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    verify_jwt_in_request()
    email = get_jwt_identity()
    data = request.json
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE usuarios SET nombre=%s, apellidos=%s, edad=%s WHERE email=%s", 
                   (data.get("nombre"), data.get("apellidos"), data.get("edad"), email))
    conn.commit()
    conn.close()
    return jsonify({"message": "Perfil guardado"}), 200

@app.route("/check-onboarding", methods=["GET", "OPTIONS"])
def check_onboarding():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    verify_jwt_in_request()
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT ingreso_mensual FROM usuarios WHERE email = %s", (email,))
    row = cursor.fetchone()
    conn.close()
    
    # Si ingreso_mensual es NULL o 0, necesita onboarding
    needs = not (row and row[0] and row[0] > 0)
    return jsonify({"needs_onboarding": needs}), 200

@app.route("/save-onboarding", methods=["POST", "OPTIONS"])
def save_onboarding():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    verify_jwt_in_request()

    email = get_jwt_identity()
    data = request.json
    
    ingreso = data.get("ingreso_mensual")
    dia_pago = data.get("dia_pago")
    gastos = data.get("gastos_fijos", [])
    
    conn = conectar_db()
    cursor = conn.cursor()
    
    # Actualizar datos financieros del usuario
    cursor.execute("""
        UPDATE usuarios 
        SET ingreso_mensual = %s, dia_pago = %s 
        WHERE email = %s
    """, (ingreso, dia_pago, email))
    
    # Obtener ID para insertar gastos
    cursor.execute("SELECT id FROM usuarios WHERE email = %s", (email,))
    user_id = cursor.fetchone()[0]
    
    # Insertar gastos recurrentes
    for g in gastos:
        cursor.execute("""
            INSERT INTO gastos_recurrentes (usuario_id, categoria, monto, dia_limite)
            VALUES (%s, %s, %s, %s)
        """, (user_id, g['categoria'], g['monto'], g['dia']))
        
    conn.commit()
    conn.close()
    
    return jsonify({"message": "Onboarding completado"}), 200




@app.route("/health")
def health():
    return "ok", 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
