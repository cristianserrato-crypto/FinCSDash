import sqlite3

# Conexión a la base de datos (se crea si no existe)
def conectar_db():
    return sqlite3.connect("fincsdash.db")

# Crear tabla de usuarios
def crear_tablas():
    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()
