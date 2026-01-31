// Define la dirección del servidor (Backend).
// Se inyecta desde el HTML para producción.
const API = window.API_URL || "https://api.fincsdash.online";

// Variables globales para guardar información mientras la página está abierta
let currentUser = null;
let currentMovements = []; // Para guardar los datos y poder ordenarlos
let sortAsc = true;        // Para alternar entre ascendente y descendente
let myChart = null;        // Variable global para el gráfico
let recurringExpensesTemp = []; // Para guardar temporalmente los gastos del onboarding
let currentChartType = 'Gasto'; // Tipo de gráfico actual (Gasto por defecto)

/* ======================
   ESTILOS (INYECCIÓN)
====================== */
// Cambiar fondo a blanco y botones a gris
// Este evento se ejecuta cuando el HTML termina de cargarse
document.addEventListener("DOMContentLoaded", () => {
    // Los estilos se han movido a css/styles.css para una mejor organización.

    // CREAR CONTENEDOR DE TOASTS
    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);

    // INYECTAR LIBRERÍA CHART.JS (Corrección para gráficos)
    // Verifica si ya existe el script de gráficos, si no, lo crea
    if (!document.querySelector('script[src*="chart.js"]')) {
        const script = document.createElement('script');
        // URL de la librería Chart.js
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        // Cuando termine de cargar el script, intenta dibujar el gráfico si hay datos
        script.onload = () => {
            if (currentMovements.length > 0) renderChart(currentMovements);
        };
        document.head.appendChild(script);
    }

    // INYECTAR ESTILOS PARA EMOJIS ANIMADOS
    const emojiStyle = document.createElement('style');
    emojiStyle.innerHTML = `
        @keyframes emojiBounce {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-3px) scale(1.2); }
        }
        .animated-emoji {
            display: inline-block;
            animation: emojiBounce 1.5s infinite ease-in-out;
        }
    `;
    document.head.appendChild(emojiStyle);

    // INYECTAR ESTRUCTURA DEL DASHBOARD (Para asegurar que se vean los elementos)
    // Busca el elemento con ID "dashboard-view"
    const dashboard = document.getElementById("dashboard-view");
    if (dashboard) {
        // Reemplaza el contenido HTML interno con todo el diseño del panel de control
        dashboard.innerHTML = `
            <div class="dashboard-container">
                <!-- Logo y Aviso Demo (Nueva Cabecera Superior) -->
                <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px;">
                    <img src="./logo.png" alt="FinCSDash" style="height: 110px; width: auto;">
                    <div style="
                        background: #fff3cd;
                        color: #856404;
                        border: 1px solid #ffeeba;
                        padding: 12px 16px;
                        border-radius: 8px;
                        font-size: 0.75rem;
                        flex: 1;
                    ">
                        ⚠️ <strong>FinCSDash – Versión de prueba (Demo)</strong> — No ingreses datos reales o sensibles.
                    </div>
                </div>

                <!-- Encabezado -->
                <div class="header-bar">
                    <div class="header-left">
                         <button class="menu-toggle" onclick="toggleMenu()">☰</button>
                    </div>

                    <div class="header-right">
                        <!-- Balance Permanente (Mini Label) -->
                        <div id="miniBalanceContainer" style="margin-right: 15px; text-align: right; display: none;">
                            <small style="display: block; font-size: 0.7rem; opacity: 0.7; line-height: 1.2;">Saldo Actual</small>
                            <span id="miniBalanceAmount" style="font-weight: 700; font-size: 1rem;">--</span>
                        </div>

                        <!-- PERFIL DE USUARIO -->
                        <div class="profile-container">
                            <div class="profile-avatar" onclick="toggleProfileMenu()" id="profileAvatar" style="cursor: pointer;">
                                <span id="avatarInitial">U</span>
                                <img id="avatarImage" src="" alt="Perfil" style="display:none;">
                            </div>
                            <div class="profile-dropdown" id="profileDropdown">
                                <div class="dropdown-header">
                                    <strong id="dropdownEmail">usuario@email.com</strong>
                                </div>
                                <div class="dropdown-body">
                                    <button onclick="openEditProfileModal()" class="dropdown-item">👤 Editar Perfil</button>
                                    <label for="profilePhotoInput" class="dropdown-item">📷 Cambiar Foto</label>
                                    <input type="file" id="profilePhotoInput" hidden accept="image/*" onchange="uploadProfilePhoto()">
                                    <button id="btnRemovePhoto" class="dropdown-item" onclick="removeProfilePhoto()" style="display:none; color: var(--danger);">🗑️ Eliminar Foto</button>
                                    
                                    <div class="dropdown-divider"></div>
                                    
                                    <button onclick="toggleDarkMode()" class="dropdown-item">🌙 Modo Oscuro</button>
                                    <button onclick="logout()" class="dropdown-item" style="color: var(--danger);">🚪 Cerrar Sesión</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="grid-dashboard">
                    <!-- Columna de Navegación -->
                    <div class="nav-column">
                        <div class="card">
                            <h4 style="text-align: center; text-transform: uppercase;">Navegación</h4>
                            <div class="nav-buttons">
                                <button id="nav-btn-payments" onclick="showDashboardView('payments-view')" class="btn btn-secondary w-100">Estado Pagos</button>
                                <button id="nav-btn-summary" onclick="showDashboardView('summary-view')" class="btn btn-secondary w-100">Resumen</button>
                                <button id="nav-btn-analysis" onclick="showDashboardView('analysis-view')" class="btn btn-secondary w-100">Análisis</button>
                                <button id="nav-btn-register" onclick="showDashboardView('register-movement-view')" class="btn btn-secondary w-100">Registrar</button>
                                <button id="nav-btn-savings" onclick="showDashboardView('savings-view')" class="btn btn-secondary w-100">Metas Ahorro</button>
                                <button id="nav-btn-history" onclick="showDashboardView('history-view')" class="btn btn-secondary w-100">Historial</button>
                            </div>
                        </div>

                        <!-- SECCIÓN AUTOMATIZACIÓN COMENTADA TEMPORALMENTE
                        <div class="card" style="display: none;">
                            <h4>Automatización</h4>
                            <div class="nav-buttons">
                                <button onclick="runBot()" class="btn btn-secondary w-100">🤖 Ejecutar Bot</button>
                            </div>
                        </div>
                        -->
                    </div>

                    <!-- Columna de Contenido -->
                    <div class="content-column">
                        <!-- VISTA REGISTRAR MOVIMIENTO -->
                        <div id="register-movement-view" class="dashboard-view" style="display: none;">
                            <div class="card">
                                <h4>📝 Registrar Movimiento</h4>
                                
                                <div class="form-group">
                                    <label class="form-label">Categoría</label>
                                    <select id="categoriaSelect" class="form-control"></select>
                                </div>

                                <div class="grid-2" style="grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                                    <div>
                                        <label class="form-label">Monto ($)</label>
                                        <input type="number" id="expenseAmount" placeholder="0.00" class="form-control">
                                    </div>
                                    <div>
                                        <label class="form-label">Fecha</label>
                                        <input type="date" id="expenseDate" class="form-control">
                                    </div>
                                </div>

                                <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px; background: var(--bg-body); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
                                    <input type="checkbox" id="isRecurringInput" style="width: 18px; height: 18px; cursor: pointer;">
                                    <label for="isRecurringInput" style="margin: 0; cursor: pointer; font-size: 0.9rem;">🔁 Marcar como pago mensual recurrente</label>
                                </div>

                                <div class="flex-gap" style="margin-bottom: 25px;">
                                    <button onclick="addIncome()" class="btn btn-success w-100">＋ Ingreso</button>
                                    <button onclick="addExpense()" class="btn btn-danger w-100">－ Gasto</button>
                                </div>

                                <div style="border-top: 1px solid #eee; padding-top: 20px;">
                                    <label class="form-label">Nueva Categoría</label>
                                    <div class="flex-gap">
                                        <input type="text" id="newCategoryInput" placeholder="Nombre..." class="form-control">
                                        <button onclick="addCategory()" class="btn btn-secondary">Crear</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- VISTA RESUMEN -->
                        <div id="summary-view" class="dashboard-view" style="display: none;">
                            <div class="card">
                                <h4>📊 Resumen Financiero</h4>
                                <div style="text-align: center; padding: 20px 0;">
                                    <h2 id="filteredBalanceDisplay" class="balance-title">$0.00</h2>
                                    <p class="text-muted">Balance del periodo seleccionado</p>
                                </div>
                                
                                <div class="form-group">
                                    <label class="form-label">Filtrar por Mes</label>
                                    <input type="month" id="monthFilter" onchange="filterMovements()" class="form-control">
                                </div>
                                
                                <div class="flex-gap" style="margin-top: 20px;">
                                    <button onclick="exportToCSV()" class="btn btn-secondary w-100">📄 CSV</button>
                                    <button onclick="exportToPDF()" class="btn btn-secondary w-100">📑 PDF</button>
                                </div>
                            </div>
                        </div>

                        <!-- VISTA ANÁLISIS -->
                        <div id="analysis-view" class="dashboard-view" style="display: none;">
                            <div class="card">
                                <h4>📈 Análisis Financiero</h4>
                                <div class="flex-gap" style="justify-content: center; margin-bottom: 15px;">
                                    <button id="btnChartExpense" onclick="switchChartType('Gasto')" class="btn btn-primary btn-sm">Gastos</button>
                                    <button id="btnChartIncome" onclick="switchChartType('Ingreso')" class="btn btn-secondary btn-sm">Ingresos</button>
                                </div>
                                <p class="text-muted" style="text-align: center;">Distribución de <span id="chartTitleType">Gastos</span> por categoría.</p>
                                
                                <button id="clearChartFilterBtn" onclick="filterTableByCategory(null)" class="btn btn-secondary btn-sm" style="display: none; margin-bottom: 10px;">Limpiar Filtro</button>
                                <div style="height: 350px; position: relative; margin-top: 20px;"><canvas id="expenseChart"></canvas></div>
                            </div>
                        </div>

                        <!-- VISTA HISTORIAL -->
                        <div id="history-view" class="dashboard-view" style="display: none;">
                            <div class="card">
                                <h3 style="margin-bottom: 20px;">Historial de Movimientos</h3>
                                <div style="margin-bottom: 15px;">
                                    <input type="checkbox" id="filterRecurringHistory" onchange="renderMovements(currentMovements)" style="width: auto; margin-right: 8px;">
                                    <label for="filterRecurringHistory" style="display: inline; cursor: pointer;">Ver solo gastos recurrentes</label>
                                </div>
                                <div class="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Fecha</th>
                                            <th>Categoría</th>
                                            <th onclick="sortTable('monto')" style="cursor:pointer;">Monto ↕</th>
                                            <th style="text-align: center;">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody id="movementsTableBody"></tbody>
                                </table>
                                </div>
                            </div>
                        </div>

                        <!-- VISTA ESTADO DE PAGOS (NUEVA) -->
                        <div id="payments-view" class="dashboard-view" style="display: none;">
                            <div class="card">
                                <h4>📅 Estado de Pagos Mensuales</h4>
                                
                                <!-- NUEVO: Filtro de Mes -->
                                <div class="form-group" style="margin-bottom: 15px;">
                                    <label class="form-label">Filtrar por Mes</label>
                                    <input type="month" id="paymentsMonthFilter" onchange="loadPaymentStatus()" class="form-control">
                                </div>

                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background: var(--bg-body); padding: 15px; border-radius: 8px;">
                                    <div>
                                        <small class="text-muted">Ingreso Base</small>
                                        <div id="baseIncomeDisplay" style="font-weight: bold; color: var(--success);">--</div>
                                        <!-- Contenedor para el botón de confirmar ingreso o estado -->
                                        <div id="incomeStatusContainer" style="margin-top: 5px;">
                                            <!-- Contenido dinámico: botón o texto -->
                                        </div>
                                    </div>
                                </div>
                                <div id="paymentsListContainer"></div>
                            </div>
                        </div>

                        <!-- VISTA METAS DE AHORRO -->
                        <div id="savings-view" class="dashboard-view" style="display: none;">
                            <div class="card">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                    <h4>🎯 Metas de Ahorro</h4>
                                    <button onclick="openAddSavingsModal()" class="btn btn-primary btn-sm">＋ Nueva Meta</button>
                                </div>
                                <!-- --- NUEVO: Contenedor para el precio del dólar --- -->
                                <div id="dollar-price-container" class="card" style="background: var(--bg-body); padding: 15px; margin-bottom: 20px; display: none; animation: fadeIn 0.5s;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <small class="text-muted">Precio del Dólar (TRM Aprox.)</small>
                                            <h4 id="dollar-price-display" style="margin: 5px 0;">--</h4>
                                        </div>
                                        <button id="btn-fetch-dollar" onclick="fetchDollarPrice()" class="btn btn-secondary btn-sm">Actualizar</button>
                                    </div>
                                </div>
                                <!-- --- FIN NUEVO --- -->
                                <div id="savingsListContainer"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        // Fecha por defecto hoy
        // Obtiene la fecha actual en formato ISO (YYYY-MM-DD)
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById("expenseDate");
        // Si existe el campo de fecha, le pone la fecha de hoy
        if(dateInput) dateInput.value = today;
    }

    // Cargar preferencia de Modo Oscuro
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }

    // VERIFICAR SESIÓN AL CARGAR (CORRECCIÓN F5)
    // Busca si hay un token guardado en el navegador (localStorage)
    const storedToken = localStorage.getItem("token");
    const storedEmail = localStorage.getItem("email");
    // Si hay token y email, muestra el dashboard directamente
    if (storedToken && storedEmail) {
        showDashboard(storedEmail);
    } else {
        // Si no, muestra el login
        showLogin();
    }

    // INICIAR VALIDACIÓN DE FORMULARIOS
    setupRegisterValidation();
});



/* ======================
   VISTAS
====================== */
// Función auxiliar para ajustar el diseño del contenedor principal <main>
function adjustMainLayout(isDashboard) {
    const main = document.querySelector("main");
    const header = document.querySelector("header");
    if (!main) return;

    if (isDashboard) {
        // En el Dashboard: Quitamos las restricciones de ancho y estilo de tarjeta
        // para que ocupe toda la pantalla y se vea bien en PC.
        main.style.maxWidth = "100%";
        main.style.margin = "0";
        main.style.padding = "0";
        main.style.background = "transparent";
        main.style.borderRadius = "0";
        if (header) header.style.display = "none"; // Oculta la franja superior en el Dashboard
    } else {
        // En Login/Registro: Restauramos los estilos del CSS (tarjeta centrada de 400px)
        main.style.maxWidth = "";
        main.style.margin = "";
        main.style.padding = "";
        main.style.background = "";
        main.style.borderRadius = "";
        if (header) header.style.display = ""; // Muestra la franja superior en Login/Registro
    }
}

// Función para mostrar la pantalla de Login
function showLogin() {
    hideAll();
    adjustMainLayout(false);
    const view = document.getElementById("login-view");
    view.style.display = "block";
    triggerFadeAnimation(view);
}

// Función para mostrar la pantalla de Registro
function showRegister() {
    hideAll();
    adjustMainLayout(false);
    const view = document.getElementById("register-view");
    view.style.display = "block";
    triggerFadeAnimation(view);
}

// Función para mostrar la pantalla de Verificación
function showVerify() {
    hideAll();
    adjustMainLayout(false);
    const view = document.getElementById("verify-view");
    view.style.display = "block";
    triggerFadeAnimation(view);
}

// Función para mostrar la pantalla de Olvido de Contraseña
function showForgotPassword() {
    hideAll();
    adjustMainLayout(false);
    const view = document.getElementById("forgot-password-view");
    view.style.display = "block";
    triggerFadeAnimation(view);
}

// Función para mostrar la pantalla de Reseteo con Token
function showResetPassword(token = '') {
    hideAll();
    adjustMainLayout(false);
    const view = document.getElementById("reset-password-view");
    view.style.display = "block";
    triggerFadeAnimation(view);
    if (token) document.getElementById("resetToken").value = token;
}

// Función para mostrar el formulario de perfil inicial
function showInitialProfile() {
    hideAll();
    adjustMainLayout(false); // Usar layout centrado
    const view = document.getElementById("initial-profile-view");
    view.style.display = "block";
    triggerFadeAnimation(view);
}

// Función para mostrar el Dashboard principal
function showDashboard(email) {
    hideAll();
    
    const token = localStorage.getItem("token");
    // 1. CHECK IF PROFILE IS COMPLETE
    fetch(`${API}/check-initial-profile`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json())
    .then(profileData => {
        if (profileData.needs_profile_info) {
            showInitialProfile();
        } else {
            // 2. VERIFY IF IT NEEDS ONBOARDING
            fetch(`${API}/check-onboarding`, {
                headers: { "Authorization": "Bearer " + token }
            })
            .then(res => res.json())
            .then(data => {
                if (data.needs_onboarding) {
                    startOnboarding();
                } else {
                    adjustMainLayout(true);
                    const view = document.getElementById("dashboard-view");
                    view.style.display = "block";
                    triggerFadeAnimation(view);
                    loadCategories();
                    loadMovements();
                    loadPaymentStatus();
                    loadProfile();
                    showDashboardView('payments-view');
                }
            });
        }
    }).catch(err => {
        console.error("Error checking user status:", err);
        showToast("Error al cargar tu perfil. Intenta iniciar sesión de nuevo.", "error");
        logout(); // Logout on error to avoid being stuck
    });
}

/* ======================
   CHATBOT INTERACTIVO
====================== */
let isChatInitialized = false; // Bandera para saber si ya cargamos el menú

function toggleChat() {
    const win = document.getElementById("chatbot-window");
    if (win.style.display === "flex") {
        win.style.display = "none";
    } else {
        win.style.display = "flex";
        // Enfocar el input al abrir
        setTimeout(() => document.getElementById("chatInput").focus(), 100);
        
        // Si es la primera vez que se abre, mostramos el menú
        if (!isChatInitialized) {
            renderChatMenu();
            isChatInitialized = true;
        }
    }
}

function handleChatKey(event) {
    if (event.key === "Enter") {
        sendChatMessage();
    }
}

function sendChatMessage() {
    const input = document.getElementById("chatInput");
    const message = input.value.trim();
    if (!message) return;
    
    // Limpiar input
    input.value = "";

    processChatMessage(message);
}

function processChatMessage(message) {
    // Al procesar un mensaje, eliminamos el menú anterior para que no se acumulen
    const existingMenu = document.querySelector("#chat-messages .chat-options");
    if (existingMenu) {
        existingMenu.remove();
    }

    // 1. Mostrar mensaje del usuario
    appendMessage(message, 'user');

    const token = localStorage.getItem("token");

    // 2. Enviar al backend
    fetch(`${API}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ message: message })
    })
    .then(res => res.json())
    .then(data => {
        // 3. Mostrar respuesta del bot
        appendMessage(data.response, 'bot');
        
        // Si la respuesta indica éxito, recargar movimientos
        if (data.response.includes("registrado") || data.response.includes("eliminado")) {
            loadMovements();
            loadPaymentStatus();
            if (data.response.includes("Ahorro")) loadSavingsGoals(); // Recargar metas si se actualizó ahorro
        }

        // 4. Manejo de Opciones Dinámicas vs Menú Default
        const container = document.getElementById("chat-messages");
        
        if (data.options && data.options.length > 0) {
            // Si el backend envía opciones específicas (ej. Sí/No), las mostramos
            const optionsDiv = document.createElement("div");
            optionsDiv.className = "chat-options";
            data.options.forEach(opt => {
                const btn = document.createElement("button");
                btn.className = "chat-option-btn";
                btn.innerText = opt.label;
                btn.onclick = () => processChatMessage(opt.command);
                optionsDiv.appendChild(btn);
            });
            container.appendChild(optionsDiv);
        } else {
            // Si no, mostramos el menú principal
            const newMenu = renderChatMenuOptions();
            container.appendChild(newMenu);
        }
        
        container.scrollTop = container.scrollHeight;
    })
    .catch(err => {
        appendMessage("Error de conexión con el asistente.", 'bot');
        // Mostrar menú incluso si hay error
        const container = document.getElementById("chat-messages");
        container.appendChild(renderChatMenuOptions());
        container.scrollTop = container.scrollHeight;
    });
}

