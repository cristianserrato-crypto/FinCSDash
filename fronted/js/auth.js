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
    });
}

// ======================
// VERIFICAR
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
            document.getElementById("usuarioLabel").innerText = usuarioActual;
            mostrarVista("finance");
        }
    });
}

// ======================
// LOGIN GOOGLE (REDIRECCIÓN)
// ======================
function loginGoogle() {
    window.location.href = "http://127.0.0.1:5000/google-login";
}

// ======================
// LOGOUT
// ======================
function logout() {
    usuarioActual = null;
    mostrarVista("login");
}
