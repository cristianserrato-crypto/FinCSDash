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
import logging
import time
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
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import psycopg2
from psycopg2.extras import RealDictCursor
from sqlalchemy.exc import OperationalError as SQLAlchemyOperationalError

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

import boto3
import base64
import io
from fpdf import FPDF

# =========================
# IMPORTS INTERNOS
# =========================
from database import db, conectar_db, crear_tablas, Usuario, Ingreso, Gasto, Categoria, GastoRecurrente, MetaAhorro
from gmail_service import enviar_correo
from bot import obtener_frase_motivacional
import llm_assistant

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

# =========================
# CONFIGURACIÓN APP
# =========================
app = Flask(__name__)

# Origenes permitidos para CORS. En producción se debe definir CORS_ORIGINS
# con la(s) URL(s) reales del frontend (separadas por coma); "*" solo se usa
# como valor por defecto para no romper entornos de desarrollo.
_cors_origins_env = os.environ.get("CORS_ORIGINS", "*")
CORS_ORIGINS = [o.strip() for o in _cors_origins_env.split(",") if o.strip()] or ["*"]

CORS(app, resources={
    r"/*": {
        "origins": CORS_ORIGINS,
        "allow_headers": ["Content-Type", "Authorization"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    }
})

# Límite de tamaño de petición (bytes) para evitar agotar memoria con payloads
# gigantes (p.ej. imágenes base64 o JSON masivo). 5 MB por defecto.
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_CONTENT_LENGTH_BYTES", 5 * 1024 * 1024))

# --- RATE LIMITING (mitigación de fuerza bruta y DoS) ---
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=[os.environ.get("RATE_LIMIT_DEFAULT", "200 per hour")],
    storage_uri=os.environ.get("RATE_LIMIT_STORAGE_URI", "memory://"),
)


@app.after_request
def set_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.is_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.errorhandler(429)
def handle_rate_limit(error):
    return jsonify({
        "message": "Demasiadas solicitudes. Intenta de nuevo más tarde.",
        "recoverable": True
    }), 429

# --- CONFIGURACIÓN DE BASE DE DATOS (URI) ---
DB_USER = os.environ.get("DB_USER")
DB_PASS = os.environ.get("DB_PASSWORD")
DB_HOST = os.environ.get("DB_HOST")
DB_NAME = os.environ.get("DB_NAME")
DB_PORT = os.environ.get("DB_PORT", "5432")
DB_SSLMODE = os.environ.get("DB_SSLMODE", "prefer")

app.config["SQLALCHEMY_DATABASE_URI"] = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode={DB_SSLMODE}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_pre_ping": True,
    "pool_recycle": int(os.environ.get("DB_POOL_RECYCLE_SECONDS", "300")),
    "pool_timeout": int(os.environ.get("DB_POOL_TIMEOUT_SECONDS", "10")),
    "pool_size": int(os.environ.get("DB_POOL_SIZE", "5")),
    "max_overflow": int(os.environ.get("DB_MAX_OVERFLOW", "10")),
    "connect_args": {
        "connect_timeout": int(os.environ.get("DB_CONNECT_TIMEOUT", "5")),
        "application_name": os.environ.get("DB_APPLICATION_NAME", "fincsdash"),
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    },
}
db.init_app(app)

# --- VARIABLES DE ENTORNO OBLIGATORIAS ---
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")



if not JWT_SECRET_KEY:
    raise Exception("JWT_SECRET_KEY no configurado")

if not GOOGLE_CLIENT_ID:
    raise Exception("GOOGLE_CLIENT_ID no configurado")

# --- JWT ---
# Sesiones de corta duración: por defecto 1 hora, configurable por entorno.
# Evita que un token robado/filtrado quede válido indefinidamente.
app.config["JWT_SECRET_KEY"] = JWT_SECRET_KEY
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
    minutes=int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "60"))
)
jwt = JWTManager(app)