function appendMessage(text, sender) {
    const container = document.getElementById("chat-messages");
    const div = document.createElement("div");
    div.className = `message ${sender}`;
    
    if (sender === 'bot') {
        // Escapar HTML para seguridad y luego animar emojis
        let safeText = escapeHtml(text);
        // Regex para detectar emojis y envolverlos en un span animado
        div.innerHTML = safeText.replace(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu, '<span class="animated-emoji">$1</span>');
    } else {
        div.innerText = text;
    }
    
    container.appendChild(div);
    // Auto-scroll al final
    container.scrollTop = container.scrollHeight;
}

function renderChatMenu() {
    const container = document.getElementById("chat-messages");
    container.innerHTML = ""; // Limpiar mensajes anteriores (ej. el hardcoded)

    appendMessage("👋 ¡Hola! Soy tu asistente financiero. Selecciona una opción rápida:", 'bot');

    const optionsDiv = renderChatMenuOptions();

    container.appendChild(optionsDiv);
    container.scrollTop = container.scrollHeight;
}

function renderChatMenuOptions() {
    const optionsDiv = document.createElement("div");
    optionsDiv.className = "chat-options";

    // Definición de las opciones del menú
    const options = [
        { label: "💰 Ver Saldo", command: "Saldo" },
        { label: "🏆 Mayor Gasto", command: "Mayor gasto" },
        { label: "🐷 Ahorrado", command: "Ahorrado" },
        { label: "💡 Frase", command: "Frase motivacional" },
        { label: "📅 Mis Pagos", command: "Pagos pendientes" },
        { label: "🗑️ Borrar Último", command: "Elimina el último gasto" },
        { label: "⚡ Gasto Rápido", command: "ACTION:QUICK_EXPENSE" }
    ];

    options.forEach(option => {
        const btn = document.createElement("button");
        btn.className = "chat-option-btn";
        btn.innerText = option.label;
        btn.onclick = () => {
            if (option.command.startsWith("PARTIAL:")) {
                // Si es parcial, solo llenamos el input y enfocamos
                const input = document.getElementById("chatInput");
                input.value = option.command.replace("PARTIAL:", "");
                input.focus();
            } else if (option.command === "ACTION:QUICK_EXPENSE") {
                showQuickExpenseForm();
            } else {
                // Si es comando completo, lo enviamos
                processChatMessage(option.command);
            }
        };
        optionsDiv.appendChild(btn);
    });

    return optionsDiv;
}

