// Define la dirección del servidor (Backend).
const API = "https://fincsdash-backend.onrender.com"; // ☁️ Render (Producción)
// const API = "http://127.0.0.1:5000"; // 🏠 Local (Pruebas)

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

    // INYECTAR ESTRUCTURA DEL DASHBOARD (Para asegurar que se vean los elementos)
    // Busca el elemento con ID "dashboard-view"
    const dashboard = document.getElementById("dashboard-view");
    if (dashboard) {
        // Reemplaza el contenido HTML interno con todo el diseño del panel de control
        dashboard.innerHTML = `
            <div class="dashboard-container">
            <div style="
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffeeba;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 20px;
    font-size: 0.9rem;
">
    ⚠️ <strong>FinCSDash – Versión de prueba (Demo)</strong><br>
    No ingreses datos reales o sensibles. Esta aplicación está en fase de pruebas.
</div>
                <!-- Encabezado -->
                <div class="header-bar">
                    <div class="header-left">
                         <button class="menu-toggle" onclick="toggleMenu()">☰</button>
                         <img src="./logo.png" alt="FinCSDash" class="app-logo">
                    </div>

                    <div class="header-right">
                        <!-- Balance Permanente (Mini Label) -->
                        <div id="miniBalanceContainer" style="margin-right: 15px; text-align: right; display: none;">
                            <small style="display: block; font-size: 0.7rem; opacity: 0.7; line-height: 1.2;">Saldo Actual</small>
                            <span id="miniBalanceAmount" style="font-weight: 700; font-size: 1rem;">--</span>
                        </div>

                        <button onclick="toggleDarkMode()" class="btn btn-secondary btn-sm" style="margin-right: 10px;">🌙</button>
                        <span class="user-email" id="userEmail"></span>
                        <button onclick="logout()" class="btn btn-danger btn-sm">Salir</button>
                    </div>
                </div>

                <div class="grid-dashboard">
                    <!-- Columna de Navegación -->
                    <div class="nav-column">
                        <div class="card">
                            <h4>Navegación</h4>
                            <div class="nav-buttons">
                                <button id="nav-btn-register" onclick="showDashboardView('register-movement-view')" class="btn btn-secondary w-100">Registrar</button>
                                <button id="nav-btn-summary" onclick="showDashboardView('summary-view')" class="btn btn-secondary w-100">Resumen</button>
                                <button id="nav-btn-analysis" onclick="showDashboardView('analysis-view')" class="btn btn-secondary w-100">Análisis</button>
                                <button id="nav-btn-payments" onclick="showDashboardView('payments-view')" class="btn btn-secondary w-100">Estado Pagos</button>
                                <button id="nav-btn-history" onclick="showDashboardView('history-view')" class="btn btn-secondary w-100">Historial</button>
                            </div>
                        </div>
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
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background: var(--bg-body); padding: 15px; border-radius: 8px;">
                                    <div>
                                        <small class="text-muted">Ingreso Base</small>
                                        <div id="baseIncomeDisplay" style="font-weight: bold; color: var(--success);">--</div>
                                        <!-- Contenedor para el botón de confirmar ingreso o estado -->
                                        <div id="incomeStatusContainer" style="margin-top: 5px;">
                                            <!-- Contenido dinámico: botón o texto -->
                                        </div>
                                    </div>
                                    <div style="text-align: right;">
                                        <small class="text-muted">Disponible Real (Aprox)</small>
                                        <div id="realAvailableDisplay" style="font-weight: bold; font-size: 1.2rem; color: var(--primary);">--</div>
                                    </div>
                                </div>
                                <div id="paymentsListContainer"></div>
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
    // INICIAR TOGGLE DE CONTRASEÑA
    setupPasswordToggles();
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

// Función para mostrar el Dashboard principal
function showDashboard(email) {
    hideAll();
    
    // VERIFICAR SI NECESITA ONBOARDING
    const token = localStorage.getItem("token");
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
            document.getElementById("userEmail").innerText = email;
            loadCategories();
            loadMovements();
            // Cargar estado de pagos en segundo plano
            loadPaymentStatus();
            showDashboardView('payments-view'); // Mostrar estado de pagos como principal al inicio
        }
    });
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
        'payments-view': 'nav-btn-payments'
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
        
        row.innerHTML = `
            <td>${formattedDate}</td>
            <td>${mov.categoria}</td>
            <td style="color: ${color}; font-weight: bold;">
                ${signo} ${formatCurrency(mov.monto)}
            </td>
            <td>
                <button onclick="deleteMovement(${mov.id}, '${mov.tipo}')" style="color: red; cursor: pointer;">🗑️</button>
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
    const bgColors = labels.map((cat, i) => currentChartType === "Ingreso" ? incomeColor : palette[i % palette.length]);
    
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
            const cat = d.categoria.includes(",") ? `"${d.categoria}"` : d.categoria;
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

    if (!tipo || !monto || !fecha) {
        return showToast("Completa todos los campos", 'error');
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
            fecha: fecha
        })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        showToast(data.message, 'success');
        if (data.message.includes("agregado")) {
            // Limpiar el formulario si fue exitoso
            document.getElementById("expenseAmount").value = "";
            document.getElementById("expenseDate").value = "";
            loadMovements(); // Actualizar tabla
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
            fecha: fecha
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

    // Si el menú está abierto, y el clic no fue dentro del menú ni en el botón
    if (navColumn && navColumn.classList.contains('active')) {
        if (!navColumn.contains(event.target) && (!menuToggle || !menuToggle.contains(event.target))) {
            navColumn.classList.remove('active');
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
        client_id: "741392813029-8iavkp2iqcntpb1m4d16h8t02c028naf.apps.googleusercontent.com",
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

/* ======================
   TOGGLE DE CONTRASEÑA
====================== */
function setupPasswordToggles() {
    // Selecciona todos los botones para mostrar/ocultar contraseña
    const toggleButtons = document.querySelectorAll('.toggle-password');

    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Encuentra el input de contraseña que está justo antes del botón
            const passwordInput = button.previousElementSibling;
            if (passwordInput && (passwordInput.type === 'password' || passwordInput.type === 'text')) {
                // Cambia el tipo de input
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    button.textContent = '🙈'; // Ojo cerrado
                } else {
                    passwordInput.type = 'password';
                    button.textContent = '👁️'; // Ojo abierto
                }
            }
        });
    });
}

