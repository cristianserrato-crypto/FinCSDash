/* 
⚠️ ARCHIVO DESACTIVADO PARA EVITAR CONFLICTOS CON app.js

// ======================
// VARIABLE DE SESIÓN
// ======================
let usuarioActual = null;

// ======================
// REGISTRO
// ======================
function register() {
    fetch("http://127.0.0.1:5000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: document.getElementById("registerEmail").value,
            password: document.getElementById("registerPassword").value
        })
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("registerResult").innerText = data.message;

        if (data.message.includes("Revisa tu correo")) {
            mostrarVista("verify");
        }
    })
    .catch(err => {
        console.error(err);
        alert("Error en el registro");
    });
}

// ======================
// VERIFICACIÓN
// ======================
function verify() {
    fetch("http://127.0.0.1:5000/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: document.getElementById("verifyEmail").value,
            codigo: document.getElementById("verifyCode").value
        })
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("verifyResult").innerText = data.message;

        if (data.message.includes("verificada")) {
            mostrarVista("login");
        }
    })
    .catch(err => {
        console.error(err);
        alert("Error al verificar");
    });
}

// ======================
// LOGIN NORMAL
// ======================
function login() {
    fetch("http://127.0.0.1:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: document.getElementById("loginEmail").value,
            password: document.getElementById("loginPassword").value
        })
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("loginResult").innerText = data.message;

        if (data.message === "Login exitoso") {
            usuarioActual = document.getElementById("loginEmail").value;
            localStorage.setItem("usuario", usuarioActual);

            document.getElementById("usuarioLabel").innerText = usuarioActual;
            mostrarVista("finance");
        }
    })
    .catch(err => {
        console.error(err);
        alert("Error en login");
    });
}

// ======================
// LOGIN CON GOOGLE
// ======================
function loginGoogle() {
    google.accounts.id.initialize({
        client_id: "TU_CLIENT_ID_DE_GOOGLE_AQUI",
        callback: handleGoogleResponse
    });

    google.accounts.id.prompt();
}

function handleGoogleResponse(response) {
    fetch("http://127.0.0.1:5000/google-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            token: response.credential
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.message.includes("exitoso")) {
            usuarioActual = data.email;
            localStorage.setItem("usuario", usuarioActual);

            document.getElementById("usuarioLabel").innerText = usuarioActual;
            mostrarVista("finance");
        } else {
            alert("Error al iniciar sesión con Google");
        }
    })
    .catch(err => {
        console.error(err);
        alert("Error en Google Login");
    });
}

// ======================
// LOGOUT
// ======================
function logout() {
    usuarioActual = null;
    localStorage.removeItem("usuario");
    mostrarVista("login");
}
*/
