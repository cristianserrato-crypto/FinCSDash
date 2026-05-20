import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from backend.database import conectar_db
import jwt

load_dotenv()
app = Flask(__name__)
CORS(app)

SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "your_secret_key")

def get_user_id(token):
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return data['user_id']
    except:
        return None

@app.route('/chat', methods=['POST'])
def chat_fincsdash():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    user_id = get_user_id(token)
    if not user_id:
        return jsonify({"response": "Sesión expirada."}), 401

    user_msg = request.json.get('message', '').lower()
    conn = conectar_db()
    cur = conn.cursor()
    
    # Lógica original financiera
    if "saldo" in user_msg:
        cur.execute("SELECT (SELECT COALESCE(SUM(monto), 0) FROM ingresos WHERE usuario_id = %s) - (SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE usuario_id = %s)", (user_id, user_id))
        resp = f"Tu saldo actual es de ${cur.fetchone()[0]:,.2f}."
    elif "frase" in user_msg:
        from backend.bot import obtener_frase_motivacional
        resp = obtener_frase_motivacional()['dato_extraido']
    else:
        resp = "Asistente FinCSDash: Prueba preguntando por tu 'Saldo' o una 'Frase'."

    cur.close()
    conn.close()
    return jsonify({"response": resp})

@app.route('/health')
def health():
    return jsonify({"status": "FinCSDash Backend Online", "port": 5000})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)