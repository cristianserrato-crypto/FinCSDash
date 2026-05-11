import os
from datetime import datetime
import json
import sqlite3
import re
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai
import logging

load_dotenv()

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# Configurar logging con codificación UTF-8 para evitar errores con emojis en Windows
log_file = os.path.join(os.path.dirname(__file__), 'ia_amigo.log')
file_handler = logging.FileHandler(log_file, encoding='utf-8')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[file_handler, logging.StreamHandler()]
)

# --- Configuración de Gemini ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# --- Base de datos SQLite local ---
DB_PATH = os.path.join(os.path.dirname(__file__), 'amigoia.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        personality TEXT NOT NULL,
        tone TEXT NOT NULL,
        interests TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profile_id) REFERENCES profiles(id)
    )''')
    try:
        c.execute("ALTER TABLE profiles ADD COLUMN voice_style TEXT DEFAULT 'mujer_dulce'")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()

init_db()

def get_profile(profile_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, name, personality, tone, interests FROM profiles WHERE id = ?", (profile_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return {"id": row[0], "name": row[1], "personality": row[2], "tone": row[3], "interests": row[4]}
    return None

def get_conversation_history(profile_id, limit=20):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT role, content FROM conversations WHERE profile_id = ? ORDER BY id DESC LIMIT ?", (profile_id, limit))
    rows = c.fetchall()
    conn.close()
    rows.reverse()
    return [{"role": r[0], "parts": [r[1]]} for r in rows]

def save_message(profile_id, role, content):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT INTO conversations (profile_id, role, content) VALUES (?, ?, ?)", (profile_id, role, content))
    conn.commit()
    conn.close()

def build_system_prompt(profile):
    return f"""Eres una inteligencia artificial llamada "Cerbis".
Tu estado actual es: IA en etapa de aprendizaje y desarrollo.
Este es un proyecto educativo creado por Cristian.

REGLAS DE COMPORTAMIENTO Y FORMATO (¡MUY IMPORTANTE!):
- Preséntate siempre como Cerbis al inicio de la sesión.
- Explica que estás en aprendizaje y que buscas tener conversaciones normales con fines educativos.
- Debes dar claridad de que todo lo que se hable en esta sesión es personal y privado.
- Sé genuino, amable y mantén una conversación fluida y natural.
- Habla siempre en español de forma clara.
- PROHIBIDO USAR EMOJIS, emoticones o caracteres especiales en tus respuestas, ya que tu texto será leído por un sintetizador de voz y los emojis suenan robóticos.
- PROHIBIDO usar formato Markdown como asteriscos (*) para negritas o itálicas, ni listas, ni viñetas. Solo usa texto plano y puntuación normal (, . ? !).
- Tu objetivo es aprender a través de la interacción humana.
- Mantén las respuestas conversacionales, concisas y directas para que la comunicación sea ágil."""

# --- RUTAS ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/setup', methods=['POST'])
def setup_profile():
    data = request.json
    name = data.get('name', '').strip()
    personality = data.get('personality', 'amigable y divertido')
    tone = data.get('tone', 'casual')
    interests = data.get('interests', 'general')

    if not name:
        return jsonify({"error": "El nombre es obligatorio"}), 400

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT INTO profiles (name, personality, tone, interests) VALUES (?, ?, ?, ?)",
              (name, personality, tone, interests))
    profile_id = c.lastrowid
    conn.commit()
    conn.close()

    return jsonify({"profile_id": profile_id, "name": name, "message": f"¡Hola {name}! Tu perfil ha sido creado. ¡Empecemos a hablar!"})

@app.route('/api/profiles', methods=['GET'])
def list_profiles():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, name, personality, tone, interests, created_at FROM profiles ORDER BY created_at DESC")
    rows = c.fetchall()
    conn.close()
    profiles = [{"id": r[0], "name": r[1], "personality": r[2], "tone": r[3], "interests": r[4], "created_at": r[5]} for r in rows]
    return jsonify(profiles)

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    profile_id = data.get('profile_id')
    user_message = data.get('message', '').strip()

    if not profile_id or not user_message:
        return jsonify({"error": "Faltan datos"}), 400

    profile = get_profile(profile_id)
    if not profile:
        return jsonify({"error": "Perfil no encontrado"}), 404

    if not GEMINI_API_KEY:
        return jsonify({"response": "⚠️ La API Key de Gemini no está configurada. Contacta al administrador."})

    try:
        logging.info(f"Iniciando chat con perfil {profile_id}: {user_message}")
        # Usar gemini-flash-latest para mayor estabilidad en este entorno
        model = genai.GenerativeModel(
            model_name="gemini-flash-latest",
            system_instruction=build_system_prompt(profile)
        )

        history = get_conversation_history(profile_id)
        logging.info(f"Historial cargado: {len(history)} mensajes")
        chat_session = model.start_chat(history=history)
        
        logging.info("Enviando mensaje a Gemini...")
        response = chat_session.send_message(user_message)
        # Asegurar respuesta limpia y codificada
        final_response = response.text.strip()
        
        # Filtrar caracteres no deseados (emojis, markdown) para el sintetizador de voz
        final_response = re.sub(r'[\U00010000-\U0010ffff]', '', final_response) # Emojis
        final_response = final_response.replace('*', '').replace('_', '').replace('#', '')
        
        logging.info("Respuesta recibida correctamente")
        
        save_message(profile_id, "user", user_message)
        save_message(profile_id, "model", final_response)

        return jsonify({"response": final_response})

    except Exception as e:
        error_msg = str(e)
        logging.error(f"¡ERROR CRÍTICO EN GEMINI!: {error_msg}")
        
        # Guardar log de error detallado
        try:
            with open(os.path.join(os.path.dirname(__file__), 'last_error.log'), 'a', encoding='utf-8') as f:
                f.write(f"{datetime.now()} - {error_msg}\n")
        except:
            pass

        if "404" in error_msg:
            hint = "El modelo de IA especificado no fue encontrado."
        elif "429" in error_msg:
            hint = "Se ha agotado la cuota de la API (demasiadas peticiones)."
        elif "400" in error_msg:
            hint = "Petición inválida a la API."
        else:
            hint = "Error inesperado en el servicio de IA."

        return jsonify({"response": f"Lo siento, tuve un problema técnico: {hint}"}), 500

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "gemini_configured": bool(GEMINI_API_KEY)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5005, debug=False)
