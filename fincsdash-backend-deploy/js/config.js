/* 
   Configuración de Entorno
   Detecta automáticamente si estás en local o en producción.
*/

// Define aquí tu ID de Cliente de Google para que el botón de Login funcione
window.GOOGLE_CLIENT_ID = "TU_ID_DE_CLIENTE_AQUI.apps.googleusercontent.com";

if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    window.API_URL = "http://127.0.0.1:5000";
} else {
    // URL de producción (Backend en AWS)
    window.API_URL = "https://api.fincsdash.online";

}