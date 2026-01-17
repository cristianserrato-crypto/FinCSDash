// ======================
// ESTADO GLOBAL
// ======================
let usuarioActual = null;

// ======================
// CONTROL DE VISTAS
// ======================
function ocultarTodo() {
    document.getElementById("view-login").style.display = "none";
    document.getElementById("view-register").style.display = "none";
    document.getElementById("view-verify").style.display = "none";
    document.getElementById("view-finance").style.display = "none";
}

function mostrarVista(vista) {
    ocultarTodo();

    if (vista === "login") {
        document.getElementById("view-login").style.display = "block";
    } else if (vista === "register") {
        document.getElementById("view-register").style.display = "block";
    } else if (vista === "verify") {
        document.getElementById("view-verify").style.display = "block";
    } else if (vista === "finance") {
        document.getElementById("view-finance").style.display = "block";
    }
}

// ======================
// INICIO
// ======================
document.addEventListener("DOMContentLoaded", () => {
    mostrarVista("login");
});
