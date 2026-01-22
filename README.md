# FinCSDash

FinCSDash es una aplicación web de gestión financiera personal diseñada para ayudar a los usuarios a controlar sus ingresos y gastos de manera intuitiva. Ofrece herramientas de visualización, reportes y autenticación segura.

## Características Principales

*   **Autenticación de Usuarios:**
    *   Registro de cuenta con verificación por código enviado al correo electrónico.
    *   Inicio de sesión tradicional (Email/Contraseña) y social (Google).
*   **Dashboard Financiero:**
    *   Vista resumen con el balance del periodo seleccionado.
    *   Gráficos interactivos (Doughnut Chart) para analizar gastos por categoría.
*   **Gestión de Movimientos:**
    *   Registro rápido de Ingresos y Gastos.
    *   Creación de categorías personalizadas.
    *   Edición y eliminación de registros.
*   **Historial y Reportes:**
    *   Tabla detallada de movimientos con ordenamiento.
    *   Filtrado por mes y año.
    *   **Exportación de datos:** Descarga de reportes en CSV (Excel) y PDF.
*   **Interfaz Moderna:**
    *   Diseño responsivo (adaptable a móviles y escritorio).
    *   **Modo Oscuro** integrado.

## Tecnologías Utilizadas

### Frontend
*   **HTML5 / CSS3:** Estructura y estilos personalizados.
*   **JavaScript (Vanilla):** Lógica del cliente, manejo del DOM y consumo de API.
*   **Chart.js:** Librería para la visualización de gráficos de gastos.
*   **Google Identity Services:** Integración para inicio de sesión con Google.

### Backend
*   **Python 3 & Flask:** Servidor web y API RESTful.
*   **SQLite:** Base de datos relacional ligera.
*   **Flask-JWT-Extended:** Manejo de autenticación segura mediante Tokens (JWT).
*   **FPDF:** Generación de reportes en PDF.
*   **Gmail API:** Servicio para envío de correos de verificación (requiere `gmail_service.py`).

## Instalación y Ejecución

### 1. Configuración del Backend (Servidor)

Asegúrate de tener Python instalado. Navega a la carpeta del proyecto e instala las dependencias necesarias:

```bash
pip install flask flask-cors flask-jwt-extended google-auth google-auth-oauthlib requests fpdf
```

Ejecuta el servidor:

```bash
python app.py
```
*El servidor iniciará por defecto en `http://127.0.0.1:5000`.*

### 2. Configuración del Frontend (Cliente)

1.  Abre el archivo `js/app.js`.
2.  Asegúrate de que la variable `API` apunte a tu servidor local si estás en desarrollo:
    ```javascript
    // const API = "https://fincsdash-backend.onrender.com"; // Producción
    const API = "http://127.0.0.1:5000"; // Local
    ```
3.  Abre el archivo `index.html` en tu navegador web.

## Estructura del Proyecto

*   `index.html`: Estructura principal de la interfaz de usuario.
*   `css/styles.css`: Estilos visuales de la aplicación.
*   `js/app.js`: Controlador principal del frontend (Lógica de UI, Fetch API, Gráficos).
*   `app.py`: Punto de entrada del Backend (Rutas Flask, Endpoints).
*   `database.py`: Configuración de la base de datos SQLite y creación de tablas.
*   `logo.png`: Recurso gráfico para la interfaz y reportes PDF.

## Notas Adicionales
*   El proyecto utiliza `localStorage` para mantener la sesión del usuario activa.
*   Para el funcionamiento del envío de correos, se requiere la configuración adecuada de las credenciales de Google en el backend.