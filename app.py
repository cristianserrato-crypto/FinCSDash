"""
app.py
Backend principal de FinCSDash
Registro de usuarios con verificación por correo (Gmail API)
Login tradicional y Login con Google
"""

# =========================
# IMPORTS
# =========================
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import random
import uuid
import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import io
from fpdf import FPDF
import os

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
app.config["JWT_SECRET_KEY"] = "super-secreto-cambiar-en-produccion"  # ⚠️ CAMBIAR ESTO EN PROD
jwt = JWTManager(app)

GOOGLE_CLIENT_ID = "741392813029-8iavkp2iqcntpb1m4d16h8t02c028naf.apps.googleusercontent.com"

# Crear tablas al iniciar el backend
crear_tablas()

# =========================
# RUTA PRINCIPAL (LOGO)
# =========================
@app.route("/")
def index():
    return """
    <div style="text-align:center; margin-top:50px; font-family: Arial, sans-serif;">
        <img src="/logo" alt="FinCSDash Logo" width="200">
        <h1>Backend FinCSDash Activo</h1>
        <p>El servidor está funcionando correctamente.</p>
    </div>
    """

@app.route("/logo")
def serve_logo():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    logo_path = os.path.join(base_dir, "logo.png")
    return send_file(logo_path, mimetype='image/png')