// --- FUNCIÓN PARA OBTENER FRASE MOTIVACIONAL (ANTES DÓLAR) ---
function fetchDollarPrice() {
    const display = document.getElementById("dollar-price-display");
    const button = document.getElementById("btn-fetch-dollar");
    const token = localStorage.getItem("token");

    // 1. Mostrar estado de carga
    if (display) display.innerHTML = `<span class="spinner" style="width:16px; height:16px;"></span>`;
    if (button) button.disabled = true;

    // 2. Llamar al endpoint del bot
    fetch(`${API}/run-bot`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => {
        if (!res.ok) return res.json().then(err => { throw new Error(err.message || "Error del servidor"); });
        return res.json();
    })
    .then(data => {
        if (data.status === 'success') {
            // Mostrar la frase directamente
            if (display) {
                display.innerText = `"${data.dato_extraido}"`;
                display.style.fontSize = "0.9rem"; // Ajustar tamaño para texto
                display.style.fontStyle = "italic";
            }
            showToast("Frase actualizada.", 'success');
        } else {
            if (display) display.innerText = "Error";
            showToast(data.mensaje || "No se pudo obtener el precio.", 'error');
        }
    })
    .catch(err => {
        console.error("Error al obtener frase:", err);
        if (display) display.innerText = "Error";
        showToast(`Error crítico: ${err.message}`, 'error');
    })
    .finally(() => {
        // 3. Reactivar el botón
        if (button) button.disabled = false;
    });
}

/* ======================
   FORMULARIO RÁPIDO EN CHAT
====================== */
function showQuickExpenseForm() {
    // 1. Eliminar menú de opciones anterior para limpiar la vista
    const existingMenu = document.querySelector("#chat-messages .chat-options");
    if (existingMenu) existingMenu.remove();

    const container = document.getElementById("chat-messages");
    
    // 2. Mensaje del bot
    appendMessage("📝 Ingresa los detalles del gasto:", 'bot');

    // 3. Crear contenedor del formulario
    const formDiv = document.createElement("div");
    formDiv.className = "chat-form-container";
    // Estilos en línea para asegurar que se vea bien dentro del chat
    formDiv.style.cssText = "background: var(--card-bg); padding: 12px; border-radius: 12px; border: 1px solid var(--border-color); margin-top: 8px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);";

    formDiv.innerHTML = `
        <input type="number" id="chatQuickAmount" placeholder="Monto ($)" class="form-control" style="font-size: 0.9rem; padding: 8px;">
        <input type="text" id="chatQuickCategory" placeholder="Categoría (ej: Taxi)" class="form-control" style="font-size: 0.9rem; padding: 8px;">
        <div style="display:flex; gap:8px; margin-top: 5px;">
            <button onclick="cancelQuickExpense(this)" class="btn btn-secondary btn-sm" style="flex:1;">Cancelar</button>
            <button onclick="submitQuickExpense(this)" class="btn btn-primary btn-sm" style="flex:1;">Guardar</button>
        </div>
    `;

    container.appendChild(formDiv);
    container.scrollTop = container.scrollHeight;
}

function submitQuickExpense(btnElement) {
    const container = btnElement.closest(".chat-form-container");
    const amount = document.getElementById("chatQuickAmount").value;
    const category = document.getElementById("chatQuickCategory").value;
    
    if (!amount || !category) {
        return showToast("Por favor completa ambos campos.", 'error');
    }

    // Deshabilitar botón para evitar doble envío
    btnElement.disabled = true;
    btnElement.innerText = "...";

    const token = localStorage.getItem("token");
    const today = new Date().toISOString().split('T')[0];

    fetch(`${API}/add-expense`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
            tipo: category,
            monto: amount,
            fecha: today,
            es_recurrente: false
        })
    })
    .then(res => res.json())
    .then(data => {
        container.remove(); // Eliminar formulario
        appendMessage(`✅ Gasto registrado: $${amount} en ${category}`, 'bot');
        loadMovements(); // Actualizar dashboard
        loadPaymentStatus();
        
        // Restaurar menú
        const chatContainer = document.getElementById("chat-messages");
        chatContainer.appendChild(renderChatMenuOptions());
        chatContainer.scrollTop = chatContainer.scrollHeight;
    })
    .catch(err => {
        console.error(err);
        showToast("Error al registrar gasto", 'error');
        btnElement.disabled = false;
        btnElement.innerText = "Guardar";
    });
}

function cancelQuickExpense(btnElement) {
    const container = btnElement.closest(".chat-form-container");
    container.remove();
    appendMessage("Operación cancelada.", 'bot');
    
    // Restaurar menú
    const chatContainer = document.getElementById("chat-messages");
    chatContainer.appendChild(renderChatMenuOptions());
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Función auxiliar para ocultar TODAS las secciones primero
function hideAll() {
    document.querySelectorAll("section").forEach(s => s.style.display = "none");
}

// Función auxiliar para reiniciar la animación fade-in
function triggerFadeAnimation(element) {
    if (!element) return;
    element.classList.remove('fade-in');
    void element.offsetWidth; // Trigger reflow (truco para reiniciar animación CSS)
    element.classList.add('fade-in');
}

// Función para cambiar entre vistas del dashboard
function showDashboardView(viewId) {
    // Ocultar todas las vistas del dashboard
    document.querySelectorAll('.dashboard-view').forEach(view => {
        view.style.display = 'none';
    });

    // Mostrar la vista solicitada
    const viewToShow = document.getElementById(viewId);
    if (viewToShow) {
        viewToShow.style.display = 'block';
        // Usar la nueva función auxiliar
        triggerFadeAnimation(viewToShow);
    }

    // Actualizar colores de los botones de navegación
    document.querySelectorAll('.nav-buttons .btn').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    });
    
    // Mapeo de viewId a buttonId
    const buttonIdMap = {
        'register-movement-view': 'nav-btn-register',
        'summary-view': 'nav-btn-summary',
        'analysis-view': 'nav-btn-analysis',
        'history-view': 'nav-btn-history',
        'payments-view': 'nav-btn-payments',
        'savings-view': 'nav-btn-savings'
    };

    const activeBtn = document.getElementById(buttonIdMap[viewId]);
    if (activeBtn) {
        activeBtn.classList.remove('btn-secondary');
        activeBtn.classList.add('btn-primary');
    }

    // Si la vista es el análisis, redibujar el gráfico para que se ajuste
    // al contenedor que ahora es visible.
    if (viewId === 'analysis-view' && myChart) {
        myChart.resize();
        // Asegurar que inicie en Gastos como se solicitó
        switchChartType('Gasto');
    }

    // Controlar visibilidad del balance en el header
    const miniBalance = document.getElementById("miniBalanceContainer");
    if (miniBalance) {
        // Se oculta si estamos en la vista de resumen, se muestra en las demás
        miniBalance.style.display = (viewId === 'summary-view') ? 'none' : 'block';
    }

    // En móvil, cerrar el menú al seleccionar una opción para mejorar la experiencia
    const navColumn = document.querySelector('.nav-column');
    if (navColumn && navColumn.classList.contains('active')) {
        navColumn.classList.remove('active');
    }

    if (viewId === 'payments-view') {
        loadPaymentStatus();
    }

    if (viewId === 'savings-view') {
        loadSavingsGoals();
    }
}

/* ======================
   LOGIN
====================== */
// Función que se llama al dar clic en "Ingresar"
function login() {
    fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: document.getElementById("loginEmail").value,
            password: document.getElementById("loginPassword").value
        })
    })
    .then(res => res.json())
    .then(data => {
        console.log("LOGIN RESPONSE:", data);

        if (data.token) {
            // Guardar token y email
            localStorage.setItem("token", data.token);
            localStorage.setItem("email", document.getElementById("loginEmail").value);

            // 👉 Mostrar dashboard correctamente
            showDashboard(document.getElementById("loginEmail").value);
        } else {
            alert(data.message || "Error al iniciar sesión");
            showToast(data.message || "Error al iniciar sesión", 'error');
        }
    })
    .catch(err => {
        console.error("LOGIN ERROR:", err);
        const loginMsg = document.getElementById("loginMsg");
        if (loginMsg) {
            loginMsg.innerText = err.message || "Error al iniciar sesión. Verifica tu conexión o las credenciales.";
            loginMsg.style.color = "red";
        }
        alert("Error al iniciar sesión"); // Mantenemos el alert para feedback inmediato
        showToast("Error al iniciar sesión", 'error');
    });
}

/* ======================
   UTILIDADES DE FORMATO
====================== */
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// NUEVO: Función para escapar HTML y prevenir XSS (Cross-Site Scripting)
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* ======================
   MOVIMIENTOS (TABLA)
====================== */
// Función para cargar la lista de ingresos y gastos
function loadMovements(month = null, year = null) {
    // Obtiene el token guardado
    const token = localStorage.getItem("token");
    if (!token) return; // Si no hay token, no hace nada

    // Mostrar spinner en la tabla antes de cargar
    const tbody = document.getElementById("movementsTableBody");
    // SKELETON LOADING: Barras grises en lugar de spinner
    if (tbody) {
        tbody.innerHTML = Array(5).fill(0).map(() => `
            <tr>
                <td><div class="skeleton" style="width: 80px;"></div></td>
                <td><div class="skeleton" style="width: 120px;"></div></td>
                <td><div class="skeleton" style="width: 100px;"></div></td>
                <td><div class="skeleton" style="width: 30px;"></div></td>
            </tr>
        `).join('');
    }

    // Construye la URL. Si hay mes y año, los agrega como filtros
    let url = `${API}/movements`;
    if (month && year) {
        url += `?month=${month}&year=${year}`;
    }

    // Pide los datos al servidor enviando el token de autorización
    fetch(url, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json())
    .then(data => {
        currentMovements = data; // Guardamos los datos en memoria
        renderMovements(currentMovements); // Dibujamos la tabla
        renderChart(currentMovements); // Dibujamos el gráfico
    });
}

