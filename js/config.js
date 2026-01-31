/* 
   Configuración de Entorno
   Detecta automáticamente si estás en local o en producción.
*/

if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    window.API_URL = "http://127.0.0.1:5000";
} else {
    // URL de producción (Backend en AWS)
    window.API_URL = "https://api.fincsdash.online"; 
}