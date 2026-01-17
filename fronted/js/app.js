// ======================
// SESIÓN
// ======================
let usuarioActual = null;

// ======================
// NAVEGACIÓN SPA
// ======================
function mostrarVista(vista) {
    ["login","register","verify","finance"].forEach(v =>
        document.getElementById("view-" + v).style.display = "none"
    );

    // Proteger finanzas
    if (vista === "finance" && !usuarioActual) {
        document.getElementById("view-login").style.display = "block";
        return;
    }

    document.getElementById("view-" + vista).style.display = "block";
}
