/* 
   Configuración de Entorno
   Detecta automáticamente si estás en local o en producción.
*/

// Define aquí tu ID de Cliente de Google para que el botón de Login funcione
window.GOOGLE_CLIENT_ID = "741392813029-gao0840jino91t6rd1oeq8b972fkv1eh.apps.googleusercontent.com";

if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    window.API_URL = "http://127.0.0.1:5000";
} else {
    // En producción usa el mismo dominio y Nginx redirige /api al backend.
    window.API_URL = `${window.location.origin}/api`;
}
