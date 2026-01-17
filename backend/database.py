"""
database.py
Manejo de la base de datos SQLite para FinCSDash
"""

import sqlite3

DB_NAME = "fincsdash.db"

def conectar_db():
    """
    Conecta con la base de datos SQLite
    """
    return sqlite3.connect(DB_NAME)


def crear_tablas():
    """
    Crea la tabla de usuarios si no existe
    Incluye campos para verificación por correo
    """
    conn = conectar_db()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            codigo_verificacion TEXT,
            verificado INTEGER DEFAULT 0
        )
    """)

    conn.commit()
    conn.close()
