import sqlite3
import os

# --- Configuración de la base de datos ---
DB_PATH = os.path.join(os.path.dirname(__file__), 'amigoia.db')

def init_db():
    print(f"Inicializando base de datos en: {DB_PATH}")
    
    # Asegurarse de que el directorio existe
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    # Si el archivo es de 0 bytes, eliminarlo para recrearlo limpiamente
    if os.path.exists(DB_PATH) and os.path.getsize(DB_PATH) == 0:
        print("Detectado archivo de 0 bytes. Eliminando para recrear...")
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    print("Creando tabla 'profiles'...")
    c.execute('''CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        personality TEXT NOT NULL,
        tone TEXT NOT NULL,
        interests TEXT,
        voice_style TEXT DEFAULT 'mujer_dulce',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    print("Creando tabla 'conversations'...")
    c.execute('''CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profile_id) REFERENCES profiles(id)
    )''')
    
    # Crear un perfil de prueba si no hay ninguno
    c.execute("SELECT COUNT(*) FROM profiles")
    if c.fetchone()[0] == 0:
        print("Creando perfil de Jarbis...")
        c.execute("INSERT INTO profiles (name, personality, tone, interests) VALUES (?, ?, ?, ?)",
                  ("Jarbis", "IA en aprendizaje, curioso y educado", "casual y educativo", "aprender de los humanos"))
    
    conn.commit()
    conn.close()
    print("¡Base de datos inicializada correctamente!")

if __name__ == "__main__":
    init_db()