// Función para dibujar la tabla HTML con los datos recibidos
function renderMovements(data) {
    const tbody = document.getElementById("movementsTableBody");
    if (!tbody) return;

    tbody.innerHTML = ""; // Limpiar tabla actual
    
    // --- FILTRO DE RECURRENTES ---
    const filterCheckbox = document.getElementById("filterRecurringHistory");
    if (filterCheckbox && filterCheckbox.checked) {
        // Filtramos solo los que tengan es_recurrente = 1 (true)
        data = data.filter(m => m.es_recurrente);
    }

    // Variables para calcular totales
    let totalIngresos = 0;
    let totalGastos = 0;

    // Recorre cada movimiento
    data.forEach(mov => {
        if (mov.tipo === "Ingreso") {
            totalIngresos += parseFloat(mov.monto);
        } else {
            totalGastos += parseFloat(mov.monto);
        }

        // Formatear fecha de YYYY-MM-DD a DD/MM/YYYY
        const [year, month, day] = mov.fecha.split("-");
        const formattedDate = `${day}/${month}/${year}`;

        // Crea una nueva fila (tr) para la tabla
        const row = document.createElement("tr");
        
        // Define colores: verde para ingreso, rojo para gasto
        const color = mov.tipo === "Ingreso" ? "green" : "red";
        const signo = mov.tipo === "Ingreso" ? "+" : "-";
        
        // Icono indicador de recurrente
        const iconRecurrente = mov.es_recurrente ? '<span title="Gasto Recurrente">🔁</span>' : '';

        row.innerHTML = `
            <td>${formattedDate}</td>
            <td>${escapeHtml(mov.categoria)} ${iconRecurrente}</td>
            <td style="color: ${color}; font-weight: bold;">
                ${signo} ${formatCurrency(mov.monto)}
            </td>
            <td>
                <button data-type="${escapeHtml(mov.tipo)}" onclick="deleteMovement(${mov.id}, this.dataset.type)" style="color: red; cursor: pointer;">🗑️</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // CALCULAR BALANCE TOTAL
    const balance = totalIngresos - totalGastos;

    // 1. Actualizar vista de Resumen (Grande)
    const balanceDisplay = document.getElementById("filteredBalanceDisplay");
    if (balanceDisplay) {
        balanceDisplay.innerText = formatCurrency(balance);
        balanceDisplay.style.color = balance >= 0 ? "var(--success)" : "var(--danger)";
    }

    // 2. Actualizar Mini Balance del Header (Pequeño)
    const miniBalanceAmount = document.getElementById("miniBalanceAmount");
    if (miniBalanceAmount) {
        miniBalanceAmount.innerText = formatCurrency(balance);
        miniBalanceAmount.style.color = balance >= 0 ? "var(--success)" : "var(--danger)";
    }
}


function consultarBalance() {
    const token = localStorage.getItem("token");

    fetch(`${API}/balance`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        }
    })
    .then(res => res.json())
    .then(data => {
        console.log("Balance:", data);
        alert(`Ingresos: ${data.ingresos}\nGastos: ${data.gastos}\nBalance: ${data.balance}`);
        showToast(`Balance: ${formatCurrency(data.balance)}`, 'info');
    })
    .catch(err => {
        console.error(err);
        alert("Error al consultar balance");
        showToast("Error al consultar balance", 'error');
    });
}


/* ======================
   GRÁFICO (CHART.JS)
====================== */
// Función para cambiar el tipo de gráfico
function switchChartType(type) {
    currentChartType = type;
    
    // Actualizar botones UI
    const btnExpense = document.getElementById('btnChartExpense');
    const btnIncome = document.getElementById('btnChartIncome');
    const titleType = document.getElementById('chartTitleType');
    
    if (btnExpense && btnIncome) {
        if (type === 'Gasto') {
            btnExpense.className = 'btn btn-primary btn-sm';
            btnIncome.className = 'btn btn-secondary btn-sm';
            if(titleType) titleType.innerText = 'Gastos';
        } else {
            btnExpense.className = 'btn btn-secondary btn-sm';
            btnIncome.className = 'btn btn-primary btn-sm';
            if(titleType) titleType.innerText = 'Ingresos';
        }
    }
    
    renderChart(currentMovements);
}

// Función para dibujar el gráfico
function renderChart(data) {
    const ctx = document.getElementById('expenseChart');
    if (!ctx) return; // Si no existe el canvas, no hacemos nada

    // 1. Filtrar y Agrupar por categoría según el tipo seleccionado
    const montosPorCat = {};
    data.forEach(mov => {
        if (mov.tipo !== currentChartType) return; // Solo procesar el tipo actual
        const cat = mov.categoria;
        const monto = parseFloat(mov.monto);
        montosPorCat[cat] = (montosPorCat[cat] || 0) + monto;
    });

    // Convertir ese objeto a una lista (array) para poder ordenarla
    const sortedData = Object.keys(montosPorCat).map(cat => ({
        cat: cat,
        amount: montosPorCat[cat]
    }));

    // Ordenar de mayor a menor monto
    sortedData.sort((a, b) => b.amount - a.amount);

    const labels = sortedData.map(item => item.cat);
    const values = sortedData.map(item => item.amount);

    // --- ADAPTACIÓN A MODO OSCURO ---
    const isDarkMode = document.body.classList.contains('dark-mode');

    // Paletas: Colores normales vs. Colores brillantes/neón para fondo oscuro
    const paletteLight = ['#e63946', '#f77f00', '#fcbf49', '#003049', '#d62828', '#2a9d8f', '#264653', '#457b9d'];
    const paletteDark = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#4cc9f0', '#f72585'];
    
    const palette = isDarkMode ? paletteDark : paletteLight;
    const incomeColor = isDarkMode ? '#06d6a0' : '#2ec4b6'; // Verde más brillante en oscuro
    // Usar la paleta de colores también para ingresos para poder discriminarlos
    const bgColors = labels.map((cat, i) => palette[i % palette.length]);
    
    // El borde separa los segmentos: blanco en modo claro, gris oscuro en modo oscuro
    const borderColors = labels.map(() => isDarkMode ? '#1e1e1e' : '#ffffff');

    // 2. Destruir gráfico anterior si existe (para actualizar)
    if (myChart) {
        myChart.destroy();
    }

    // 3. Crear nuevo gráfico
    if (typeof Chart !== 'undefined') {
        // Usa la librería Chart.js para crear el gráfico visual
        myChart = new Chart(ctx, {
            type: 'doughnut', // Cambiado a doughnut para mostrar leyenda y distribución
            data: {
                labels: labels,
                datasets: [{
                    label: 'Monto ($)',
                    data: values,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            color: isDarkMode ? '#e0e0e0' : '#666' // Texto blanco en modo oscuro
                        }
                    },
                    // INTERACTIVIDAD: Filtrar tabla al hacer clic
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed !== null) { label += formatCurrency(context.parsed); }
                                return label;
                            }
                        }
                    }
                }
            }
        });
        
        // Agregar evento de clic nativo al canvas para filtrar
        ctx.onclick = function(evt) {
            const points = myChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
            if (points.length) {
                const firstPoint = points[0];
                const label = myChart.data.labels[firstPoint.index];
                filterTableByCategory(label);
            } else {
                // Si se hace clic fuera, restaurar tabla completa
                filterTableByCategory(null);
            }
        };
    }
}

// Función para ordenar la tabla al hacer clic en el encabezado
function sortTable(column) {
    sortAsc = !sortAsc; // Invertir orden
    
    currentMovements.sort((a, b) => {
        // Compara números o textos según la columna
        let valA = column === 'monto' ? parseFloat(a[column]) : a[column].toString().toLowerCase();
        let valB = column === 'monto' ? parseFloat(b[column]) : b[column].toString().toLowerCase();

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    renderMovements(currentMovements);
}

// Función para filtrar la tabla por categoría (usada por el gráfico)
function filterTableByCategory(category) {
    const btn = document.getElementById("clearChartFilterBtn");

    if (!category) {
        renderMovements(currentMovements);
        showToast("Mostrando todos los movimientos", 'info');
        if (btn) btn.style.display = 'none';
        return;
    }
    const filtered = currentMovements.filter(m => m.categoria === category);
    renderMovements(filtered);
    showToast(`Filtrado por: ${category}`, 'info');
    if (btn) {
        btn.style.display = 'inline-block';
        btn.innerText = `Limpiar filtro: ${category} ✖`;
    }
}

// Función que se ejecuta cuando cambias el filtro de mes
function filterMovements() {
    const input = document.getElementById("monthFilter");
    if (!input || !input.value) return loadMovements(); // Cargar todo si está vacío

    // input.value viene como "2023-10"
    const [year, month] = input.value.split("-");
    loadMovements(month, year);
}

// Función para borrar un movimiento
function deleteMovement(id, tipo) {
    // Pregunta confirmación al usuario
    if (!confirm("¿Estás seguro de eliminar este movimiento?")) return;

    const token = localStorage.getItem("token");
    // Determinamos si es gasto o ingreso para llamar al endpoint correcto
    const endpoint = tipo === "Ingreso" ? "/delete-income" : "/delete-expense";

    // Envía la orden de borrado al servidor (DELETE)
    fetch(`${API}${endpoint}/${id}`, {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + token
        }
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        showToast(data.message, 'success');
        loadMovements(); // Recargar la tabla para ver los cambios
    });
}

/* ======================
   EXPORTAR A CSV
====================== */
// Función para descargar los datos en Excel (CSV)
function exportToCSV() {
    const token = localStorage.getItem("token");
    if (!token) return;

    const input = document.getElementById("monthFilter");
    let url = `${API}/movements`;
    let filename = "movimientos.csv";

    // Si hay filtro de fecha, lo aplicamos a la exportación
    if (input && input.value) {
        const [year, month] = input.value.split("-");
        url += `?month=${month}&year=${year}`;
        filename = `movimientos_${year}_${month}.csv`;
    }

    fetch(url, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json())
    .then(data => {
        if (!data || data.length === 0) return alert("No hay datos para exportar");
        if (!data || data.length === 0) return showToast("No hay datos para exportar", 'info');

        // Encabezados del CSV
        // Construye el contenido del archivo texto línea por línea
        let csv = "Fecha,Tipo,Categoría,Monto\n";
        data.forEach(d => {
            // Protegemos la categoría por si tiene comas
            let cat = d.categoria;
            // Prevenir CSV Injection (Fórmulas maliciosas en Excel)
            if (cat.startsWith('=') || cat.startsWith('+') || cat.startsWith('-') || cat.startsWith('@')) {
                cat = "'" + cat;
            }
            cat = cat.includes(",") ? `"${cat}"` : cat;
            csv += `${d.fecha},${d.tipo},${cat},${d.monto}\n`;
        });

        // Crear archivo blob con BOM (\uFEFF) para que Excel reconozca tildes
        // Crea un enlace invisible y le hace clic automáticamente para descargar
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    });
}

/* ======================
   EXPORTAR A PDF
====================== */
// Función para descargar reporte en PDF
function exportToPDF() {
    const token = localStorage.getItem("token");
    if (!token) return;

    const input = document.getElementById("monthFilter");
    let url = `${API}/export-pdf`;

    if (input && input.value) {
        const [year, month] = input.value.split("-");
        url += `?month=${month}&year=${year}`;
    }

    // Pide el PDF al servidor. La respuesta es un 'blob' (archivo binario)
    fetch(url, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => {
        if (!res.ok) throw new Error("Error al generar el PDF. Verifica que el logo exista y los datos sean correctos.");
        return res.blob();
    })
    .then(blob => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "reporte_gastos.pdf";
        link.click();
    })
    .catch(err => showToast(err.message, 'error'));
}

/* ======================
   AGREGAR GASTO
====================== */
// Función para registrar un nuevo gasto
function addExpense() {
    const token = localStorage.getItem("token");
    
    // Obtenemos los valores del formulario
    // Asegúrate de que tus inputs en el HTML tengan estos IDs
    const tipo = document.getElementById("categoriaSelect").value;
    const monto = document.getElementById("expenseAmount").value;
    const fecha = document.getElementById("expenseDate").value;
    const isRecurring = document.getElementById("isRecurringInput").checked;

    if (!tipo || !monto || !fecha) {
        return showToast("Completa todos los campos", 'error');
    }

    // MODIFICACIÓN: Si se marca como recurrente, SOLO se agrega a la lista de pagos mensuales (configuración),
    // pero NO se registra como transacción pagada inmediatamente.
    if (isRecurring) {
        const day = parseInt(fecha.split('-')[2]); // Extraer el día de la fecha (YYYY-MM-DD)
        
        fetch(`${API}/add-recurring-expense`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({ categoria: tipo, monto: monto, dia: day })
        })
        .then(res => res.json())
        .then(data => {
            showToast("Gasto programado mensualmente (Pendiente de pago)", 'success');
            document.getElementById("expenseAmount").value = "";
            document.getElementById("isRecurringInput").checked = false; // Resetear checkbox
            loadPaymentStatus(); // Actualizar la vista de pagos para ver el nuevo item
        })
        .catch(err => showToast("Error al programar gasto", 'error'));
        
        return; // Detenemos la ejecución aquí para no registrar el gasto todavía
    }

    // Envía los datos al servidor (POST)
    fetch(`${API}/add-expense`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
            tipo: tipo,
            monto: monto,
            fecha: fecha,
            es_recurrente: false // Siempre false aquí porque si fuera true entró al if de arriba
        })
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, 'success');
        if (data.message.includes("agregado")) {
            document.getElementById("expenseAmount").value = "";
            loadMovements(); 
        }
    })
    .catch(err => console.error(err));
}

/* ======================
   AGREGAR INGRESO
====================== */
// Función para registrar un nuevo ingreso
function addIncome() {
    const token = localStorage.getItem("token");
    const monto = document.getElementById("expenseAmount").value;
    const fecha = document.getElementById("expenseDate").value;
    const categoria = document.getElementById("categoriaSelect").value;

    if (!monto || !fecha) {
        return showToast("Completa el Monto y la Fecha", 'error');
    }

    fetch(`${API}/add-income`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
            monto: monto,
            fecha: fecha,
            categoria: categoria
        })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        showToast(data.message, 'success');
        if (data.message.includes("agregado")) {
            document.getElementById("expenseAmount").value = "";
            loadMovements(); // Actualizar tabla y gráfico
        }
    })
    .catch(err => console.error(err));
}

/* ======================
   REGISTRO
====================== */
// Función para crear una cuenta nueva
function register() {
    const email = document.getElementById("registerEmail").value;
    const password = document.getElementById("registerPassword").value;

    // Limpiar mensajes previos
    const msg = document.getElementById("registerMsg");
    if(msg) {
        msg.innerText = "";
        msg.style.color = "";
    }

    fetch(`${API}/register`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            email: email,
            password: password
        })
    })
    .then(res => {
        // Verificar si la respuesta no es exitosa (ej. 400 Bad Request, 500 Internal Server Error)
        if (!res.ok) {
            // Si no es exitosa, parsear el mensaje de error del backend
            return res.json().then(errData => {
                throw new Error(errData.message || "Error desconocido en el registro.");
            });
        }
        return res.json(); // Si es exitosa, parsear la respuesta JSON
    })
    .then(data => {
        console.log("REGISTER RESPONSE:", data); // Registrar la respuesta completa para depuración
        if(msg) msg.innerText = data.message;

        // --- LÓGICA MODIFICADA: Redirigir directamente al login si el registro es exitoso ---
        if (data.message.includes("registrado correctamente")) {
            document.getElementById("loginEmail").value = email;
            showLogin();

            const loginMsg = document.getElementById("loginMsg");
            if (loginMsg) {
                loginMsg.innerText = "Registro exitoso. Ya puedes iniciar sesión.";
                loginMsg.style.color = "green";
            }
        } else {
            // Si hay otro mensaje (ej: "usuario ya existe"), lo mostramos en rojo.
            if (msg) {
                msg.style.color = "red"; // Por ejemplo, si el usuario ya está registrado y verificado
            }
        }
    })
    .catch(err => {
        console.error("REGISTER ERROR:", err); // Registrar cualquier error de red o de parseo
        if (msg) {
            // Si el error es de conexión (común en Render al despertar el server)
            if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
                msg.innerText = "Error de conexión. El servidor puede estar iniciándose. Por favor, espera 30 segundos y vuelve a intentarlo.";
            } else {
                // Para otros errores, muestra el mensaje del backend
                msg.innerText = err.message || "Error al registrar usuario. Inténtalo de nuevo.";
            }
            msg.style.color = "red";
        }
    });
}

/* ======================
   VERIFICAR
====================== */
// Función para validar el código de verificación
function verify() {
    fetch(`${API}/verify`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            email: document.getElementById("verifyEmail").value,
            codigo: document.getElementById("verifyCode").value
        })
    })
    .then(res => res.json())
    .then(data => {
        const msg = document.getElementById("verifyMsg");
        if(msg) msg.innerText = data.message;

        if (data.message.includes("correctamente")) {
            showLogin();
        }
    });
}

/* ======================
   REENVIAR CÓDIGO
====================== */
function resendCode() {
    const email = document.getElementById("verifyEmail").value;
    const resendBtn = document.getElementById("resendBtn");
    const resendMsg = document.getElementById("resendMsg");

    if (!email) {
        if(resendMsg) {
            resendMsg.innerText = "No se encontró un email para reenviar el código.";
            resendMsg.style.color = "red";
        }
        return;
    }

    // Deshabilitar botón y mostrar estado de carga
    resendBtn.disabled = true;
    resendBtn.innerText = "Enviando...";
    if(resendMsg) {
        resendMsg.innerText = "";
        resendMsg.style.color = "";
    }

    fetch(`${API}/resend-code`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ email: email })
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(errData => { throw new Error(errData.message || "Error desconocido."); });
        }
        return res.json();
    })
    .then(data => {
        if(resendMsg) {
            resendMsg.innerText = data.message;
            resendMsg.style.color = "green";
        }
        // Iniciar temporizador de enfriamiento
        let countdown = 30;
        resendBtn.innerText = `Reenviar en ${countdown}s`;
        const interval = setInterval(() => {
            countdown--;
            resendBtn.innerText = `Reenviar en ${countdown}s`;
            if (countdown <= 0) {
                clearInterval(interval);
                resendBtn.disabled = false;
                resendBtn.innerText = "Reenviar código";
            }
        }, 1000);
    })
    .catch(err => {
        if(resendMsg) {
            resendMsg.innerText = err.message;
            resendMsg.style.color = "red";
        }
        // Reactivar botón inmediatamente en caso de error
        resendBtn.disabled = false;
        resendBtn.innerText = "Reenviar código";
    });
}

/* ======================
   MENU HAMBURGUESA
====================== */
function toggleMenu() {
    const navColumn = document.querySelector('.nav-column');
    if (navColumn) navColumn.classList.toggle('active');
}

/* ======================
   MODO OSCURO
====================== */
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    
    // Redibujar el gráfico si existen datos para aplicar los nuevos colores inmediatamente
    if (currentMovements.length > 0) {
        renderChart(currentMovements);
    }
}

// Cerrar el menú si se hace clic fuera de él
document.addEventListener('click', function(event) {
    const navColumn = document.querySelector('.nav-column');
    const menuToggle = document.querySelector('.menu-toggle');
    const profileDropdown = document.getElementById('profileDropdown');
    const profileAvatar = document.getElementById('profileAvatar');
    const chatbotWindow = document.getElementById('chatbot-window');
    const chatbotBtn = document.getElementById('chatbot-btn');

    // Si el menú está abierto, y el clic no fue dentro del menú ni en el botón
    if (navColumn && navColumn.classList.contains('active')) {
        if (!navColumn.contains(event.target) && (!menuToggle || !menuToggle.contains(event.target))) {
            navColumn.classList.remove('active');
        }
    }

    // Cerrar dropdown de perfil si se hace clic fuera
    if (profileDropdown && profileDropdown.classList.contains('active')) {
        if (!profileDropdown.contains(event.target) && !profileAvatar.contains(event.target)) {
            profileDropdown.classList.remove('active');
            profileAvatar.classList.remove('active');
        }
    }

    // Cerrar chatbot si se hace clic fuera
    if (chatbotWindow && chatbotWindow.style.display === 'flex') {
        // Verificar si el elemento clickeado sigue en el DOM (para evitar cierres al eliminar botones dinámicos)
        if (document.body.contains(event.target) && 
            !chatbotWindow.contains(event.target) && 
            (!chatbotBtn || !chatbotBtn.contains(event.target))) {
            chatbotWindow.style.display = 'none';
        }
    }
});

/* ======================
   LOGOUT
====================== */
// Función para cerrar sesión
function logout() {
    currentUser = null;
    localStorage.removeItem("token");
    localStorage.removeItem("email"); // Borrar email al salir
    showLogin();
}

/* ======================
   GOOGLE LOGIN
====================== */
// Configuración inicial de Google al cargar la página
window.onload = () => {
    // Inicializa la librería de Google con tu ID de cliente
    google.accounts.id.initialize({
        client_id: window.GOOGLE_CLIENT_ID,
        callback: handleGoogle
    });

    // Dibuja el botón de Google en el div correspondiente
    const googleBtn = document.getElementById("googleBtn");
    if (googleBtn) {
        google.accounts.id.renderButton(
            googleBtn,
            { theme: "outline", size: "large" }
        );
    }
};

// Función que maneja la respuesta de Google
function handleGoogle(response) {
    fetch(`${API}/google-login`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ token: response.credential })
    })
    .then(res => res.json())
    .then(data => {
        if (data.message.includes("exitoso")) {
            localStorage.setItem("token", data.token);
            currentUser = data.email;
            localStorage.setItem("email", currentUser); // Guardar email para F5
            showDashboard(currentUser);
        }
    });
}

/* ======================
   CATEGORÍAS
====================== */
// Función para cargar las categorías disponibles desde el servidor
function loadCategories() {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch(`${API}/categories`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => {
        if (!res.ok) throw new Error("Error cargando categorías");
        return res.json();
    })
    // Llena el menú desplegable (select) con las opciones recibidas
    .then(categorias => {
        if (!Array.isArray(categorias)) return; // Validación para evitar errores si llega un objeto de error
        const select = document.getElementById("categoriaSelect");
        if (select) {
            select.innerHTML = "";
            categorias.forEach(cat => {
                const option = document.createElement("option");
                option.value = cat;
                option.text = cat;
                select.appendChild(option);
            });
        }
    })
    .catch(err => console.error("Error categories:", err));
}

// Función para crear una nueva categoría personalizada
function addCategory() {
    const token = localStorage.getItem("token");
    const input = document.getElementById("newCategoryInput");
    const nombre = input ? input.value : "";

    if (!nombre) return showToast("Escribe un nombre para la categoría", 'error');

    fetch(`${API}/add-category`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ nombre: nombre })
    })
    .then(res => {
        if (!res.ok) {
            // Manejo robusto de errores: busca 'message' o 'msg' (JWT)
            return res.json().then(err => { 
                throw new Error(err.message || err.msg || "Error al agregar categoría"); 
            });
        }
        return res.json();
    })
    .then(data => {
        alert(data.message);
        showToast(data.message, data.message === "Categoría agregada" ? 'success' : 'info');
        if (data.message === "Categoría agregada") {
            input.value = "";
            loadCategories();
        }
    })
    .catch(err => showToast(err.message, 'error'));
}

/* ======================
   UTILIDADES (TOASTS)
====================== */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    
    container.appendChild(toast);

    // Eliminar automáticamente después de 3 segundos
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in forwards';
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
}

function saveInitialProfile() {
    const nombre = document.getElementById("profileNombre").value;
    const apellidos = document.getElementById("profileApellidos").value;
    const edad = document.getElementById("profileEdad").value;
    const token = localStorage.getItem("token");

    if (!nombre || !apellidos || !edad) {
        return showToast("Por favor, completa todos los campos.", "error");
    }

    fetch(`${API}/save-initial-profile`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ nombre, apellidos, edad })
    })
    .then(res => {
        if (!res.ok) throw new Error("Error al guardar el perfil.");
        return res.json();
    })
    .then(data => {
        showToast(data.message, "success");
        // Profile saved, now check for onboarding
        startOnboarding(); // Directly go to onboarding
    })
    .catch(err => showToast(err.message, "error"));
}

/* ======================
   VALIDACIÓN EN TIEMPO REAL
====================== */
function setupRegisterValidation() {
    const emailInput = document.getElementById("registerEmail");
    const passInput = document.getElementById("registerPassword");
    // Selecciona el botón de registro usando su atributo onclick
    const registerBtn = document.querySelector("#register-view button[onclick='register()']");

    // Llamar a la validación para el formulario de reseteo
    setupResetPasswordValidation();
 
    // NUEVO: Elementos para la barra de seguridad
    const strengthContainer = document.getElementById("password-strength-container");
    const strengthBar = document.getElementById("password-strength-bar");
    const strengthText = document.getElementById("password-strength-text");

    if (!emailInput || !passInput || !registerBtn || !strengthContainer) return;

    // Función auxiliar para crear mensajes de error debajo del input
    const createMsg = (input, id) => {
        let msg = document.getElementById(id);
        if (!msg) {
            msg = document.createElement("small");
            msg.id = id;
            msg.style.display = "none";
            msg.style.color = "var(--danger)";
            msg.style.fontSize = "0.8rem";
            msg.style.marginTop = "5px";
            msg.style.marginBottom = "10px";
            msg.style.fontWeight = "500";
            input.parentNode.insertBefore(msg, input.nextSibling);
        }
        return msg;
    };

    const emailMsg = createMsg(emailInput, "emailValMsg");
    const passMsg = createMsg(passInput, "passValMsg");

    const validate = () => {
        const emailVal = emailInput.value.trim();
        const passVal = passInput.value; // No usar trim en contraseñas

        // Regex simple para validar email
        const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
        
        // Validaciones de contraseña
        const hasLower = /[a-z]/.test(passVal);
        const hasUpper = /[A-Z]/.test(passVal);
        const hasNumber = /[0-9]/.test(passVal);
        const hasSpecial = /[^A-Za-z0-9]/.test(passVal);
        const isLongEnough = passVal.length >= 8;
        const isNotTooLong = passVal.length <= 16;

        const passIsValid = hasLower && hasUpper && hasNumber && hasSpecial && isLongEnough && isNotTooLong;

        // UI Email (sin cambios)
        if (emailVal.length > 0) {
            if (emailIsValid) {
                emailInput.classList.add("input-success");
                emailInput.classList.remove("input-error");
                emailMsg.style.display = "none";
            } else {
                emailInput.classList.add("input-error");
                emailInput.classList.remove("input-success");
                emailMsg.innerText = "Ingresa un correo válido";
                emailMsg.style.display = "block";
            }
        } else {
            emailInput.classList.remove("input-success", "input-error");
            emailMsg.style.display = "none";
        }

        // UI Contraseña y Barra de Seguridad
        if (passVal.length > 0) {
            strengthContainer.style.display = "block";
            let strength = 0;
            if (hasLower) strength++;
            if (hasUpper) strength++;
            if (hasNumber) strength++;
            if (hasSpecial) strength++;
            if (isLongEnough) strength++;

            strengthBar.className = ""; // Limpiar clases de color
            switch (strength) {
                case 1:
                    strengthBar.classList.add("weak");
                    strengthBar.style.width = "20%";
                    strengthText.innerText = "Muy débil";
                    break;
                case 2:
                    strengthBar.classList.add("medium");
                    strengthBar.style.width = "40%";
                    strengthText.innerText = "Débil";
                    break;
                case 3:
                    strengthBar.classList.add("strong");
                    strengthBar.style.width = "60%";
                    strengthText.innerText = "Regular";
                    break;
                case 4:
                    strengthBar.classList.add("strong");
                    strengthBar.style.width = "80%";
                    strengthText.innerText = "Fuerte";
                    break;
                case 5:
                    strengthBar.classList.add("very-strong");
                    strengthBar.style.width = "100%";
                    strengthText.innerText = "Muy Fuerte";
                    break;
                default:
                    strengthBar.style.width = "0%";
                    strengthText.innerText = "";
            }

            if (passIsValid) {
                passInput.classList.add("input-success");
                passInput.classList.remove("input-error");
                passMsg.style.display = "none";
            } else {
                passInput.classList.add("input-error");
                passInput.classList.remove("input-success");
                if (passVal.length > 16) {
                    passMsg.innerText = "Máximo 16 caracteres.";
                } else if (passVal.length < 8) {
                    passMsg.innerText = "Mínimo 8 caracteres.";
                } else {
                    passMsg.innerText = "Incluir Mayús, minús, núm y símbolo.";
                }
                passMsg.style.display = "block";
            }
        } else {
            strengthContainer.style.display = "none";
            passInput.classList.remove("input-success", "input-error");
            passMsg.style.display = "none";
        }

        // Estado del Botón (Solo activo si todo es válido)
        registerBtn.disabled = !(emailIsValid && passIsValid);
        registerBtn.style.opacity = (emailIsValid && passIsValid) ? "1" : "0.6";
        registerBtn.style.cursor = (emailIsValid && passIsValid) ? "pointer" : "not-allowed";
    };

    // Escuchar cuando el usuario escribe
    emailInput.addEventListener("input", validate);
    passInput.addEventListener("input", validate);
    

    // Ejecutar una vez al inicio para establecer el estado inicial del botón
    validate();
}

function setupResetPasswordValidation() {
    const passInput = document.getElementById("resetPassword");
    const resetBtn = document.querySelector("#reset-password-view button[onclick='resetPasswordWithToken()']");
 
    const strengthContainer = document.getElementById("reset-password-strength-container");
    const strengthBar = document.getElementById("reset-password-strength-bar");
    const strengthText = document.getElementById("reset-password-strength-text");

    if (!passInput || !resetBtn || !strengthContainer) return;

    const createMsg = (input, id) => {
        let msg = document.getElementById(id);
        if (!msg) {
            msg = document.createElement("small");
            msg.id = id;
            msg.style.display = "none";
            msg.style.color = "var(--danger)";
            msg.style.fontSize = "0.8rem";
            msg.style.marginTop = "5px";
            msg.style.marginBottom = "10px";
            msg.style.fontWeight = "500";
            input.parentNode.insertBefore(msg, input.nextSibling);
        }
        return msg;
    };

    const passMsg = createMsg(passInput, "resetPassValMsg");

    const validate = () => {
        const passVal = passInput.value;

        const hasLower = /[a-z]/.test(passVal);
        const hasUpper = /[A-Z]/.test(passVal);
        const hasNumber = /[0-9]/.test(passVal);
        const hasSpecial = /[^A-Za-z0-9]/.test(passVal);
        const isLongEnough = passVal.length >= 8;
        const isNotTooLong = passVal.length <= 16;

        const passIsValid = hasLower && hasUpper && hasNumber && hasSpecial && isLongEnough && isNotTooLong;

        if (passVal.length > 0) {
            strengthContainer.style.display = "block";
            let strength = 0;
            if (hasLower) strength++; if (hasUpper) strength++; if (hasNumber) strength++; if (hasSpecial) strength++; if (isLongEnough) strength++;

            strengthBar.className = "";
            switch (strength) {
                case 1: strengthBar.className = "weak"; strengthBar.style.width = "20%"; strengthText.innerText = "Muy débil"; break;
                case 2: strengthBar.className = "medium"; strengthBar.style.width = "40%"; strengthText.innerText = "Débil"; break;
                case 3: strengthBar.className = "strong"; strengthBar.style.width = "60%"; strengthText.innerText = "Regular"; break;
                case 4: strengthBar.className = "strong"; strengthBar.style.width = "80%"; strengthText.innerText = "Fuerte"; break;
                case 5: strengthBar.className = "very-strong"; strengthBar.style.width = "100%"; strengthText.innerText = "Muy Fuerte"; break;
                default: strengthBar.style.width = "0%"; strengthText.innerText = "";
            }

            if (passIsValid) {
                passInput.classList.add("input-success");
                passInput.classList.remove("input-error");
                passMsg.style.display = "none";
            } else {
                passInput.classList.add("input-error");
                passInput.classList.remove("input-success");
                if (passVal.length > 16) passMsg.innerText = "Máximo 16 caracteres.";
                else if (passVal.length < 8) passMsg.innerText = "Mínimo 8 caracteres.";
                else passMsg.innerText = "Incluir Mayús, minús, núm y símbolo.";
                passMsg.style.display = "block";
            }
        } else {
            strengthContainer.style.display = "none";
            passInput.classList.remove("input-success", "input-error");
            passMsg.style.display = "none";
        }

        // El botón de reseteo depende solo de la contraseña (y del token que se ingresa manualmente)
        resetBtn.disabled = !passIsValid;
        resetBtn.style.opacity = passIsValid ? "1" : "0.6";
        resetBtn.style.cursor = passIsValid ? "pointer" : "not-allowed";
    };

    passInput.addEventListener("input", validate);
    validate();
}

/* ======================
   ONBOARDING (WIZARD)
====================== */
function startOnboarding() {
    hideAll();
    adjustMainLayout(false); // Usar layout centrado
    document.getElementById("onboarding-view").style.display = "block";
    nextOnboardingStep(1);
    // Agregar una fila por defecto
    const list = document.getElementById("recurring-expenses-list");
    if (list.innerHTML.trim() === "") addRecurringRow();
}

function nextOnboardingStep(step) {
    document.getElementById("onboarding-step-1").style.display = "none";
    document.getElementById("onboarding-step-2").style.display = "none";
    document.getElementById("onboarding-step-3").style.display = "none";
    
    const currentStepDiv = document.getElementById(`onboarding-step-${step}`);
    if(currentStepDiv) {
        currentStepDiv.style.display = "block";
        triggerFadeAnimation(currentStepDiv);
    }
}

function addRecurringRow() {
    const container = document.getElementById("recurring-expenses-list");
    const div = document.createElement("div");
    div.className = "grid-2";
    div.style.marginBottom = "10px";
    div.style.borderBottom = "1px solid #eee";
    div.style.paddingBottom = "10px";
    
    div.innerHTML = `
        <input type="text" placeholder="Categoría (Ej: Arriendo)" class="form-control rec-cat">
        <div class="flex-gap">
            <input type="number" placeholder="Monto" class="form-control rec-amount">
            <input type="number" placeholder="Día Pago" class="form-control rec-day" min="1" max="31" style="width: 80px;">
            <button onclick="this.parentElement.parentElement.remove()" class="btn btn-danger btn-sm" style="height: fit-content; margin-top: 5px;">✖</button>
        </div>
    `;
    container.appendChild(div);
}

function finishOnboarding() {
    const income = document.getElementById("setupIncome").value;
    const payDay = document.getElementById("setupPayDay").value;
    
    if (!income || !payDay) {
        alert("Por favor completa la información del Paso 1");
        nextOnboardingStep(1);
        return;
    }

    const rows = document.querySelectorAll("#recurring-expenses-list .grid-2");
    const expenses = [];
    let errorFound = false;
    
    rows.forEach(row => {
        const cat = row.querySelector(".rec-cat").value;
        const amount = row.querySelector(".rec-amount").value;
        const day = row.querySelector(".rec-day").value;
        
        // Validación estricta: Todos los campos deben tener valor
        if (cat && amount && day) {
            expenses.push({ categoria: cat, monto: amount, dia: day });
        } else {
            errorFound = true;
        }
    });

    if (errorFound) {
        alert("Por favor completa todos los campos (Categoría, Monto y Día) de los gastos agregados.");
        return;
    }

    const token = localStorage.getItem("token");
    fetch(`${API}/save-onboarding`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
            ingreso_mensual: income,
            dia_pago: payDay,
            gastos_fijos: expenses
        })
    })
    .then(res => res.json())
    .then(data => {
        nextOnboardingStep(3); // Mostrar éxito
    });
}

function completeOnboarding() {
    const email = localStorage.getItem("email");
    showDashboard(email);
}

/* ======================
   ESTADO DE PAGOS
====================== */
function loadPaymentStatus() {
    const token = localStorage.getItem("token");
    
    // --- NUEVO: Manejo del filtro ---
    const filterInput = document.getElementById("paymentsMonthFilter");
    let url = `${API}/payment-status`;
    
    // Si el input existe pero está vacío, poner el mes actual por defecto
    if (filterInput && !filterInput.value) {
        const now = new Date();
        const monthStr = (now.getMonth() + 1).toString().padStart(2, '0');
        filterInput.value = `${now.getFullYear()}-${monthStr}`;
    }

    if (filterInput && filterInput.value) {
        const [year, month] = filterInput.value.split("-");
        url += `?month=${month}&year=${year}`;
    }

    fetch(url, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json())
    .then(data => {
        // --- ALERTA DE PRESUPUESTO (80%) ---
        const alertId = "budget-alert-banner";
        const existingAlert = document.getElementById(alertId);
        if (existingAlert) existingAlert.remove(); // Limpiar alerta previa si existe

        // Si hay ingreso base configurado y los gastos superan el 80%
        if (data.ingreso_base > 0 && data.total_gastos_mes >= (data.ingreso_base * 0.8)) {
            const percentage = Math.round((data.total_gastos_mes / data.ingreso_base) * 100);
            const card = document.querySelector("#payments-view .card");
            
            const alertDiv = document.createElement("div");
            alertDiv.id = alertId;
            alertDiv.style.cssText = `
                background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba;
                padding: 15px; border-radius: 8px; margin-bottom: 20px;
                display: flex; align-items: center; gap: 15px; animation: fadeIn 0.5s;
            `;
            alertDiv.innerHTML = `
                <div style="font-size: 24px;">⚠️</div>
                <div>
                    <strong>¡Cuidado con tus gastos!</strong>
                    <div style="font-size: 0.9rem;">Has consumido el <strong>${percentage}%</strong> de tus ingresos mensuales (${formatCurrency(data.total_gastos_mes)}).</div>
                </div>
            `;
            
            if (card) card.insertBefore(alertDiv, card.firstChild);
        }
        // ------------------------------------

        document.getElementById("baseIncomeDisplay").innerText = formatCurrency(data.ingreso_base);
        
        // Determinar si estamos viendo el mes actual para mostrar/ocultar botón de ingreso
        const today = new Date();
        const currentMonthStr = today.toISOString().slice(0, 7); // YYYY-MM
        const selectedMonthStr = filterInput ? filterInput.value : currentMonthStr;
        const isCurrentMonth = selectedMonthStr === currentMonthStr;

        // Lógica para el botón de confirmar ingreso
        const incomeStatusContainer = document.getElementById("incomeStatusContainer");
        if (incomeStatusContainer) {
            if (data.income_confirmed_this_month) {
                incomeStatusContainer.innerHTML = `<span style="font-size: 0.8rem; color: var(--success); font-weight: 500;">✓ Ingreso de este mes ya registrado</span>`;
            } else if (data.ingreso_base > 0 && isCurrentMonth) {
                incomeStatusContainer.innerHTML = `<button onclick="confirmMainIncome()" class="btn btn-success btn-sm">Confirmar Ingreso Recibido</button>`;
            } else {
                incomeStatusContainer.innerHTML = ""; // No mostrar nada si no hay ingreso base
            }
        }

        const container = document.getElementById("paymentsListContainer");
        container.innerHTML = "";

        if (data.pagos.length === 0) {
            container.innerHTML = "<p class='text-muted'>No tienes pagos recurrentes configurados.</p>";
            return;
        }

        const currentDay = today.getDate();
        // Determinar estado del mes (pasado, futuro o actual) para la lógica de colores
        let monthState = 'current';
        if (selectedMonthStr < currentMonthStr) monthState = 'past';
        else if (selectedMonthStr > currentMonthStr) monthState = 'future';

        data.pagos.forEach(pago => {
            const div = document.createElement("div");
            div.className = "card"; // Usamos la base de la tarjeta
            div.style.padding = "15px";
            div.style.marginBottom = "10px";
            div.style.transition = "transform 0.2s ease, box-shadow 0.2s ease";

            let daysLeft = pago.dia_limite - currentDay;

            // --- Definir Estado, Icono y Color ---
            let statusIcon, statusText, statusColor;
            if (pago.pagado) {
                statusIcon = '✅';
                statusText = 'Pagado';
                statusColor = 'var(--success)';
            } else {
                if (monthState === 'past') {
                    // Si es mes pasado y no pagó -> Vencido
                    statusIcon = '⚠️';
                    statusText = 'No pagado (Vencido)';
                    statusColor = 'var(--danger)';
                } else if (monthState === 'future') {
                    // Si es mes futuro -> Pendiente normal
                    statusIcon = '⏳';
                    statusText = `Vence el día ${pago.dia_limite}`;
                    statusColor = 'var(--primary)';
                } else {
                    // Mes actual (Lógica original)
                    if (daysLeft < 0) {
                        statusIcon = '⚠️';
                        statusText = `Vencido hace ${Math.abs(daysLeft)} días`;
                        statusColor = 'var(--danger)';
                    } else if (daysLeft === 0) {
                        statusIcon = '❗';
                        statusText = 'Vence Hoy';
                        statusColor = 'orange';
                    } else {
                        statusIcon = '⏳';
                        statusText = `Faltan ${daysLeft} días`;
                        statusColor = 'var(--primary)';
                    }
                }
            }

            // Aplicar borde de color
            div.style.borderLeft = `4px solid ${statusColor}`;

            // --- Construir HTML Interno con un diseño de Grid ---
            div.innerHTML = `
                <div style="display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 15px; width: 100%;">
                    <!-- Icono de Estado -->
                    <div style="font-size: 24px;">${statusIcon}</div>
                    
                    <!-- Info Principal -->
                    <div>
                        <div style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            <span>${escapeHtml(pago.categoria)}</span>
                            <button data-cat="${escapeHtml(pago.categoria)}" onclick="openEditModal(${pago.id}, this.dataset.cat, ${pago.monto_esperado}, ${pago.dia_limite})" style="background:none; border:none; cursor:pointer; font-size:0.9rem; opacity:0.6; padding:0;">✏️</button>
                        </div>
                        <div style="font-size: 0.9rem; color: ${statusColor}; font-weight: 500;">${statusText}</div>
                    </div>
                    
                    <!-- Monto y Acción -->
                    <div style="text-align: right;">
                        <div style="font-size: 1.2rem; font-weight: 700; margin-bottom: 5px;">${formatCurrency(pago.monto_esperado)}</div>
                        ${!pago.pagado 
                            ? `<button onclick="quickPay('${escapeHtml(pago.categoria)}', ${pago.monto_esperado})" class="btn btn-sm btn-success">Pagar</button>` 
                            : `<div style="font-size: 0.8rem; color: var(--text-muted);">Día de pago: ${pago.dia_limite}</div>`
                        }
                    </div>
                </div>
            `;
            container.appendChild(div);
        });
    });
}

function quickPay(categoria, monto) {
    // 1. Confirmación de seguridad
    if (!confirm(`¿Confirmar pago de ${formatCurrency(monto)} para ${categoria}?`)) return;

    const token = localStorage.getItem("token");
    // 2. Obtener fecha de hoy (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];

    // 3. Enviar petición directa al backend
    fetch(`${API}/add-expense`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
            tipo: categoria,
            monto: monto,
            fecha: today,
            es_recurrente: true // Los pagos rápidos siempre son recurrentes
        })
    })
    .then(res => res.json())
    .then(data => {
        showToast("Pago registrado exitosamente", 'success');
        loadPaymentStatus(); // Recargar la lista para que aparezca como "PAGADO"
        loadMovements();     // Actualizar historial en segundo plano
    })
    .catch(err => showToast("Error al registrar pago", 'error'));
}

function confirmMainIncome() {
    if (!confirm("¿Confirmas que has recibido tu ingreso principal de este mes? Esto registrará un nuevo movimiento de ingreso.")) return;

    const token = localStorage.getItem("token");
    fetch(`${API}/confirm-main-income`, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + token
        }
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => { throw new Error(err.message); });
        }
        return res.json();
    })
    .then(data => {
        showToast(data.message, 'success');
        // Recargar todo para que se reflejen los cambios
        loadPaymentStatus();
        loadMovements();
    })
    .catch(err => {
        showToast(err.message, 'error');
    });
}

/* ======================
   RESETEO DE CONTRASEÑA
====================== */
function requestPasswordReset() {
    const email = document.getElementById("forgotEmail").value;
    const msg = document.getElementById("forgotMsg");
    const btn = document.querySelector("#forgot-password-view button[onclick='requestPasswordReset()']");

    if (!email) {
        return showToast("Por favor, ingresa tu correo.", "error");
    }

    btn.disabled = true;
    btn.innerText = "Enviando...";
    msg.innerText = "";

    fetch(`${API}/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
    })
    .then(res => res.json())
    .then(data => {
        msg.innerText = data.message;
        msg.style.color = "var(--success)";
        showToast("Solicitud enviada. Revisa tu correo.", "success");
        // Después de enviar, cambiamos a la vista para que ingrese el token.
        setTimeout(() => {
            showResetPassword();
        }, 2500);
    })
    .catch(err => {
        msg.innerText = "Error al solicitar el reseteo.";
        msg.style.color = "var(--danger)";
        showToast("Error en la solicitud.", "error");
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerText = "Enviar Token";
    });
}