# Hash "señuelo" usado para comparar contraseñas cuando el usuario no existe,
# de forma que el tiempo de respuesta de /login no revele si un email está
# registrado (mitiga enumeración de usuarios por timing).
_DUMMY_PASSWORD_HASH = generate_password_hash(secrets.token_hex(32))

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

LOGIN_MAX_ATTEMPTS = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_LOCKOUT_MINUTES = int(os.environ.get("LOGIN_LOCKOUT_MINUTES", "15"))


def db_unavailable_response(error):
    logger.warning("Base de datos temporalmente no disponible: %s", error)
    db.session.rollback()
    return jsonify({
        "message": "El servidor se esta reconectando. Intenta de nuevo en unos segundos.",
        "recoverable": True
    }), 503


@app.errorhandler(psycopg2.OperationalError)
def handle_psycopg_operational_error(error):
    return db_unavailable_response(error)


@app.errorhandler(SQLAlchemyOperationalError)
def handle_sqlalchemy_operational_error(error):
    return db_unavailable_response(error)


@app.teardown_appcontext
def cleanup_db_session(error=None):
    if error:
        db.session.rollback()
    db.session.remove()

# =========================
# CREAR TABLAS
# =========================
def crear_tablas_con_reintentos(app, intentos=None, espera=None):
    intentos = int(os.environ.get("DB_INIT_MAX_RETRIES", intentos or 12))
    espera = float(os.environ.get("DB_INIT_RETRY_DELAY_SECONDS", espera or 5))

    for intento in range(1, intentos + 1):
        try:
            crear_tablas(app)
            return
        except Exception:
            if intento >= intentos:
                logger.exception("No fue posible inicializar la base de datos")
                raise

            logger.warning(
                "Base de datos no disponible al iniciar; reintentando en %.1fs (%s/%s)",
                espera,
                intento,
                intentos,
            )
            time.sleep(espera)


crear_tablas_con_reintentos(app)

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
@limiter.limit("5 per minute")
def register():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"message": "Email y contraseña requeridos"}), 400

    if not EMAIL_REGEX.match(email) or len(email) > 120:
        return jsonify({"message": "Email inválido"}), 400

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

    if Usuario.query.filter_by(email=email).first():
        return jsonify({"message": "Usuario ya existe"}), 400

    nuevo_usuario = Usuario(email=email, password=hashed, verificado=0, codigo_verificacion=codigo)
    db.session.add(nuevo_usuario)
    db.session.commit()

    # Enviar correo
    try:
        enviar_correo(email, "Verifica tu cuenta - FinCSDash", f"<h1>Tu código es: {codigo}</h1>")
    except Exception:
        logger.exception("No se pudo enviar el correo de verificacion a %s", email)

    return jsonify({"message": "Usuario registrado correctamente. Revisa tu correo."}), 201
# =========================
# LOGIN
# =========================
@app.route("/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"message": "Email y contraseña requeridos"}), 400

    user = Usuario.query.filter_by(email=email).first()
    now = datetime.now(timezone.utc)

    # Cuenta bloqueada temporalmente por demasiados intentos fallidos
    if user and user.locked_until:
        locked_until = user.locked_until
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until > now:
            return jsonify({
                "message": "Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intenta más tarde."
            }), 423

    # Siempre se ejecuta un check_password_hash (contra un hash señuelo si el
    # usuario no existe) para que el tiempo de respuesta no permita enumerar
    # emails registrados.
    password_hash = user.password if user else _DUMMY_PASSWORD_HASH
    password_ok = check_password_hash(password_hash, password)

    if not user or not password_ok:
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= LOGIN_MAX_ATTEMPTS:
                user.locked_until = now + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
            db.session.commit()
        return jsonify({"message": "Credenciales incorrectas"}), 401

    user.failed_login_attempts = 0
    user.locked_until = None
    db.session.commit()

    token = create_access_token(identity=email)
    return jsonify({"token": token}), 200

# =========================
# GOOGLE LOGIN
# =========================
@app.route("/google-login", methods=["POST"])
@limiter.limit("10 per minute")
def google_login():
    token = request.json.get("token")

    try:
        info = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )

        email = info["email"]

        user = Usuario.query.filter_by(email=email).first()
        if not user:
            user = Usuario(email=email, password=str(uuid.uuid4()), verificado=1)
            db.session.add(user)
            db.session.commit()

        jwt_token = create_access_token(identity=email)
        return jsonify({"token": jwt_token, "email": email, "message": "Login exitoso"}), 200

    except Exception:
        return jsonify({"message": "Token Google inválido"}), 401

