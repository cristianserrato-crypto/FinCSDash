"""
database.py
Manejo de base de datos SQLite para FinCSDash
"""

import sqlite3
import os



DB_NAME = "fincsdash.db"

# ⚠️ ¡CUIDADO! La siguiente línea borraba la base de datos cada vez que se reiniciaba el servidor.
# La he comentado para que los usuarios que registres no se borren durante las pruebas.
# if os.path.exists(DB_NAME):
#     os.remove(DB_NAME)
def conectar_db():
    return sqlite3.connect(DB_NAME)

def crear_tablas():
    conn = conectar_db()
    cursor = conn.cursor()

    # ⚠️ BORRAR TABLAS ANTERIORES (PARA PRUEBAS)
    # cursor.execute("DROP TABLE IF EXISTS ingresos")
    # cursor.execute("DROP TABLE IF EXISTS gastos")
    # cursor.execute("DROP TABLE IF EXISTS categorias")
    # cursor.execute("DROP TABLE IF EXISTS usuarios")

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

    # --- MIGRACIÓN AUTOMÁTICA (Solución definitiva para Render) ---
    # Este bloque se asegura de que la tabla 'usuarios' tenga todas las columnas necesarias,
    # incluso si la base de datos en el servidor es una versión antigua.
    cursor.execute("PRAGMA table_info(usuarios)")
    columnas_existentes = [col[1] for col in cursor.fetchall()]

    if 'verificado' not in columnas_existentes:
        print("MIGRANDO: Agregando columna 'verificado' a la tabla 'usuarios'.")
        cursor.execute("ALTER TABLE usuarios ADD COLUMN verificado INTEGER DEFAULT 0")

    if 'codigo_verificacion' not in columnas_existentes:
        print("MIGRANDO: Agregando columna 'codigo_verificacion' a la tabla 'usuarios'.")
        cursor.execute("ALTER TABLE usuarios ADD COLUMN codigo_verificacion TEXT")

    if 'ingreso_mensual' not in columnas_existentes:
        print("MIGRANDO: Agregando columna 'ingreso_mensual' a la tabla 'usuarios'.")
        cursor.execute("ALTER TABLE usuarios ADD COLUMN ingreso_mensual REAL DEFAULT 0")

    if 'dia_pago' not in columnas_existentes:
        print("MIGRANDO: Agregando columna 'dia_pago' a la tabla 'usuarios'.")
        cursor.execute("ALTER TABLE usuarios ADD COLUMN dia_pago INTEGER DEFAULT 1")

    if 'foto_perfil' not in columnas_existentes:
        print("MIGRANDO: Agregando columna 'foto_perfil' a la tabla 'usuarios'.")
        cursor.execute("ALTER TABLE usuarios ADD COLUMN foto_perfil TEXT")
    # ---------------------------------------------------------------

    # Tabla ingresos
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ingresos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            monto REAL,
            fecha TEXT,
            categoria TEXT,
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

    # Tabla categorias
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER DEFAULT 0,
            nombre TEXT NOT NULL,
            UNIQUE(usuario_id, nombre)
        )
    """)

    # Tabla gastos recurrentes (Configuración inicial)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS gastos_recurrentes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            categoria TEXT,
            monto REAL,
            dia_limite INTEGER,
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
        )
    """)

    # Tabla metas de ahorro
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS metas_ahorro (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            nombre TEXT,
            monto_objetivo REAL,
            monto_actual REAL DEFAULT 0,
            fecha_limite TEXT,
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
        )
    """)

    # Insertar categorías predefinidas
    categorias_default = ["Salario", "Alimentación", "Transporte", "Vivienda", "Servicios", "Entretenimiento", "Salud", "Educación", "Otros"]
    for cat in categorias_default:
        cursor.execute("INSERT OR IGNORE INTO categorias (usuario_id, nombre) VALUES (0, ?)", (cat,))

    # --- MIGRACIÓN PARA INGRESOS ---
    cursor.execute("PRAGMA table_info(ingresos)")
    cols_ingresos = [col[1] for col in cursor.fetchall()]
    if 'categoria' not in cols_ingresos:
        print("MIGRANDO: Agregando columna 'categoria' a la tabla 'ingresos'.")
        cursor.execute("ALTER TABLE ingresos ADD COLUMN categoria TEXT DEFAULT 'Ingreso'")

    # 👉 COMMIT ANTES DE CERRAR
    conn.commit()
    conn.close()