function resetPasswordWithToken() {
    const token = document.getElementById("resetToken").value;
    const password = document.getElementById("resetPassword").value;
    const msg = document.getElementById("resetMsg");
    const btn = document.querySelector("#reset-password-view button[onclick='resetPasswordWithToken()']");

    btn.disabled = true;
    btn.innerText = "Actualizando...";
    msg.innerText = "";

    fetch(`${API}/reset-password-with-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, password: password })
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(errData => { throw new Error(errData.message || "Error desconocido."); });
        }
        return res.json();
    })
    .then(data => {
        msg.innerText = data.message;
        msg.style.color = "var(--success)";
        showToast(data.message, 'success');
        // Redirigir al login después de un momento
        setTimeout(() => {
            showLogin();
        }, 3000);
    })
    .catch(err => {
        msg.innerText = err.message;
        msg.style.color = "var(--danger)";
        showToast(err.message, 'error');
    })
    .finally(() => {
        // Solo reactivar si no fue exitoso
        if (msg.style.color.includes("var(--danger)")) {
            btn.disabled = false;
            btn.innerText = "Actualizar Contraseña";
        }
    });
}

/* ======================
   EDICIÓN DE PAGOS RECURRENTES
====================== */
function openEditModal(id, categoria, monto, dia) {
    document.getElementById("editRecId").value = id;
    document.getElementById("editRecCategoryDisplay").innerText = categoria;
    document.getElementById("editRecAmount").value = monto;
    document.getElementById("editRecDay").value = dia;
    
    // Mostrar modal (usando flex para centrar gracias al CSS nuevo)
    document.getElementById("edit-recurring-modal").classList.add("active");
}

function saveRecurringEdit() {
    const id = document.getElementById("editRecId").value;
    const monto = document.getElementById("editRecAmount").value;
    const dia = document.getElementById("editRecDay").value;
    const token = localStorage.getItem("token");

    fetch(`${API}/edit-recurring-expense/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ monto: monto, dia: dia })
    })
    .then(res => res.json())
    .then(data => {
        showToast("Actualizado correctamente", 'success');
        closeModal("edit-recurring-modal");
        loadPaymentStatus(); // Recargar la lista para ver los cambios
    });
}

