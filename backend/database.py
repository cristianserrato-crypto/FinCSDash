"""
database.py
Manejo de base de datos SQLite para FinCSDash
"""

import sqlite3

DB_NAME = "fincsdash.db"

def conectar_db():
    return sqlite3.connect(DB_NAME)

def crear_tablas():
    conn = conectar_db()
    cursor = conn.cursor()

    # Tabla usuarios
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            codigo_verificacion TEXT,
            verificado INTEGER DEFAULT 0
        )
    """)

    # Tabla ingresos
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ingresos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            monto REAL,
            fecha TEXT,
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
        )
    """)

    # Tabla gastos
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS gastos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            tipo TEXT,
            monto REAL,
            fecha TEXT,
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
        )
    """)

    # 👉 COMMIT ANTES DE CERRAR
    conn.commit()
    conn.close()
