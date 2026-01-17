# Importamos Flask para crear el servidor web
# request para recibir datos del cliente
# jsonify para devolver respuestas en formato JSON
from flask import Flask, request, jsonify
from flask_cors import CORS  # Permite conexión desde el frontend
import sqlite3
from database import conectar_db, crear_tablas

# Creamos la aplicación Flask
app = Flask(__name__)
CORS(app)  # Habilita CORS para toda la app

# Crear tablas al iniciar la app
crear_tablas()

# Ruta para registrar usuarios
@app.route("/register", methods=["POST"])
def register():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    try:
        conn = conectar_db()
        cursor = conn.cursor()

        cursor.execute(
            "INSERT INTO usuarios (email, password) VALUES (?, ?)",
            (email, password)
        )

        conn.commit()
        conn.close()

        return jsonify({"message": "Usuario registrado correctamente"}), 201

    except sqlite3.IntegrityError:
        return jsonify({"message": "El usuario ya existe"}), 400


# Definimos una ruta llamada /login
# Solo acepta peticiones POST (envío de datos)

@app.route("/login", methods=["POST"])
def login():
    # Obtenemos los datos enviados en formato JSON
    data = request.json
    # Extraemos el email y la contraseña del JSON
    email = data.get("email")
    password = data.get("password")

    conn = conectar_db()
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT * FROM usuarios WHERE email = ? AND password = ?",
        (email, password)
    )
    user = cursor.fetchone()
    conn.close()

    if user:
        return jsonify({"message": "Login exitoso"}), 200
    else:
        return jsonify({"message": "Credenciales incorrectas"}), 401


if __name__ == "__main__":
    app.run(debug=True)