# =========================
# REGISTRO DE USUARIO
# =========================
@app.route("/register", methods=["POST"])
def register():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    # --- VALIDACIÓN DE ENTRADA ---
    if not email or not password:
        return jsonify({"message": "El email y la contraseña son obligatorios."}), 400

    # --- LÓGICA PARA SUSPENDER VERIFICACIÓN ---
    hashed_password = generate_password_hash(password)
    # No generamos código de verificación ya que no se usará

    try:
        conn = conectar_db()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT id, verificado FROM usuarios WHERE email = ?", # Mantenemos la consulta para verificar si ya existe
            (email,)
        )
        usuario_existente = cursor.fetchone()

        if usuario_existente:
            # Si el usuario ya existe y está verificado, informamos.
            if usuario_existente[1] == 1:
                conn.close()
                return jsonify({
                    "message": "El usuario ya está registrado y verificado"
                }), 400
            # Si existe pero no está verificado, actualizamos su contraseña y lo marcamos como verificado.
            else:
                cursor.execute("""
                    UPDATE usuarios
                    SET password = ?, verificado = 1, codigo_verificacion = NULL
                    WHERE email = ?
                """, (hashed_password, email))
        else:
            # Si no existe, lo creamos directamente como verificado.
            cursor.execute("""
                INSERT INTO usuarios (email, password, codigo_verificacion, verificado)
                VALUES (?, ?, NULL, 1)
            """, (email, hashed_password))

        conn.commit()
        conn.close()

        # No se envía correo de verificación ni se imprime el código
        return jsonify({
            "message": "Usuario registrado correctamente. Ya puedes iniciar sesión."
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
# REENVIAR CÓDIGO
# =========================
@app.route("/resend-code", methods=["POST"])
def resend_code():
    data = request.json
    email = data.get("email")

    if not email:
        return jsonify({"message": "El email es requerido."}), 400

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id, verificado FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({"message": "Usuario no encontrado."}), 404

    if user[1] == 1: # El usuario ya está verificado
        conn.close()
        return jsonify({"message": "Esta cuenta ya ha sido verificada."}), 400

    # Generar nuevo código y actualizarlo en la BD
    new_code = str(random.randint(100000, 999999))
    cursor.execute("UPDATE usuarios SET codigo_verificacion = ? WHERE email = ?", (new_code, email))
    conn.commit()
    conn.close()

    # Enviar el nuevo correo
    print(f"🔑 NUEVO CÓDIGO para {email}: {new_code}")
    try:
        enviar_correo(email, "Nuevo código de verificación", f"Tu nuevo código es: {new_code}")
        return jsonify({"message": "Se ha enviado un nuevo código a tu correo."}), 200
    except Exception as e:
        print(f"⚠️  No se pudo reenviar el correo: {e}")
        return jsonify({"message": "Error al reenviar el código. Inténtalo más tarde."}), 500


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

    # --- MODIFICADO: Ya no se comprueba el estado de verificación ---
    cursor.execute("""
        SELECT id, password FROM usuarios
        WHERE email = ?
    """, (email,))

    user = cursor.fetchone()
    conn.close()

    # user[1] es la contraseña encriptada guardada en la BD
    if user and check_password_hash(user[1], password):
        access_token = create_access_token(identity=email)
        return jsonify({"message": "Login exitoso", "token": access_token}), 200
    else:
        # --- MODIFICADO: Mensaje de error más genérico ---
        return jsonify({"message": "Credenciales incorrectas"}), 401


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
            """, (email, str(uuid.uuid4()))) # Contraseña aleatoria segura
            conn.commit()

        conn.close()

        access_token = create_access_token(identity=email)
        return jsonify({
            "message": "Login con Google exitoso",
            "email": email,
            "token": access_token
        }), 200

    except Exception as e:
        print("ERROR GOOGLE LOGIN:", e)
        return jsonify({"message": "Token inválido"}), 401


# =========================
# ONBOARDING & ESTADO
# =========================
@app.route("/check-onboarding", methods=["GET"])
@jwt_required()
def check_onboarding():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    # Verificamos si el usuario ya configuró su ingreso mensual (indicador de que completó el onboarding)
    cursor.execute("SELECT ingreso_mensual FROM usuarios WHERE email = ?", (email,))
    row = cursor.fetchone()
    conn.close()
    
    needs_onboarding = True
    if row and row[0] and row[0] > 0:
        needs_onboarding = False
        
    return jsonify({"needs_onboarding": needs_onboarding}), 200

@app.route("/save-onboarding", methods=["POST"])
@jwt_required()
def save_onboarding():
    data = request.json
    email = get_jwt_identity()
    
    ingreso = data.get("ingreso_mensual")
    dia_pago = data.get("dia_pago")
    gastos_fijos = data.get("gastos_fijos") # Lista de objetos {categoria, monto, dia}

    conn = conectar_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user_id = cursor.fetchone()[0]

    # 1. Actualizar Usuario
    cursor.execute("UPDATE usuarios SET ingreso_mensual = ?, dia_pago = ? WHERE id = ?", (ingreso, dia_pago, user_id))

    # 2. Guardar Gastos Recurrentes
    # Primero limpiamos los anteriores si existieran para evitar duplicados en re-configuración
    cursor.execute("DELETE FROM gastos_recurrentes WHERE usuario_id = ?", (user_id,))
    
    for gasto in gastos_fijos:
        cursor.execute("""
            INSERT INTO gastos_recurrentes (usuario_id, categoria, monto, dia_limite)
            VALUES (?, ?, ?, ?)
        """, (user_id, gasto['categoria'], gasto['monto'], gasto['dia']))

    conn.commit()
    conn.close()
    return jsonify({"message": "Configuración guardada correctamente"}), 200

@app.route("/payment-status", methods=["GET"])
@jwt_required()
def payment_status():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, ingreso_mensual FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()
    user_id = user[0]
    ingreso_base = user[1] or 0

    # Obtener gastos recurrentes configurados
    cursor.execute("SELECT id, categoria, monto, dia_limite FROM gastos_recurrentes WHERE usuario_id = ?", (user_id,))
    recurrentes = cursor.fetchall()

    # Obtener gastos REALES hechos este mes
    mes_actual = datetime.now().strftime("%Y-%m")
    cursor.execute("""
        SELECT tipo, SUM(monto) FROM gastos 
        WHERE usuario_id = ? AND fecha LIKE ?
        GROUP BY tipo
    """, (user_id, f"{mes_actual}%"))
    gastos_reales = {row[0]: row[1] for row in cursor.fetchall()}

    # Verificar si ya se registró un ingreso este mes
    cursor.execute("SELECT id FROM ingresos WHERE usuario_id = ? AND fecha LIKE ?", (user_id, f"{mes_actual}%"))
    income_confirmed_this_month = cursor.fetchone() is not None

    estado_pagos = []
    total_comprometido = 0

    for id_rec, cat, monto_esperado, dia_limite in recurrentes:
        total_comprometido += monto_esperado
        pagado = cat in gastos_reales and gastos_reales[cat] >= (monto_esperado * 0.9) # Margen del 10%
        estado_pagos.append({
            "id": id_rec,
            "categoria": cat,
            "monto_esperado": monto_esperado,
            "dia_limite": dia_limite,
            "pagado": pagado
        })

    conn.close()
    return jsonify({"ingreso_base": ingreso_base, "pagos": estado_pagos, "total_comprometido": total_comprometido, "income_confirmed_this_month": income_confirmed_this_month}), 200

@app.route("/edit-recurring-expense/<int:id>", methods=["PUT"])
@jwt_required()
def edit_recurring_expense(id):
    data = request.json
    email = get_jwt_identity()
    monto = data.get("monto")
    dia = data.get("dia")

    conn = conectar_db()
    cursor = conn.cursor()
    
    # Verificar que el usuario sea dueño del registro
    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user_id = cursor.fetchone()[0]

    cursor.execute("UPDATE gastos_recurrentes SET monto = ?, dia_limite = ? WHERE id = ? AND usuario_id = ?", (monto, dia, id, user_id))
    
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"message": "No se pudo actualizar. Verifica permisos."}), 404
        
    conn.commit()
    conn.close()
    return jsonify({"message": "Pago recurrente actualizado"}), 200

@app.route("/delete-recurring-expense/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_recurring_expense(id):
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user_id = cursor.fetchone()[0]

    cursor.execute("DELETE FROM gastos_recurrentes WHERE id = ? AND usuario_id = ?", (id, user_id))
    
    conn.commit()
    conn.close()
    return jsonify({"message": "Gasto recurrente eliminado"}), 200

@app.route("/confirm-main-income", methods=["POST"])
@jwt_required()
def confirm_main_income():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()

    # 1. Obtener datos del usuario
    cursor.execute("SELECT id, ingreso_mensual FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()
    if not user or not user[1] or user[1] <= 0:
        conn.close()
        return jsonify({"message": "No tienes un ingreso base configurado."}), 400
    
    user_id = user[0]
    ingreso_base = user[1]

    # 2. Verificar que no se haya confirmado ya este mes para evitar duplicados
    mes_actual = datetime.now().strftime("%Y-%m")
    cursor.execute("SELECT id FROM ingresos WHERE usuario_id = ? AND fecha LIKE ?", (user_id, f"{mes_actual}%"))
    if cursor.fetchone():
        conn.close()
        return jsonify({"message": "El ingreso de este mes ya fue registrado."}), 400

    # 3. Registrar el ingreso
    fecha_hoy = datetime.now().date().isoformat()
    cursor.execute("INSERT INTO ingresos (usuario_id, monto, fecha) VALUES (?, ?, ?)", (user_id, ingreso_base, fecha_hoy))

    conn.commit()
    conn.close()

    return jsonify({"message": f"Ingreso de {ingreso_base} registrado correctamente."}), 201

# =========================
# PERFIL DE USUARIO
# =========================
@app.route("/get-profile", methods=["GET"])
@jwt_required()
def get_profile():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT email, foto_perfil FROM usuarios WHERE email = ?", (email,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return jsonify({"email": row[0], "foto_perfil": row[1]}), 200
    return jsonify({"message": "Usuario no encontrado"}), 404

@app.route("/update-photo", methods=["POST"])
@jwt_required()
def update_photo():
    email = get_jwt_identity()
    data = request.json
    foto = data.get("foto") # Base64 string
    
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE usuarios SET foto_perfil = ? WHERE email = ?", (foto, email))
    conn.commit()
    conn.close()
    return jsonify({"message": "Foto actualizada"}), 200

@app.route("/delete-photo", methods=["DELETE"])
@jwt_required()
def delete_photo():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE usuarios SET foto_perfil = NULL WHERE email = ?", (email,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Foto eliminada"}), 200

# =========================
# OBTENER CATEGORÍAS
# =========================
@app.route("/categories", methods=["GET"])
@jwt_required()
def get_categories():
    email = get_jwt_identity()

    conn = conectar_db()
    cursor = conn.cursor()

    # Obtener ID del usuario
    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()
    usuario_id = user[0] if user else 0

    # Traer categorías globales (0) y las del usuario
    cursor.execute("SELECT nombre FROM categorias WHERE usuario_id = 0 OR usuario_id = ?", (usuario_id,))
    categorias = [row[0] for row in cursor.fetchall()]
    conn.close()
    return jsonify(categorias), 200


# =========================
# AGREGAR CATEGORÍA
# =========================
@app.route("/add-category", methods=["POST"])
@jwt_required()
def add_category():
    data = request.json
    email = get_jwt_identity()
    nombre = data.get("nombre")

    if not nombre:
        return jsonify({"message": "El nombre es obligatorio"}), 400

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    usuario_id = cursor.fetchone()[0]

    try:
        cursor.execute("INSERT INTO categorias (usuario_id, nombre) VALUES (?, ?)", (usuario_id, nombre))
        conn.commit()
        conn.close()
        return jsonify({"message": "Categoría agregada"}), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"message": "Esa categoría ya existe"}), 400


# =========================
# AGREGAR INGRESO
# =========================
@app.route("/add-income", methods=["POST"])
@jwt_required()
def add_income():
    data = request.json
    email = get_jwt_identity() # Obtenemos el email del token seguro, no del JSON
    monto = data.get("monto")

    try:
        monto = float(monto)
        if monto <= 0:
            return jsonify({"message": "El monto debe ser positivo"}), 400
    except (ValueError, TypeError):
        return jsonify({"message": "El monto debe ser un número válido"}), 400

    fecha = data.get("fecha")
    try:
        fecha_obj = datetime.strptime(fecha, "%Y-%m-%d").date()
        if fecha_obj > datetime.now().date():
            return jsonify({"message": "La fecha no puede ser futura"}), 400
    except (ValueError, TypeError):
        return jsonify({"message": "Fecha inválida, use formato YYYY-MM-DD"}), 400

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
@jwt_required()
def add_expense():
    data = request.json
    email = get_jwt_identity()
    tipo = data.get("tipo")
    monto = data.get("monto")

    try:
        monto = float(monto)
        if monto <= 0:
            return jsonify({"message": "El monto debe ser positivo"}), 400
    except (ValueError, TypeError):
        return jsonify({"message": "El monto debe ser un número válido"}), 400

    fecha = data.get("fecha")
    try:
        fecha_obj = datetime.strptime(fecha, "%Y-%m-%d").date()
        if fecha_obj > datetime.now().date():
            return jsonify({"message": "La fecha no puede ser futura"}), 400
    except (ValueError, TypeError):
        return jsonify({"message": "Fecha inválida, use formato YYYY-MM-DD"}), 400

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
# EDITAR GASTO
# =========================
@app.route("/edit-expense/<int:id>", methods=["PUT"])
@jwt_required()
def edit_expense(id):
    data = request.json
    email = get_jwt_identity()
    
    tipo = data.get("tipo")
    monto = data.get("monto")
    fecha = data.get("fecha")

    # Validaciones (Mismas que en agregar)
    try:
        monto = float(monto)
        if monto <= 0:
            return jsonify({"message": "El monto debe ser positivo"}), 400
    except (ValueError, TypeError):
        return jsonify({"message": "El monto debe ser un número válido"}), 400

    try:
        fecha_obj = datetime.strptime(fecha, "%Y-%m-%d").date()
        if fecha_obj > datetime.now().date():
            return jsonify({"message": "La fecha no puede ser futura"}), 400
    except (ValueError, TypeError):
        return jsonify({"message": "Fecha inválida, use formato YYYY-MM-DD"}), 400

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404

    usuario_id = user[0]

    # Verificar que el gasto exista y pertenezca al usuario
    cursor.execute("SELECT id FROM gastos WHERE id = ? AND usuario_id = ?", (id, usuario_id))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"message": "Gasto no encontrado o no autorizado"}), 404

    cursor.execute("UPDATE gastos SET tipo = ?, monto = ?, fecha = ? WHERE id = ?", (tipo, monto, fecha, id))
    conn.commit()
    conn.close()

    return jsonify({"message": "Gasto actualizado correctamente"}), 200


# =========================
# ELIMINAR GASTO
# =========================
@app.route("/delete-expense/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_expense(id):
    email = get_jwt_identity()

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404

    usuario_id = user[0]

    # Verificar que el gasto exista y pertenezca al usuario
    cursor.execute("SELECT id FROM gastos WHERE id = ? AND usuario_id = ?", (id, usuario_id))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"message": "Gasto no encontrado o no autorizado"}), 404

    cursor.execute("DELETE FROM gastos WHERE id = ?", (id,))
    conn.commit()
    conn.close()

    return jsonify({"message": "Gasto eliminado correctamente"}), 200


# =========================
# ELIMINAR INGRESO
# =========================
@app.route("/delete-income/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_income(id):
    email = get_jwt_identity()

    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({"message": "Usuario no encontrado"}), 404

    usuario_id = user[0]

    # Verificar que el ingreso exista y pertenezca al usuario
    cursor.execute("SELECT id FROM ingresos WHERE id = ? AND usuario_id = ?", (id, usuario_id))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"message": "Ingreso no encontrado o no autorizado"}), 404

    cursor.execute("DELETE FROM ingresos WHERE id = ?", (id,))
    conn.commit()
    conn.close()

    return jsonify({"message": "Ingreso eliminado correctamente"}), 200


# =========================
# METAS DE AHORRO
# =========================
@app.route("/savings-goals", methods=["GET"])
@jwt_required()
def get_savings_goals():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user_id = cursor.fetchone()[0]

    cursor.execute("SELECT id, nombre, monto_objetivo, monto_actual, fecha_limite FROM metas_ahorro WHERE usuario_id = ?", (user_id,))
    metas = [{"id": r[0], "nombre": r[1], "objetivo": r[2], "actual": r[3], "fecha": r[4]} for r in cursor.fetchall()]
    
    conn.close()
    return jsonify(metas), 200

@app.route("/add-savings-goal", methods=["POST"])
@jwt_required()
def add_savings_goal():
    data = request.json
    email = get_jwt_identity()
    
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user_id = cursor.fetchone()[0]
    
    cursor.execute("""
        INSERT INTO metas_ahorro (usuario_id, nombre, monto_objetivo, monto_actual, fecha_limite)
        VALUES (?, ?, ?, ?, ?)
    """, (user_id, data['nombre'], data['objetivo'], data.get('actual', 0), data['fecha']))
    
    conn.commit()
    conn.close()
    return jsonify({"message": "Meta creada exitosamente"}), 201

@app.route("/update-savings-goal/<int:id>", methods=["PUT"])
@jwt_required()
def update_savings_goal(id):
    data = request.json
    email = get_jwt_identity()
    nuevo_monto = data.get("monto_actual")
    
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user_id = cursor.fetchone()[0]
    
    cursor.execute("UPDATE metas_ahorro SET monto_actual = ? WHERE id = ? AND usuario_id = ?", (nuevo_monto, id, user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Meta actualizada"}), 200

@app.route("/delete-savings-goal/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_savings_goal(id):
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user_id = cursor.fetchone()[0]
    
    cursor.execute("DELETE FROM metas_ahorro WHERE id = ? AND usuario_id = ?", (id, user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Meta eliminada"}), 200

# =========================
# CONSULTAR BALANCE
# =========================
@app.route("/balance", methods=["POST"])
@jwt_required()
def balance():
    # data = request.json  <-- Ya no necesitamos leer el body para el email
    email = get_jwt_identity()

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
# OBTENER MOVIMIENTOS
# =========================
@app.route("/movements", methods=["GET"])
@jwt_required()
def get_movements():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()
    usuario_id = user[0] if user else 0

    # Filtros de fecha (opcionales)
    month = request.args.get("month")
    year = request.args.get("year")
    
    # Base de las consultas
    query_ingresos = "SELECT id, monto, fecha FROM ingresos WHERE usuario_id = ?"
    query_gastos = "SELECT id, tipo, monto, fecha FROM gastos WHERE usuario_id = ?"
    params = [usuario_id]

    if month and year:
        fecha_like = f"{year}-{int(month):02d}%" # Formato YYYY-MM%
        query_ingresos += " AND fecha LIKE ?"
        query_gastos += " AND fecha LIKE ?"
        params.append(fecha_like)

    # Obtener Ingresos
    cursor.execute(query_ingresos, tuple(params))
    ingresos = [{"id": r[0], "tipo": "Ingreso", "categoria": "Ingreso", "monto": r[1], "fecha": r[2]} for r in cursor.fetchall()]

    # Obtener Gastos
    cursor.execute(query_gastos, tuple(params))
    gastos = [{"id": r[0], "tipo": "Gasto", "categoria": r[1], "monto": r[2], "fecha": r[3]} for r in cursor.fetchall()]

    conn.close()

    # Unir y ordenar por fecha descendente (más reciente primero)
    movimientos = ingresos + gastos
    movimientos.sort(key=lambda x: x["fecha"], reverse=True)

    return jsonify(movimientos), 200


# =========================
# EXPORTAR PDF
# =========================
@app.route("/export-pdf", methods=["GET"])
@jwt_required()
def export_pdf():
    email = get_jwt_identity()
    conn = conectar_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
    user = cursor.fetchone()
    usuario_id = user[0] if user else 0

    # Filtros
    month = request.args.get("month")
    year = request.args.get("year")
    
    query = "SELECT tipo, monto, fecha FROM gastos WHERE usuario_id = ?"
    params = [usuario_id]

    if month and year:
        fecha_like = f"{year}-{int(month):02d}%"
        query += " AND fecha LIKE ?"
        params.append(fecha_like)

    cursor.execute(query, tuple(params))
    gastos = cursor.fetchall()
    conn.close()

    try:
        # Generar PDF
        pdf = FPDF()
        pdf.add_page()

        # Agregar Logo
        # Buscamos logo.png en la carpeta raíz (un nivel arriba de backend)
        base_dir = os.path.dirname(os.path.abspath(__file__))
        logo_path = os.path.join(base_dir, "..", "logo.png")
        
        # Verificar si existe antes de agregarlo
        if os.path.exists(logo_path):
            try:
                pdf.image(logo_path, x=10, y=8, w=30) # x, y, ancho
            except Exception as e:
                print(f"Error cargando imagen: {e}")

        pdf.set_font("Arial", size=12)
        
        pdf.cell(200, 10, txt="Reporte de Gastos", ln=1, align="C")
        if month and year:
            pdf.cell(200, 10, txt=f"Periodo: {month}/{year}", ln=1, align="C")
        
        pdf.ln(10)
        
        # Encabezados de tabla
        pdf.set_font("Arial", 'B', 12)
        pdf.cell(60, 10, "Fecha", 1)
        pdf.cell(70, 10, "Categoria", 1)
        pdf.cell(60, 10, "Monto", 1)
        pdf.ln()
        
        # Filas
        pdf.set_font("Arial", size=12)
        total_gastos = 0
        for tipo, monto, fecha in gastos:
            total_gastos += monto
            # encode('latin-1', 'replace') ayuda a manejar tildes en fpdf básico
            tipo_str = tipo.encode('latin-1', 'replace').decode('latin-1')
            pdf.cell(60, 10, str(fecha), 1)
            pdf.cell(70, 10, tipo_str, 1)
            pdf.cell(60, 10, f"${monto:.2f}", 1)
            pdf.ln()

        # Fila de Total
        pdf.set_font("Arial", 'B', 12)
        pdf.cell(130, 10, "TOTAL", 1, align='R')
        pdf.cell(60, 10, f"${total_gastos:.2f}", 1)

        # Preparar archivo en memoria
        # dest='S' devuelve string en FPDF < 2.0. Si usas FPDF2, esto podría variar.
        pdf_output = pdf.output(dest='S').encode('latin-1')
        buffer = io.BytesIO(pdf_output)
        buffer.seek(0)
        
        return send_file(
            buffer,
            as_attachment=True,
            download_name="reporte_gastos.pdf",
            mimetype="application/pdf"
        )
    except Exception as e:
        print(f"ERROR PDF: {e}")
        return jsonify({"message": "Error generando PDF", "error": str(e)}), 500


# =========================
# INICIO DEL SERVIDOR
# =========================
if __name__ == "__main__":
    app.run(debug=True)