/* ======================
   VALIDACIÓN EN TIEMPO REAL
====================== */
function setupRegisterValidation() {
    const emailInput = document.getElementById("registerEmail");
    const passInput = document.getElementById("registerPassword");
    // Selecciona el botón de registro usando su atributo onclick
    const registerBtn = document.querySelector("#register-view button[onclick='register()']");

    if (!emailInput || !passInput || !registerBtn) return;

    // Función auxiliar para crear mensajes de error debajo del input
    const createMsg = (input, id) => {
        let msg = document.getElementById(id);
        if (!msg) {
            msg = document.createElement("small");
            msg.id = id;
            msg.style.display = "none";
            msg.style.color = "var(--danger)";
            msg.style.fontSize = "0.8rem";
            msg.style.marginTop = "-10px";
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
        const passVal = passInput.value.trim();

        // Regex simple para validar email
        const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
        // Contraseña válida si tiene 6 o más caracteres
        const passIsValid = passVal.length >= 6;

        // UI Email
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

        // UI Password
        if (passVal.length > 0) {
            if (passIsValid) {
                passInput.classList.add("input-success");
                passInput.classList.remove("input-error");
                passMsg.style.display = "none";
            } else {
                passInput.classList.add("input-error");
                passInput.classList.remove("input-success");
                passMsg.innerText = "Mínimo 6 caracteres";
                passMsg.style.display = "block";
            }
        } else {
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
    
    rows.forEach(row => {
        const cat = row.querySelector(".rec-cat").value;
        const amount = row.querySelector(".rec-amount").value;
        const day = row.querySelector(".rec-day").value;
        
        if (cat && amount && day) {
            expenses.push({ categoria: cat, monto: amount, dia: day });
        }
    });

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
    fetch(`${API}/payment-status`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("baseIncomeDisplay").innerText = formatCurrency(data.ingreso_base);
        
        // Calcular disponible real (Ingreso Base - Gastos Comprometidos)
        // Nota: Esto es una proyección. El balance real es Ingresos Reales - Gastos Reales.
        const realAvailable = data.ingreso_base - data.total_comprometido;
        document.getElementById("realAvailableDisplay").innerText = formatCurrency(realAvailable);

        // Lógica para el botón de confirmar ingreso
        const incomeStatusContainer = document.getElementById("incomeStatusContainer");
        if (incomeStatusContainer) {
            if (data.income_confirmed_this_month) {
                incomeStatusContainer.innerHTML = `<span style="font-size: 0.8rem; color: var(--success); font-weight: 500;">✓ Ingreso de este mes ya registrado</span>`;
            } else if (data.ingreso_base > 0) {
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

        const today = new Date();
        const currentDay = today.getDate();

        data.pagos.forEach(pago => {
            const div = document.createElement("div");
            div.className = "card";
            div.style.padding = "15px";
            div.style.marginBottom = "10px";
            div.style.display = "flex";
            div.style.justifyContent = "space-between";
            div.style.alignItems = "center";
            div.style.borderLeft = "5px solid #ccc";

            let statusHtml = "";
            let daysLeft = pago.dia_limite - currentDay;
            
            if (pago.pagado) {
                div.style.borderLeftColor = "var(--success)";
                statusHtml = `<span style="color: var(--success); font-weight: bold;">✅ PAGADO</span>`;
            } else {
                if (daysLeft < 0) {
                    div.style.borderLeftColor = "var(--danger)";
                    statusHtml = `<span style="color: var(--danger); font-weight: bold;">⚠ VENCIDO (${Math.abs(daysLeft)} días)</span>`;
                } else if (daysLeft === 0) {
                    div.style.borderLeftColor = "orange";
                    statusHtml = `<span style="color: orange; font-weight: bold;">⚠ HOY</span>`;
                } else {
                    div.style.borderLeftColor = "var(--primary)";
                    statusHtml = `<span style="color: var(--primary); font-weight: bold;">⏳ Faltan ${daysLeft} días</span>`;
                }
                
                // Botón para pagar rápido
                statusHtml += ` <button onclick="quickPay('${pago.categoria}', ${pago.monto_esperado})" class="btn btn-sm btn-success" style="margin-left:10px;">Pagar</button>`;
            }

            div.innerHTML = `
                <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <strong>${pago.categoria}</strong>
                        <button onclick="openEditModal(${pago.id}, '${pago.categoria}', ${pago.monto_esperado}, ${pago.dia_limite})" style="background:none; border:none; cursor:pointer; font-size:0.9rem; opacity:0.6;">✏️</button>
                    </div>
                    <div class="text-muted">Vence el día ${pago.dia_limite}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.1rem; font-weight: bold;">${formatCurrency(pago.monto_esperado)}</div>
                    <div style="margin-top: 5px;">${statusHtml}</div>
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
            fecha: today
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
   EDICIÓN DE PAGOS RECURRENTES
====================== */
function openEditModal(id, categoria, monto, dia) {
    document.getElementById("editRecId").value = id;
    document.getElementById("editRecCategoryDisplay").innerText = categoria;
    document.getElementById("editRecAmount").value = monto;
    document.getElementById("editRecDay").value = dia;
    
    // Mostrar modal (usando flex para centrar gracias al CSS nuevo)
    document.getElementById("edit-recurring-modal").style.display = "flex";
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
        document.getElementById("edit-recurring-modal").style.display = "none";
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
        document.getElementById("edit-recurring-modal").style.display = "none";
        loadPaymentStatus(); // Actualizar la lista
    });
}
