const API = "http://127.0.0.1:5000";
let currentUser = null;

/* ======================
   VISTAS
====================== */
function showLogin() {
    hideAll();
    document.getElementById("login-view").style.display = "block";
}

function showRegister() {
    hideAll();
    document.getElementById("register-view").style.display = "block";
}

function showVerify() {
    hideAll();
    document.getElementById("verify-view").style.display = "block";
}

function showDashboard(email) {
    hideAll();
    document.getElementById("dashboard-view").style.display = "block";
    document.getElementById("userEmail").innerText = email;
}

function hideAll() {
    document.querySelectorAll("section").forEach(s => s.style.display = "none");
}

/* ======================
   LOGIN
====================== */
function login() {
    fetch(`${API}/login`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            email: loginEmail.value,
            password: loginPassword.value
        })
    })
    .then(res => res.json())
    .then(data => {
        loginMsg.innerText = data.message;
        if (data.message === "Login exitoso") {
            currentUser = loginEmail.value;
            showDashboard(currentUser);
        }
    });
}

/* ======================
   REGISTRO
====================== */
function register() {
    fetch(`${API}/register`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            email: registerEmail.value,
            password: registerPassword.value
        })
    })
    .then(res => res.json())
    .then(data => {
        registerMsg.innerText = data.message;
        if (data.message.includes("Revisa tu correo")) {
            verifyEmail.value = registerEmail.value;
            showVerify();
        }
    });
}

/* ======================
   VERIFICAR
====================== */
function verify() {
    fetch(`${API}/verify`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            email: verifyEmail.value,
            codigo: verifyCode.value
        })
    })
    .then(res => res.json())
    .then(data => {
        verifyMsg.innerText = data.message;
        if (data.message.includes("correctamente")) {
            showLogin();
        }
    });
}

/* ======================
   LOGOUT
====================== */
function logout() {
    currentUser = null;
    showLogin();
}

/* ======================
   GOOGLE LOGIN
====================== */
window.onload = () => {
    google.accounts.id.initialize({
        client_id: "741392813029-8iavkp2iqcntpb1m4d16h8t02c028naf.apps.googleusercontent.com",
        callback: handleGoogle
    });

    google.accounts.id.renderButton(
        document.getElementById("googleBtn"),
        { theme: "outline", size: "large" }
    );
};

function handleGoogle(response) {
    fetch(`${API}/google-login`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ token: response.credential })
    })
    .then(res => res.json())
    .then(data => {
        if (data.message.includes("exitoso")) {
            currentUser = data.email;
            showDashboard(currentUser);
        }
    });
}