# =========================
# VERIFICACIÓN Y PASSWORD
# =========================
@app.route("/verify", methods=["POST"])
@limiter.limit("10 per minute")
def verify_code():
    data = request.json
    email = data.get("email")
    codigo = data.get("codigo")
    
    user = Usuario.query.filter_by(email=email).first()
    
    if user and user.codigo_verificacion == codigo:
        user.verificado = 1
        db.session.commit()
        return jsonify({"message": "Cuenta verificada correctamente"}), 200
    
    return jsonify({"message": "Código incorrecto"}), 400

@app.route("/resend-code", methods=["POST"])
@limiter.limit("3 per minute")
def resend_code():
    data = request.json
    email = data.get("email")
    
    user = Usuario.query.filter_by(email=email).first()
    if not user:
        return jsonify({"message": "Email no registrado"}), 400
        
    codigo = str(random.randint(100000, 999999))
    user.codigo_verificacion = codigo
    db.session.commit()
    
    enviar_correo(email, "Nuevo código de verificación", f"<h1>Tu nuevo código es: {codigo}</h1>")
    return jsonify({"message": "Código reenviado"}), 200

@app.route("/request-password-reset", methods=["POST"])
@limiter.limit("3 per minute")
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
@limiter.limit("10 per minute")
def reset_password_with_token():
    data = request.json or {}
    token = data.get("token")
    new_password = data.get("password") or ""

    if not token or not (
        8 <= len(new_password) <= 16
        and re.search("[a-z]", new_password)
        and re.search("[A-Z]", new_password)
        and re.search("[0-9]", new_password)
        and re.search("[^a-zA-Z0-9]", new_password)
    ):
        return jsonify({"message": "Contraseña insegura"}), 400

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
    cursor.execute(
        "UPDATE usuarios SET password=%s, reset_token=NULL, reset_token_expires=NULL, "
        "failed_login_attempts=0, locked_until=NULL WHERE email=%s",
        (hashed, email)
    )
    conn.commit()
    conn.close()

    return jsonify({"message": "Contraseña actualizada correctamente"}), 200

# =========================
# PERFIL
# =========================
@app.route("/get-profile", methods=["GET", "OPTIONS"])
@cross_origin()
@jwt_required(optional=True)
def get_profile():
    if request.method == "OPTIONS":
        return "", 200

    email = get_jwt_identity()
    if not email:
        return jsonify({"message": "Token requerido"}), 401

    user = Usuario.query.filter_by(email=email).first()
    if not user:
        return jsonify({"message": "Usuario no encontrado"}), 404

    return jsonify({
        "email": user.email,
        "nombre": user.nombre,
        "apellidos": user.apellidos,
        "edad": user.edad,
        "foto_perfil": user.foto_perfil
    }), 200

@app.route("/update-profile", methods=["PUT"])
@jwt_required()
def update_profile():
    email = get_jwt_identity()
    data = request.json
    nombre = data.get("nombre")
    password = data.get("password")

    user = Usuario.query.filter_by(email=email).first()
    if nombre:
        user.nombre = nombre
    if password:
        user.password = generate_password_hash(password)

    db.session.commit()
    return jsonify({"message": "Perfil actualizado"}), 200

