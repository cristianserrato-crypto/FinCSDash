# Importamos Flask para crear el servidor web
# request para recibir datos del cliente
# jsonify para devolver respuestas en formato JSON
from flask import Flask, request, jsonify
from flask_cors import CORS  # Permite conexión desde el frontend

# Creamos la aplicación Flask
app = Flask(__name__)
CORS(app)  # Habilita CORS para toda la app

# Definimos una ruta llamada /login
# Solo acepta peticiones POST (envío de datos)

@app.route("/login", methods=["POST"])
def login():
    # Obtenemos los datos enviados en formato JSON
    data = request.json
    # Extraemos el email y la contraseña del JSON
    email = data.get("email")
    password = data.get("password")

    # Validación simulada (más adelante será con base de datos)
    if email == "test@fincsdash.com" and password == "1234":
        # Respuesta si las credenciales son correctas
        return jsonify({"message": "Login exitoso"}), 200
    else:
        # Respuesta si las credenciales son incorrectas
        return jsonify({"message": "Credenciales incorrectas"}), 401

# Punto de entrada del programa
# Inicia el servidor en modo desarrollo
if __name__ == "__main__":
    app.run(debug=True)
