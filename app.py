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
    logo_path = os.path.join(base_dir, "..", "logo.png")
    return send_file(logo_path, mimetype='image/png')

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
    hashed_password = generate_password_hash(password) # Encriptar contraseña

    codigo = str(random.randint(100000, 999999))

    try:
        conn = conectar_db()
        cursor = conn.cursor()

        # 1. Verificar si el usuario ya existe
        cursor.execute("SELECT id, verificado FROM usuarios WHERE email = ?", (email,))
        usuario_existente = cursor.fetchone()

        if usuario_existente:
            if usuario_existente[1] == 1: # Si ya está verificado
                conn.close()
                return jsonify({"message": "El usuario ya está registrado y verificado"}), 400
            else:
                # Si existe pero NO está verificado, actualizamos contraseña y código (Reintento)
                cursor.execute("""
                    UPDATE usuarios SET password = ?, codigo_verificacion = ? WHERE email = ?
                """, (hashed_password, codigo, email))
        else:
            # 2. Si no existe, lo creamos
            cursor.execute("""
                INSERT INTO usuarios (email, password, codigo_verificacion, verificado)
                VALUES (?, ?, ?, 0) 
            """, (email, hashed_password, codigo))

        conn.commit()
        conn.close()

        # 3. Intentar enviar correo (sin bloquear si falla)
        try:
            enviar_correo(email, "Código de verificación - FinCSDash", f"Tu código es: {codigo}")
        except Exception as e:
            print(f"⚠️ NO SE PUDO ENVIAR CORREO (¿Faltan credenciales?).")
            print(f"🔑 TU CÓDIGO DE VERIFICACIÓN ES: {codigo}")

        return jsonify({
            "message": "Usuario registrado. Revisa tu correo (o la consola) para el código."
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
        SELECT id, password FROM usuarios
        WHERE email = ? AND verificado = 1
    """, (email,))

    user = cursor.fetchone()
    conn.close()

    # user[1] es la contraseña encriptada guardada en la BD
    if user and check_password_hash(user[1], password):
        access_token = create_access_token(identity=email)
        return jsonify({"message": "Login exitoso", "token": access_token}), 200
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
    pass