@app.route("/delete-photo", methods=["DELETE"])
@jwt_required()
def delete_photo():
    email = get_jwt_identity()
    user = Usuario.query.filter_by(email=email).first()
    user.foto_perfil = None
    db.session.commit()
    return jsonify({"message": "Foto eliminada"}), 200

# =========================
# BALANCE
# =========================
@app.route("/balance", methods=["GET"])
@jwt_required()
def balance():
    email = get_jwt_identity()

    user = Usuario.query.filter_by(email=email).first()
    if not user:
        return jsonify({"message": "Usuario no encontrado"}), 404

    ingresos = db.session.query(db.func.sum(Ingreso.monto)).filter(Ingreso.usuario_id == user.id).scalar() or 0
    gastos = db.session.query(db.func.sum(Gasto.monto)).filter(Gasto.usuario_id == user.id).scalar() or 0

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
@limiter.limit("10 per minute")
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
@app.route("/run-bot", methods=["POST"])
@jwt_required()
@limiter.limit("20 per minute")
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
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    
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
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    
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
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify([]), 200

    user_id = row["id"]
    
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
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    
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
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    
    recurrente = 1 if data.get('es_recurrente') else 0
    cursor.execute("INSERT INTO gastos (usuario_id, tipo, monto, fecha, es_recurrente) VALUES (%s, %s, %s, %s, %s)",
                   (user_id, data['tipo'], data['monto'], data['fecha'], recurrente))
    conn.commit()
    conn.close()
    return jsonify({"message": "Gasto agregado"}), 200