function deleteRecurringExpense() {
    const id = document.getElementById("editRecId").value;
    if (!confirm("¿Estás seguro de que quieres eliminar este pago recurrente?")) return;

    const token = localStorage.getItem("token");
    fetch(`${API}/delete-recurring-expense/${id}`, {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + token
        }
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, 'success');
        closeModal("edit-recurring-modal");
        loadPaymentStatus(); // Actualizar la lista
    });
}

/* ======================
   PERFIL DE USUARIO
====================== */
function toggleProfileMenu() {
    const dropdown = document.getElementById("profileDropdown");
    const avatar = document.getElementById("profileAvatar");
    dropdown.classList.toggle("active");
    avatar.classList.toggle("active");
}

function loadProfile() {
    const token = localStorage.getItem("token");
    fetch(`${API}/get-profile`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json())
    .then(data => {
        if (data.email) {
            // Actualizar email en el dropdown
            document.getElementById("dropdownEmail").innerText = data.email;
            // Actualizar nombre/email en el dropdown
            const dropdownHeader = document.getElementById("dropdownEmail");
            if (data.nombre) {
                dropdownHeader.innerHTML = `<div style="font-size:1rem;">${escapeHtml(data.nombre)}</div><div style="font-size:0.8rem; font-weight:normal; opacity:0.8;">${escapeHtml(data.email)}</div>`;
            } else {
                dropdownHeader.innerText = data.email;
            }
            
            const avatarImg = document.getElementById("avatarImage");
            const avatarInitial = document.getElementById("avatarInitial");
            const btnRemove = document.getElementById("btnRemovePhoto");

            if (data.foto_perfil) {
                // Si hay foto, mostrarla
                avatarImg.src = data.foto_perfil;
                avatarImg.style.display = "block";
                avatarInitial.style.display = "none";
                btnRemove.style.display = "flex"; // Mostrar opción de eliminar
            } else {
                // Si no, mostrar inicial
                avatarInitial.innerText = data.email.charAt(0).toUpperCase();
                // Usar inicial del nombre si existe, sino del email
                const initialSource = data.nombre || data.email;
                avatarInitial.innerText = initialSource.charAt(0).toUpperCase();
                avatarInitial.style.display = "block";
                avatarImg.style.display = "none";
                btnRemove.style.display = "none";
            }
        }
    });
}

