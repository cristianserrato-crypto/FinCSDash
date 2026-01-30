"""
database.py
Manejo de base de datos PostgreSQL para FinCSDash
"""

import sqlite3

# Nombre del archivo de base de datos local
DATABASE_NAME = "fincsdash.db"

# Función para conectar a la base de datos.
def conectar_db():
    # Conecta a SQLite
    return sqlite3.connect(DATABASE_NAME)

# Función principal para crear las tablas si no existen.
def crear_tablas():
    conn = conectar_db()
    cursor = conn.cursor()

    # Tabla usuarios
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT, -- Autoincremental en SQLite.
            email TEXT UNIQUE NOT NULL,           -- Correo electrónico (no se puede repetir).
            password TEXT NOT NULL,               -- Contraseña (encriptada).
            codigo_verificacion TEXT,             -- Código temporal para verificar email.
            verificado INTEGER DEFAULT 0,         -- 0 = No verificado, 1 = Verificado.
            ingreso_mensual REAL DEFAULT 0,
            dia_pago INTEGER DEFAULT 1,
            foto_perfil TEXT,
            nombre TEXT,
            apellidos TEXT,
            edad INTEGER,
            reset_token TEXT,
            reset_token_expires TEXT
        )
    """)

    # Tabla ingresos
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ingresos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER, -- Relaciona el ingreso con un usuario específico.
            monto REAL,         -- Cantidad de dinero (permite decimales).
            fecha TEXT,         -- Fecha en formato texto (YYYY-MM-DD).
            categoria TEXT DEFAULT 'Ingreso',
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id) -- Clave foránea para integridad.
        )
    """)

    # Tabla gastos
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS gastos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            tipo TEXT,          -- Categoría del gasto (ej: Comida).
            monto REAL,         
            fecha TEXT,
            es_recurrente INTEGER DEFAULT 0,
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id) 
        )
    """)

    # Tabla categorias
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER DEFAULT 0, -- 0 significa categoría global para todos.
            nombre TEXT NOT NULL,         -- Nombre de la categoría.
            UNIQUE(usuario_id, nombre)    -- Evita duplicados para el mismo usuario.
        )
    """)

    # Tabla gastos recurrentes (Configuración inicial)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS gastos_recurrentes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            categoria TEXT,
            monto REAL,
            dia_limite INTEGER, -- Día del mes límite para pagar (1-31).
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
        )
    """)

    # Tabla metas de ahorro
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS metas_ahorro (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            nombre TEXT,
            monto_objetivo REAL, -- Cuánto quiere ahorrar.
            monto_actual REAL DEFAULT 0, -- Cuánto lleva ahorrado.
            fecha_limite TEXT,   -- Para cuándo lo quiere.
            moneda TEXT DEFAULT 'COP',
            FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
        )
    """)

    # Insertar categorías predefinidas
    categorias_default = ["Salario", "Alimentación", "Transporte", "Vivienda", "Servicios", "Entretenimiento", "Salud", "Educación", "Otros"]
    # Usamos INSERT OR IGNORE para SQLite
    for cat in categorias_default:
        cursor.execute("INSERT OR IGNORE INTO categorias (usuario_id, nombre) VALUES (0, ?)", (cat,))

    conn.commit()
    conn.close()