@app.route("/delete-income/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_income(id):
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    cursor.execute("DELETE FROM ingresos WHERE id=%s AND usuario_id=%s", (id, user_id))
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    if deleted == 0:
        return jsonify({"message": "Ingreso no encontrado o no autorizado"}), 404
    return jsonify({"message": "Ingreso eliminado"}), 200

@app.route("/delete-expense/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_expense(id):
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    cursor.execute("DELETE FROM gastos WHERE id=%s AND usuario_id=%s", (id, user_id))
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    if deleted == 0:
        return jsonify({"message": "Gasto no encontrado o no autorizado"}), 404
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
    if not user_row:
        conn.close()
        return jsonify({
            "ingreso_base": 0,
            "total_gastos_mes": 0,
            "income_confirmed_this_month": False,
            "pagos": [],
            "message": "Usuario no encontrado"
        }), 404
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
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    
    cursor.execute("INSERT INTO gastos_recurrentes (usuario_id, categoria, monto, dia_limite) VALUES (%s, %s, %s, %s)",
                   (user_id, data['categoria'], data['monto'], data['dia']))
    conn.commit()
    conn.close()
    return jsonify({"message": "Gasto recurrente configurado"}), 200

@app.route("/edit-recurring-expense/<int:id>", methods=["PUT"])
@jwt_required()
def edit_recurring(id):
    email = get_jwt_identity()
    data = request.json
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    cursor.execute("UPDATE gastos_recurrentes SET monto=%s, dia_limite=%s WHERE id=%s AND usuario_id=%s", (data['monto'], data['dia'], id, user_id))
    conn.commit()
    updated = cursor.rowcount
    conn.close()
    if updated == 0:
        return jsonify({"message": "Gasto recurrente no encontrado o no autorizado"}), 404
    return jsonify({"message": "Actualizado"}), 200

@app.route("/delete-recurring-expense/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_recurring(id):
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    cursor.execute("DELETE FROM gastos_recurrentes WHERE id=%s AND usuario_id=%s", (id, user_id))
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    if deleted == 0:
        return jsonify({"message": "Gasto recurrente no encontrado o no autorizado"}), 404
    return jsonify({"message": "Eliminado"}), 200

@app.route("/confirm-main-income", methods=["POST"])
@jwt_required()
def confirm_income():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, ingreso_mensual FROM usuarios WHERE email=%s", (email,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    monto = row[1]
    
    today = datetime.now().strftime("%Y-%m-%d")
    cursor.execute("INSERT INTO ingresos (usuario_id, monto, fecha, categoria) VALUES (%s, %s, %s, 'Salario')",
                   (user_id, monto, today))
    conn.commit()
    conn.close()
    return jsonify({"message": "Ingreso registrado"}), 200

@app.route("/update-base-income", methods=["PUT"])
@jwt_required()
def update_base_income():
    email = get_jwt_identity()
    data = request.json
    new_income = data.get("ingreso_mensual")

    if new_income is None or not isinstance(new_income, (int, float)) or new_income < 0:
        return jsonify({"message": "Monto de ingreso inválido"}), 400

    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE usuarios SET ingreso_mensual = %s WHERE email = %s", (new_income, email))
    conn.commit()
    updated = cursor.rowcount
    conn.close()
    if updated == 0:
        return jsonify({"message": "Usuario no encontrado"}), 404
    
    return jsonify({"message": "Ingreso base actualizado correctamente"}), 200

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
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify([]), 200
    user_id = row['id']
    
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
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    
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
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    user_row = cursor.fetchone()
    if not user_row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = user_row[0]

    # Actualizar monto solo si la meta pertenece al usuario
    cursor.execute("UPDATE metas_ahorro SET monto_actual=%s WHERE id=%s AND usuario_id=%s RETURNING nombre", (data['monto_actual'], id, user_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Meta no encontrada o no autorizada"}), 404
    nombre_meta = row[0]

    # Si se pide crear gasto (descontar del saldo)
    if data.get('crear_gasto') and data.get('monto_agregado'):
        today = datetime.now().strftime("%Y-%m-%d")
        categoria_gasto = f"Ahorro: {nombre_meta}"
        cursor.execute("INSERT INTO gastos (usuario_id, tipo, monto, fecha, es_recurrente) VALUES (%s, %s, %s, %s, 0)",
                       (user_id, categoria_gasto, data['monto_agregado'], today))

    conn.commit()
    conn.close()
    return jsonify({"message": "Ahorro actualizado"}), 200

@app.route("/delete-savings-goal/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_saving(id):
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email=%s", (email,))
    user_row = cursor.fetchone()
    if not user_row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = user_row[0]

    # 1. Obtener información de la meta solo si pertenece al usuario
    cursor.execute("SELECT nombre, monto_actual FROM metas_ahorro WHERE id=%s AND usuario_id=%s", (id, user_id))
    row = cursor.fetchone()

    msg = "Meta eliminada"
    if row:
        nombre, monto = row
        if monto and monto > 0:
            today = datetime.now().strftime("%Y-%m-%d")
            cursor.execute("INSERT INTO ingresos (usuario_id, monto, fecha, categoria) VALUES (%s, %s, %s, %s)",
                           (user_id, monto, today, f"Devolución: {nombre}"))
            msg = "Meta eliminada y dinero devuelto al saldo"

    # 2. Eliminar la meta (solo si es del usuario)
    cursor.execute("DELETE FROM metas_ahorro WHERE id=%s AND usuario_id=%s", (id, user_id))
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    if deleted == 0:
        return jsonify({"message": "Meta no encontrada o no autorizada"}), 404
    return jsonify({"message": msg}), 200

# =========================
# CHAT
# =========================
def _calcular_saldo(cursor, user_id):
    cursor.execute("SELECT COALESCE(SUM(monto),0) FROM ingresos WHERE usuario_id = %s", (user_id,))
    ingresos = cursor.fetchone()[0]
    cursor.execute("SELECT COALESCE(SUM(monto),0) FROM gastos WHERE usuario_id = %s", (user_id,))
    gastos = cursor.fetchone()[0]
    return ingresos - gastos


def _obtener_mayor_gasto(cursor, user_id):
    cursor.execute(
        "SELECT tipo, monto, fecha FROM gastos WHERE usuario_id=%s ORDER BY monto DESC LIMIT 1",
        (user_id,),
    )
    return cursor.fetchone()


def _obtener_ahorrado(cursor, user_id):
    cursor.execute("SELECT COALESCE(SUM(monto_actual),0) FROM metas_ahorro WHERE usuario_id=%s", (user_id,))
    return cursor.fetchone()[0]


def _obtener_pagos_pendientes(cursor, user_id):
    now = datetime.now()
    date_filter = f"{now.year}-{str(now.month).zfill(2)}-%"

    cursor.execute("SELECT categoria, dia_limite FROM gastos_recurrentes WHERE usuario_id=%s", (user_id,))
    recurrentes = cursor.fetchall()

    cursor.execute(
        "SELECT tipo FROM gastos WHERE usuario_id=%s AND es_recurrente=1 AND fecha LIKE %s",
        (user_id, date_filter),
    )
    pagados = [r[0] for r in cursor.fetchall()]

    return [f"- {cat} (Día {dia})" for cat, dia in recurrentes if cat not in pagados]


def _eliminar_ultimo_gasto(cursor, conn, user_id):
    cursor.execute(
        "SELECT id, tipo, monto FROM gastos WHERE usuario_id=%s ORDER BY id DESC LIMIT 1", (user_id,)
    )
    last_expense = cursor.fetchone()
    if last_expense:
        cursor.execute("DELETE FROM gastos WHERE id=%s", (last_expense[0],))
        conn.commit()
    return last_expense


def _obtener_categorias_usuario(cursor, user_id):
    cursor.execute("SELECT nombre FROM categorias WHERE usuario_id=0 OR usuario_id=%s", (user_id,))
    return [r[0] for r in cursor.fetchall()]


@app.route("/chat", methods=["POST"])
@jwt_required()
@limiter.limit("30 per minute")
def chat():
    body = request.json or {}
    msg = body.get("message", "")
    msg_lower = msg.lower()
    history = body.get("history", [])
    email = get_jwt_identity()

    conn = conectar_db()
    cursor = conn.cursor()

    # Obtener ID de usuario
    cursor.execute("SELECT id FROM usuarios WHERE email = %s", (email,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"response": "Usuario no encontrado", "options": []}), 200
    user_id = row[0]

    hoy = datetime.now().strftime("%Y-%m-%d")
    response_text = None
    pending_action = None
    resultado = None
    intent = None

    # Atajos del menú rápido: se resuelven sin pasar por el LLM (instantáneos)
    if "saldo" in msg_lower:
        intent = "query_balance"
    elif "mayor gasto" in msg_lower:
        intent = "query_biggest_expense"
    elif "ahorrado" in msg_lower:
        intent = "query_savings"
    elif "frase" in msg_lower:
        bot_data = obtener_frase_motivacional()
        response_text = f"💡 {bot_data['dato_extraido']}"
    elif "pagos" in msg_lower:
        intent = "list_pending"
    elif "elimina el último gasto" in msg_lower:
        intent = "delete_last_expense"

    # Texto libre: se interpreta con el asistente LLM (Ollama)
    if response_text is None and intent is None:
        categorias_usuario = _obtener_categorias_usuario(cursor, user_id)
        llm_history = list(history) + [{"role": "user", "text": msg}]
        resultado = llm_assistant.interpretar_mensaje(llm_history, categorias_usuario, hoy)
        intent = resultado["intent"]

    if response_text is not None:
        pass  # ya resuelto arriba (frase motivacional)

    elif intent == "query_balance":
        response_text = f"💰 Tu saldo actual es: ${_calcular_saldo(cursor, user_id):,.0f}"

    elif intent == "query_biggest_expense":
        row = _obtener_mayor_gasto(cursor, user_id)
        response_text = (
            f"🏆 Tu mayor gasto fue en {row[0]} por ${row[1]:,.0f} el {row[2]}."
            if row else "No tienes gastos registrados aún."
        )

    elif intent == "query_savings":
        response_text = f"🐷 Tienes ahorrado un total de ${_obtener_ahorrado(cursor, user_id):,.0f} en tus metas."

    elif intent == "list_pending":
        pendientes = _obtener_pagos_pendientes(cursor, user_id)
        response_text = (
            "📅 Pagos pendientes este mes:\n" + "\n".join(pendientes)
            if pendientes else "✅ ¡Estás al día con tus pagos recurrentes!"
        )

    elif intent == "delete_last_expense":
        last_expense = _eliminar_ultimo_gasto(cursor, conn, user_id)
        response_text = (
            f"🗑️ Eliminado último gasto: {last_expense[1]} por ${last_expense[2]:,.0f}"
            if last_expense else "No hay gastos para eliminar."
        )

    elif intent in ("add_expense", "add_income") and resultado and resultado["monto"]:
        monto = float(resultado["monto"])
        categoria = resultado["categoria"] or ("Otros" if intent == "add_expense" else "Ingreso")
        fecha = resultado["fecha"] or hoy
        pending_action = {
            "type": intent,
            "monto": monto,
            "categoria": categoria,
            "fecha": fecha,
            "es_recurrente": resultado["es_recurrente"],
        }
        palabra = "gasto" if intent == "add_expense" else "ingreso"
        response_text = f"¿Confirmas que quieres registrar este {palabra}? ${monto:,.0f} en {categoria} el {fecha}."

    elif intent in ("add_expense", "add_income"):
        response_text = (resultado["reply"] if resultado else "") or "¿Cuánto fue el monto?"

    elif intent == "error":
        response_text = (resultado["reply"] if resultado else "") or (
            "El asistente inteligente no está disponible ahora mismo. "
            "Puedes usar el menú rápido o el formulario para registrar tu gasto."
        )

    else:
        response_text = (resultado["reply"] if resultado else "") or (
            "No entendí eso. Intenta 'Saldo', 'Mayor gasto', o cuéntame tu gasto, "
            "ej: 'gasté 20000 en transporte hoy'."
        )

    conn.close()

    payload = {"response": response_text, "options": []}
    if pending_action:
        payload["pending_action"] = pending_action
    return jsonify(payload), 200

@app.route("/export-pdf", methods=["GET"])
@jwt_required()
@limiter.limit("10 per minute")
def export_pdf():
    email = get_jwt_identity()
    month = request.args.get("month")
    year = request.args.get("year")
    
    conn = conectar_db()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Get user info
    cursor.execute("SELECT id, nombre, apellidos FROM usuarios WHERE email=%s", (email,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = user["id"]
    name_parts = [user.get("nombre") or "", user.get("apellidos") or ""]
    name = " ".join(part for part in name_parts if part).strip() or email
    
    # Build query
    query = """
        SELECT fecha, categoria, monto, 'Ingreso' as tipo 
        FROM ingresos WHERE usuario_id=%s
        UNION ALL
        SELECT fecha, tipo as categoria, monto, 'Gasto' as tipo 
        FROM gastos WHERE usuario_id=%s
    """
    params = [user_id, user_id]
    
    if month and year:
        date_filter = f"{year}-{month}-%"
        query = """
            SELECT fecha, categoria, monto, 'Ingreso' as tipo 
            FROM ingresos WHERE usuario_id=%s AND fecha LIKE %s
            UNION ALL
            SELECT fecha, tipo as categoria, monto, 'Gasto' as tipo 
            FROM gastos WHERE usuario_id=%s AND fecha LIKE %s
        """
        params = [user_id, date_filter, user_id, date_filter]
        
    query += " ORDER BY fecha DESC"
    
    cursor.execute(query, params)
    data = cursor.fetchall()
    conn.close()
    
    # Create PDF
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    
    pdf.cell(200, 10, txt=f"Reporte Financiero - {name}", ln=True, align='C')
    if month and year:
        pdf.cell(200, 10, txt=f"Periodo: {month}/{year}", ln=True, align='C')
    
    pdf.ln(10)
    
    # Table
    pdf.set_font("Arial", 'B', 10)
    pdf.cell(40, 10, "Fecha", 1)
    pdf.cell(30, 10, "Tipo", 1)
    pdf.cell(70, 10, "Categoria", 1)
    pdf.cell(40, 10, "Monto", 1)
    pdf.ln()
    
    pdf.set_font("Arial", size=10)
    for row in data:
        pdf.cell(40, 10, str(row['fecha']), 1)
        pdf.cell(30, 10, str(row['tipo']), 1)
        
        # Sanitize text for FPDF (latin-1)
        cat = str(row['categoria']).encode('latin-1', 'replace').decode('latin-1')
        pdf.cell(70, 10, cat, 1)
        
        pdf.cell(40, 10, f"${row['monto']:,.2f}", 1)
        pdf.ln()
        
    # Output
    val = pdf.output(dest='S')
    if isinstance(val, str):
        val = val.encode('latin-1')
    
    return send_file(
        io.BytesIO(val),
        mimetype='application/pdf',
        as_attachment=True,
        download_name='reporte.pdf'
    )

# =========================
# START
# =========================

@app.route("/check-initial-profile", methods=["GET", "OPTIONS"])
@cross_origin()
@jwt_required(optional=True)
def check_initial_profile():
    if request.method == "OPTIONS":
        return "", 200

    email = get_jwt_identity()
    if not email:
        return jsonify({"message": "Token requerido"}), 401

    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT nombre FROM usuarios WHERE email = %s", (email,))
    row = cursor.fetchone()
    conn.close()

    # Si tiene nombre, NO necesita perfil info.
    # Aseguramos que no sea None ni cadena vacía.
    # Si row es None (usuario no encontrado) o row[0] es None/Vacío -> has_profile = False
    has_profile = row and row[0] and str(row[0]).strip() != ""
    return jsonify({"needs_profile_info": not has_profile}), 200

@app.route("/save-initial-profile", methods=["POST", "OPTIONS"])
@cross_origin()
@jwt_required(optional=True)
def save_initial_profile():
    if request.method == "OPTIONS":
        return "", 200

    email = get_jwt_identity()
    if not email:
        return jsonify({"message": "Token requerido"}), 401

    data = request.json
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE usuarios SET nombre=%s, apellidos=%s, edad=%s WHERE email=%s", 
                   (data.get("nombre"), data.get("apellidos"), data.get("edad"), email))
    conn.commit()
    conn.close()
    return jsonify({"message": "Perfil guardado"}), 200

@app.route("/check-onboarding", methods=["GET", "OPTIONS"])
@cross_origin()
@jwt_required(optional=True)
def check_onboarding():
    if request.method == "OPTIONS":
        return "", 200

    email = get_jwt_identity()
    if not email:
        return jsonify({"message": "Token requerido"}), 401

    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT ingreso_mensual FROM usuarios WHERE email = %s", (email,))
    row = cursor.fetchone()
    conn.close()
    
    # Si ingreso_mensual es NULL o 0, necesita onboarding
    needs = not (row and row[0] and row[0] > 0)
    return jsonify({"needs_onboarding": needs}), 200

@app.route("/save-onboarding", methods=["POST", "OPTIONS"])
@cross_origin()
@jwt_required(optional=True)
def save_onboarding():
    if request.method == "OPTIONS":
        return "", 200

    email = get_jwt_identity()
    if not email:
        return jsonify({"message": "Token requerido"}), 401

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
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404
    user_id = row[0]
    
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