function openEditProfileModal() {
    const token = localStorage.getItem("token");
    // Obtener datos actuales para llenar el formulario
    fetch(`${API}/get-profile`, { headers: { "Authorization": "Bearer " + token } })
    .then(res => res.json())
    .then(data => {
        document.getElementById("editProfileName").value = data.nombre || "";
        document.getElementById("editProfilePassword").value = ""; // Contraseña siempre vacía por seguridad
        document.getElementById("edit-profile-modal").classList.add("active");
    });
}

function saveProfileUpdate() {
    const nombre = document.getElementById("editProfileName").value;
    const password = document.getElementById("editProfilePassword").value;
    const token = localStorage.getItem("token");

    const body = { nombre: nombre };
    if (password) body.password = password;

    fetch(`${API}/update-profile`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify(body)
    })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, "success");
        closeModal("edit-profile-modal");
        loadProfile(); // Recargar para ver los cambios (ej. nombre en el menú)
    })
    .catch(err => showToast("Error al actualizar perfil", "error"));
}

function uploadProfilePhoto() {
    const input = document.getElementById("profilePhotoInput");
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Convertir imagen a Base64
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Image = e.target.result;
            const token = localStorage.getItem("token");

            fetch(`${API}/update-photo`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token
                },
                body: JSON.stringify({ foto: base64Image })
            })
            .then(res => res.json())
            .then(data => {
                showToast("Foto actualizada", "success");
                loadProfile(); // Recargar para ver cambios
            });
        };
        reader.readAsDataURL(file);
    }
}

