/* 
   Configuración de Entorno
   Detecta automáticamente si estás en local o en producción.
*/

// Define aquí tu ID de Cliente de Google para que el botón de Login funcione
window.GOOGLE_CLIENT_ID = "741392813029-gao0840jino91t6rd1oeq8b972fkv1eh.apps.googleusercontent.com";

if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    window.API_URL = "http://127.0.0.1:5000";
} else if (window.location.port === "5000" || window.location.hostname.match(/\d+\.\d+\.\d+\.\d+/)) {
    // Si estamos en un servidor personal por IP o usando el puerto 5000 directamente
    window.API_URL = `${window.location.protocol}//${window.location.hostname}:5000`;
} else if (window.location.hostname.includes("online")) {
    // Producción real
    window.API_URL = `${window.location.origin}/api`;
} else {
    // Para otros casos de servidor personal (dominios locales) forzar puerto 5000
    window.API_URL = `${window.location.protocol}//${window.location.hostname}:5000`;
}