function removeProfilePhoto() {
    if (!confirm("¿Quieres eliminar tu foto de perfil?")) return;
    
    const token = localStorage.getItem("token");
    fetch(`${API}/delete-photo`, {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + token
        }
    })
    .then(res => res.json())
    .then(data => {
        showToast("Foto eliminada", "info");
        loadProfile();
    });
}

/* ======================
   METAS DE AHORRO
====================== */
function loadSavingsGoals() {
    const token = localStorage.getItem("token");
    fetch(`${API}/savings-goals`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById("savingsListContainer");
        container.innerHTML = "";

        if (data.length === 0) {
            container.innerHTML = "<p class='text-muted' style='text-align:center;'>No tienes metas de ahorro aún.</p>";
            return;
        }

        data.forEach(meta => {
            const porcentaje = Math.min(100, Math.round((meta.actual / meta.objetivo) * 100));
            
            const div = document.createElement("div");
            div.className = "card";
            div.style.padding = "20px";
            div.style.marginBottom = "15px";
            div.style.border = "1px solid var(--border-color)";
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h4 style="margin:0;">${escapeHtml(meta.nombre)}</h4>
                    <button onclick="deleteSavingsGoal(${meta.id})" style="background:none; border:none; cursor:pointer; color:var(--danger);">🗑️</button>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.9rem; color:var(--text-muted);">
                    <span>${formatCurrency(meta.actual)} / ${formatCurrency(meta.objetivo)}</span>
                    <span>${porcentaje}%</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${porcentaje}%"></div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <small class="text-muted">Meta: ${meta.fecha}</small>
                    <button data-name="${escapeHtml(meta.nombre)}" onclick="openUpdateSavingsModal(${meta.id}, this.dataset.name, ${meta.actual})" class="btn btn-sm btn-success">＋ Agregar $</button>
                </div>
            `;
            container.appendChild(div);
        });
    });
}

function openAddSavingsModal() {
    document.getElementById("newSavingsName").value = "";
    document.getElementById("newSavingsTarget").value = "";
    document.getElementById("newSavingsDate").value = "";
    document.getElementById("isUsdGoal").checked = false;
    document.getElementById("add-savings-modal").classList.add("active");
}

function saveSavingsGoal() {
    const nombre = document.getElementById("newSavingsName").value;
    const objetivo = document.getElementById("newSavingsTarget").value;
    const fecha = document.getElementById("newSavingsDate").value;
    const isUSD = document.getElementById("isUsdGoal").checked;
    const moneda = isUSD ? 'USD' : 'COP';
    const token = localStorage.getItem("token");

    if (!nombre || !objetivo || !fecha) return showToast("Completa todos los campos", "error");

    fetch(`${API}/add-savings-goal`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ nombre, objetivo, fecha, moneda })
    })
    .then(res => {
        if (!res.ok) throw new Error("Error al crear la meta. Verifica los datos.");
        return res.json();
    })
    .then(data => {
        showToast("Meta creada", "success");
        closeModal("add-savings-modal");
        loadSavingsGoals();
    })
    .catch(err => {
        console.error(err);
        showToast(err.message, "error");
    });
}

function openUpdateSavingsModal(id, nombre, actual, moneda) {
    document.getElementById("updateSavingsId").value = id;
    document.getElementById("updateSavingsCurrent").value = actual;
    document.getElementById("updateSavingsNameDisplay").innerText = nombre;
    document.getElementById("addSavingsAmount").value = "";

    // Resetear el checkbox a marcado por defecto
    const deductCheckbox = document.getElementById("deductFromBalance");
    if (deductCheckbox) deductCheckbox.checked = true;

    const amountLabel = document.querySelector("#update-savings-modal .form-label");
    if (amountLabel) {
        amountLabel.innerText = `Monto a agregar (${moneda})`;
    }

    document.getElementById("update-savings-modal").classList.add("active");
}

function saveSavingsUpdate() {
    const id = document.getElementById("updateSavingsId").value;
    const current = parseFloat(document.getElementById("updateSavingsCurrent").value);
    const toAdd = parseFloat(document.getElementById("addSavingsAmount").value);
    const deduct = document.getElementById("deductFromBalance").checked; // Obtener valor del checkbox
    const token = localStorage.getItem("token");

    if (isNaN(toAdd) || toAdd <= 0) return showToast("Ingresa un monto válido", "error");

    const newTotal = current + toAdd;

    fetch(`${API}/update-savings-goal/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ 
            monto_actual: newTotal,
            monto_agregado: toAdd, // Enviamos cuánto se agregó
            crear_gasto: deduct    // Enviamos la decisión del usuario
        })
    })
    .then(res => res.json())
    .then(data => {
        showToast("Ahorro actualizado", "success");
        closeModal("update-savings-modal");
        loadSavingsGoals();
        if (deduct) {
            loadMovements(); // Recargar movimientos si se creó un gasto
            loadPaymentStatus();
        }
    });
}

function deleteSavingsGoal(id) {
    if (!confirm("¿Eliminar esta meta de ahorro?")) return;
    const token = localStorage.getItem("token");
    fetch(`${API}/delete-savings-goal/${id}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } })
    .then(() => loadSavingsGoals());
}

/* ======================
   UTILIDADES MODALES
====================== */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("active");
    }
}
/* ======================
   BOT (SELENIUM)
====================== */
// Esta función se mantiene para el botón original
function runBot() {
    // 1. Confirmación y feedback inicial
    if (!confirm("¿Estás seguro de ejecutar el bot? Esta acción puede tardar unos segundos y abrirá una ventana del navegador.")) {
        return;
    }
    showToast("🤖 Ejecutando bot... por favor espera.", 'info');

    // Deshabilitar el botón para evitar clics múltiples
    const botButton = document.querySelector("button[onclick='runBot()']");
    if (botButton) {
        botButton.disabled = true;
        // Usamos innerHTML para poder agregar el spinner
        botButton.innerHTML = `<span class="spinner" style="width:16px; height:16px; vertical-align: middle; margin-right: 8px;"></span> Ejecutando...`;
    }

    const token = localStorage.getItem("token");

    // 2. Llamada al backend
    fetch(`${API}/run-bot`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => { throw new Error(err.message || "Error en el servidor"); });
        }
        return res.json();
    })
    .then(data => {
        if (data.status === 'success') {
            showToast(`✅ ${data.mensaje}: ${data.dato_extraido}`, 'success');
        } else {
            showToast(`❌ Error del bot: ${data.mensaje}`, 'error');
        }
    })
    .catch(err => {
        console.error("Error al ejecutar el bot:", err);
        showToast(`Error crítico: ${err.message}`, 'error');
    })
    .finally(() => {
        if (botButton) {
            botButton.disabled = false;
            botButton.innerHTML = `🤖 Ejecutar Bot`;
        }
    });
}
