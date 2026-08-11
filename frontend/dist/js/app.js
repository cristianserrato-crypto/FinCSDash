// Define la dirección del servidor (Backend).
// Se inyecta desde el HTML para producción.
const API = window.API_URL || "https://api.fincsdash.online";




// Variables globales para guardar información mientras la página está abierta
let currentUser = null;
let currentMovements = []; // Para guardar los datos y poder ordenarlos
let sortAsc = true;        // Para alternar entre ascendente y descendente
let currentSortColumn = null; // Columna activa de ordenamiento en Historial
let myChart = null;        // Variable global para el gráfico
let recurringExpensesTemp = []; // Para guardar temporalmente los gastos del onboarding
let currentChartType = 'Gasto'; // Tipo de gráfico actual (Gasto por defecto)
let currentBaseIncome = 0;      // Para guardar el ingreso base y poder editarlo
let rotationInterval = null;    // Variable para controlar la rotación automática
let currentAutoWallpaperObj = null; // Para recordar cuál es el fondo automático actual (para resize)
let dashboardReconnectTimer = null;
let searchFilterActive = false; // Si hay un filtro de búsqueda aplicado en Historial

/* ======================
   SESIÓN (Recordarme)
====================== */
// Si "Recordarme" está marcado, el token vive en localStorage (persiste
// entre cierres del navegador). Si no, vive en sessionStorage (se borra
// al cerrar la pestaña/navegador).
function getToken() {
    return localStorage.getItem("token") || sessionStorage.getItem("token");
}

function setToken(token, remember) {
    if (remember) {
        localStorage.setItem("token", token);
        sessionStorage.removeItem("token");
    } else {
        sessionStorage.setItem("token", token);
        localStorage.removeItem("token");
    }
}

function clearToken() {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isRecoverableStatus(status) {
    return [0, 408, 429, 500, 502, 503, 504].includes(status);
}

async function apiFetchJson(url, options = {}, retries = 2) {
    const retryDelays = [700, 1600, 3200];
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, options);
            const contentType = response.headers.get("content-type") || "";
            const payload = contentType.includes("application/json")
                ? await response.json()
                : {
                    message: response.ok
                        ? await response.text()
                        : "Servidor temporalmente no disponible. Reintentando conexión."
                };

            if (!response.ok) {
                const error = new Error(payload.message || `Error ${response.status}`);
                error.status = response.status;
                error.recoverable = isRecoverableStatus(response.status);
                throw error;
            }

            return payload;
        } catch (error) {
            lastError = error;
            const isNetworkError = error instanceof TypeError;
            const canRetry = attempt < retries && (isNetworkError || error.recoverable);

            if (!canRetry) break;
            await delay(retryDelays[Math.min(attempt, retryDelays.length - 1)]);
        }
    }

    if (!lastError.status && lastError instanceof TypeError) {
        lastError.message = "Servidor en reconexión. Conservaremos tu sesión y reintentaremos.";
        lastError.recoverable = true;
    }

    throw lastError;
}

function isAuthExpired(error) {
    return error && (error.status === 401 || error.status === 422);
}

function retryDashboardLoad(email, error) {
    if (dashboardReconnectTimer) return;

    const message = error && error.message
        ? error.message
        : "Servidor en reconexión. Reintentando...";

    showToast(message, "info");
    dashboardReconnectTimer = setTimeout(() => {
        dashboardReconnectTimer = null;
        showDashboard(email);
    }, 3500);
}

// LISTA DE FONDOS DISPONIBLES
// Modificamos la estructura para tener ID y dos URLs (Desktop y Mobile)
// RECOMENDACIÓN: Usa fotos horizontales para 'url' y verticales para 'mobileUrl'
const wallpapers = [
    { 
        id: 'default', 
        name: 'Por defecto', 
        url: '', 
        mobileUrl: '' 
    },
    { 
        id: 'wallpaper_1', 
        name: 'Fondo 1', 
        url: 'https://s3.us-east-1.amazonaws.com/fincsdash.online/imgwallpapersdesktop/1.png', 
        mobileUrl: 'https://s3.us-east-1.amazonaws.com/fincsdash.online/imgwallpapersmobile/1.jpg' 
    },
    { 
        id: 'wallpaper_2', 
        name: 'Fondo 2', 
        url: 'https://s3.us-east-1.amazonaws.com/fincsdash.online/imgwallpapersdesktop/2.jpg', 
        mobileUrl: 'https://s3.us-east-1.amazonaws.com/fincsdash.online/imgwallpapersmobile/2.jpg' 
    },
    { 
        id: 'wallpaper_3', 
        name: 'Fondo 3', 
        url: 'https://s3.us-east-1.amazonaws.com/fincsdash.online/imgwallpapersdesktop/3.png', 
        mobileUrl: 'https://s3.us-east-1.amazonaws.com/fincsdash.online/imgwallpapersmobile/3.jpg' 
    },
    { 
        id: 'wallpaper_4', 
        name: 'Fondo 4', 
        url: 'https://s3.us-east-1.amazonaws.com/fincsdash.online/imgwallpapersdesktop/4.jpg', 
        mobileUrl: 'https://s3.us-east-1.amazonaws.com/fincsdash.online/imgwallpapersmobile/4.jpg' 
    },
    { 
        id: 'wallpaper_5', 
        name: 'Fondo 5', 
        url: 'https://s3.us-east-1.amazonaws.com/fincsdash.online/imgwallpapersdesktop/5.png', 
        mobileUrl: 'https://s3.us-east-1.amazonaws.com/fincsdash.online/imgwallpapersmobile/5.jpg' 
    }
];

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
            <!-- SideNavBar - Solid Primary Background -->
            <aside id="dashboardSidebar" class="h-screen w-64 fixed left-0 top-0 bg-primary-container border-r border-outline-variant shadow-lg flex flex-col py-md px-sm z-50">
                <div id="dashboardMenuLogo" class="dashboard-menu-logo mb-lg px-xs" onclick="toggleDashboardMenu(event)" onkeydown="if(event.key === 'Enter' || event.key === ' ') toggleDashboardMenu(event)" role="button" tabindex="0" aria-label="Mostrar menú de funciones">
                    <img src="logo.png" alt="FinCSDash">
                    <div class="dashboard-brand-copy">
                        <h1 class="font-headline-md text-headline-md font-bold text-on-primary">FinCSDash</h1>
                        <p class="font-body-md text-body-md text-on-primary-container">Wealth Management</p>
                    </div>
                </div>
                <nav class="flex-1 space-y-1">
                    <a id="nav-btn-summary" onclick="showDashboardView('summary-view')" class="nav-item flex items-center gap-sm px-xs py-sm rounded-lg text-on-primary-container hover:bg-white/10 transition-colors duration-200 cursor-pointer">
                        <span class="material-symbols-outlined">dashboard</span>
                        <span class="font-body-md text-body-md">Resumen</span>
                    </a>
                    <a id="nav-btn-payments" onclick="showDashboardView('payments-view')" class="nav-item flex items-center gap-sm px-xs py-sm rounded-lg text-on-primary-container hover:bg-white/10 transition-colors duration-200 cursor-pointer">
                        <span class="material-symbols-outlined">calendar_month</span>
                        <span class="font-body-md text-body-md">Pagos</span>
                    </a>
                    <a id="nav-btn-history" onclick="showDashboardView('history-view')" class="nav-item flex items-center gap-sm px-xs py-sm rounded-lg text-on-primary-container hover:bg-white/10 transition-colors duration-200 cursor-pointer">
                        <span class="material-symbols-outlined">receipt_long</span>
                        <span class="font-body-md text-body-md">Historial</span>
                    </a>
                    <a id="nav-btn-savings" onclick="showDashboardView('savings-view')" class="nav-item flex items-center gap-sm px-xs py-sm rounded-lg text-on-primary-container hover:bg-white/10 transition-colors duration-200 cursor-pointer">
                        <span class="material-symbols-outlined">savings</span>
                        <span class="font-body-md text-body-md">Ahorros</span>
                    </a>
                    <a id="nav-btn-analysis" onclick="showDashboardView('analysis-view')" class="nav-item flex items-center gap-sm px-xs py-sm rounded-lg text-on-primary-container hover:bg-white/10 transition-colors duration-200 cursor-pointer">
                        <span class="material-symbols-outlined">trending_up</span>
                        <span class="font-body-md text-body-md">Análisis</span>
                    </a>
                </nav>
                <button id="nav-btn-register" onclick="showDashboardView('register-movement-view')" class="nav-item mt-auto mx-xs bg-secondary-container text-on-secondary-container font-label-md text-label-md py-sm px-md rounded-full hover:opacity-90 transition-all flex items-center justify-center gap-xs shadow-md">
                    <span class="material-symbols-outlined">add</span>
                    Registrar Pago
                </button>
            </aside>

            <!-- TopNavBar - Elevated Solid Background -->
            <header class="fixed top-0 right-0 left-64 h-16 bg-white shadow-md flex justify-between items-center px-lg z-40 border-b border-outline-variant">
                <div class="flex items-center bg-surface-container rounded-full px-md py-xs w-96 border border-outline-variant">
                    <span onclick="searchExpenses()" class="material-symbols-outlined text-on-surface-variant mr-xs cursor-pointer">search</span>
                    <input id="globalSearchInput" onkeydown="if(event.key==='Enter'){event.preventDefault();searchExpenses();}" class="bg-transparent border-none focus:ring-0 text-label-md font-label-md w-full" placeholder="Buscar gastos por categoría..." type="text"/>
                </div>
                <div class="flex items-center gap-md">
                    <!-- Balance Permanente (Mini Label) -->
                    <div id="miniBalanceContainer" style="margin-right: 15px; text-align: right; display: none;">
                        <small style="display: block; font-size: 0.7rem; opacity: 0.7; line-height: 1.2;">Saldo Actual</small>
                        <span id="miniBalanceAmount" style="font-weight: 700; font-size: 1rem;">--</span>
                    </div>

                    <div class="relative" style="position: relative;">
                        <button id="alertsBtn" onclick="toggleAlertsMenu(event)" class="hover:bg-surface-container rounded-full p-2 transition-transform scale-95 relative">
                            <span class="material-symbols-outlined text-on-surface-variant">notifications</span>
                            <span id="alertsBadge" class="alerts-badge" style="display:none;">0</span>
                        </button>
                        <div id="alertsDropdown" class="profile-dropdown" style="width: 320px; right: 0;">
                            <div class="dropdown-header">Pagos vencidos</div>
                            <div id="alertsList" class="dropdown-body" style="max-height: 280px; overflow-y: auto;"></div>
                        </div>
                    </div>
                    <div class="flex items-center gap-xs ml-sm border-l border-outline-variant pl-md relative">
                        <div class="flex items-center gap-xs cursor-pointer" onclick="toggleProfileMenu()" id="profileAvatar">
                            <div class="w-8 h-8 rounded-full bg-surface-container-high overflow-hidden border border-outline-variant flex items-center justify-center font-bold text-primary">
                                <span id="avatarInitial">U</span>
                                <img id="avatarImage" src="" alt="Perfil" style="display:none;" class="w-full h-full object-cover">
                            </div>
                            <span class="font-label-md text-label-md text-primary font-bold" id="dropdownEmail">usuario@email.com</span>
                        </div>
                        
                        <!-- Dropdown Menu -->
                        <div class="profile-dropdown absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-outline-variant py-xs z-50" id="profileDropdown">
                            <div class="py-xs dropdown-body">
                                <button onclick="openEditProfileModal()" class="dropdown-item w-full text-left px-md py-sm text-sm text-on-surface hover:bg-surface-container transition-colors flex items-center gap-xs">👤 Editar Perfil</button>
                                <label for="profilePhotoInput" class="dropdown-item w-full text-left px-md py-sm text-sm text-on-surface hover:bg-surface-container transition-colors flex items-center gap-xs cursor-pointer">📷 Cambiar Foto</label>
                                <input type="file" id="profilePhotoInput" hidden accept="image/*" onchange="uploadProfilePhoto()">
                                <button id="btnRemovePhoto" class="dropdown-item w-full text-left px-md py-sm text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-xs" onclick="removeProfilePhoto()" style="display:none;">🗑️ Eliminar Foto</button>
                                
                                <div class="dropdown-divider border-t border-outline-variant my-xs"></div>
                                
                                <button id="darkModeToggleBtn" onclick="toggleDarkMode()" class="dropdown-item w-full text-left px-md py-sm text-sm text-on-surface hover:bg-surface-container transition-colors flex items-center gap-xs">🌙 Modo Oscuro</button>
                                <button onclick="logout()" class="dropdown-item w-full text-left px-md py-sm text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-xs font-bold">🚪 Cerrar Sesión</button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <!-- Main Content Canvas -->
            <div class="ml-64 mt-16 p-lg">
                <div class="max-w-container-max mx-auto space-y-lg">
                    
                    <!-- VISTA ESTADO DE PAGOS -->
                    <div id="payments-view" class="dashboard-view space-y-lg" style="display: none;">
                        <div class="flex justify-between items-end bg-surface-container-low p-md rounded-xl border border-outline-variant shadow-sm">
                            <div>
                                <h2 class="font-headline-lg text-headline-lg text-primary">Estado de Pagos Mensuales</h2>
                                <p class="font-body-lg text-body-lg text-on-surface-variant">Administra tus obligaciones recurrentes y realiza el seguimiento de vencimientos.</p>
                            </div>
                            <div class="flex gap-sm">
                                <div class="flex items-center gap-xs">
                                    <input type="month" id="paymentsMonthFilter" onchange="loadPaymentStatus()" class="bg-white border border-outline-variant rounded-lg font-label-sm text-label-sm focus:ring-primary px-sm py-xs">
                                </div>
                            </div>
                        </div>

                        <div class="bg-white p-md rounded-xl border border-outline-variant shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-md">
                            <div>
                                <span class="font-label-sm text-label-sm text-on-surface-variant block uppercase tracking-wider">Ingreso Mensual Base</span>
                                <div class="flex items-center gap-sm mt-xs">
                                    <h3 id="baseIncomeDisplay" class="font-headline-lg text-headline-lg text-secondary font-bold">--</h3>
                                    <button onclick="openEditBaseIncomeModal()" class="hover:bg-surface-container rounded-full p-1.5 transition-colors flex items-center justify-center text-on-surface-variant" title="Editar Ingreso Base">
                                        <span class="material-symbols-outlined text-sm">edit</span>
                                    </button>
                                </div>
                                <div id="incomeStatusContainer" class="mt-xs"></div>
                            </div>
                            <div class="flex gap-md bg-surface-container-low p-sm rounded-lg border border-outline-variant">
                                <div class="flex items-center gap-xs">
                                    <span class="w-3 h-3 rounded-full bg-secondary"></span>
                                    <span class="font-label-sm text-label-sm text-primary">Pagado</span>
                                </div>
                                <div class="flex items-center gap-xs">
                                    <span class="w-3 h-3 rounded-full bg-primary-container"></span>
                                    <span class="font-label-sm text-label-sm text-primary">Pendiente</span>
                                </div>
                                <div class="flex items-center gap-xs">
                                    <span class="w-3 h-3 rounded-full bg-error"></span>
                                    <span class="font-label-sm text-label-sm text-primary">Vencido</span>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-xl overflow-hidden shadow-sm border border-outline-variant">
                            <div class="p-md border-b border-outline-variant bg-surface-container-low">
                                <h4 class="font-headline-md text-headline-md text-primary">Lista de Pagos</h4>
                            </div>
                            <div id="paymentsListContainer" class="p-md space-y-sm"></div>
                        </div>
                    </div>

                    <!-- VISTA RESUMEN -->
                    <div id="summary-view" class="dashboard-view space-y-lg" style="display: none;">
                        <div class="flex justify-between items-end bg-surface-container-low p-md rounded-xl border border-outline-variant shadow-sm">
                            <div>
                                <h2 class="font-headline-lg text-headline-lg text-primary">Resumen Financiero</h2>
                                <p class="font-body-lg text-body-lg text-on-surface-variant">Revisa tu balance general, filtra periodos y exporta tus datos.</p>
                            </div>
                        </div>

                        <div class="grid grid-cols-12 gap-md">
                            <div class="col-span-12 md:col-span-6 bg-secondary text-on-secondary p-md rounded-xl flex flex-col justify-between overflow-hidden shadow-lg min-h-[200px]">
                                <div>
                                    <p class="font-label-md text-label-md text-secondary-fixed-dim opacity-90 mb-xs">Balance del Periodo Seleccionado</p>
                                    <h3 id="filteredBalanceDisplay" class="font-display text-display text-white font-bold">$0.00</h3>
                                </div>
                                <div class="flex items-center gap-xs text-secondary-fixed mt-sm">
                                    <span class="material-symbols-outlined">account_balance_wallet</span>
                                    <span class="font-numeric-data text-numeric-data">Estado de cuenta actualizado</span>
                                </div>
                            </div>

                            <div class="col-span-12 md:col-span-6 bg-white p-md rounded-xl border border-outline-variant shadow-sm flex flex-col justify-between">
                                <div>
                                    <h4 class="font-headline-md text-headline-md text-primary mb-sm">Filtrar Periodo</h4>
                                    <p class="font-body-md text-body-md text-on-surface-variant mb-md">Selecciona el mes y año para filtrar tus movimientos en el resumen y análisis.</p>
                                </div>
                                <div class="mt-auto">
                                    <input type="month" id="monthFilter" onchange="filterMovements()" class="w-full bg-surface-container-low border border-outline-variant rounded-lg font-label-md text-label-md focus:ring-primary px-md py-sm">
                                </div>
                            </div>

                            <div class="col-span-12 bg-white p-md rounded-xl border border-outline-variant shadow-sm">
                                <h4 class="font-headline-md text-headline-md text-primary mb-sm">Exportar Reportes</h4>
                                <p class="font-body-md text-body-md text-on-surface-variant mb-md">Descarga el historial completo de transacciones en formato estructurado o documento PDF listo para imprimir.</p>
                                <div class="flex flex-col sm:flex-row gap-sm">
                                    <button onclick="exportToCSV()" class="flex-1 bg-white border border-primary text-primary px-md py-sm rounded-lg font-label-md text-label-md flex items-center justify-center gap-xs hover:bg-surface-container transition-colors shadow-sm font-bold">
                                        <span class="material-symbols-outlined">download</span>
                                        Descargar CSV
                                    </button>
                                    <button onclick="exportToPDF()" class="flex-1 bg-primary text-on-primary px-md py-sm rounded-lg font-label-md text-label-md flex items-center justify-center gap-xs hover:opacity-90 transition-colors shadow-sm font-bold">
                                        <span class="material-symbols-outlined">picture_as_pdf</span>
                                        Descargar PDF
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- VISTA ANÁLISIS -->
                    <div id="analysis-view" class="dashboard-view space-y-lg" style="display: none;">
                        <div class="flex justify-between items-end bg-surface-container-low p-md rounded-xl border border-outline-variant shadow-sm">
                            <div>
                                <h2 class="font-headline-lg text-headline-lg text-primary">Análisis Financiero</h2>
                                <p class="font-body-lg text-body-lg text-on-surface-variant">Analiza la distribución de tus ingresos y gastos de manera visual.</p>
                            </div>
                        </div>

                        <div class="bg-white p-md rounded-xl shadow-sm border border-outline-variant">
                            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-md border-b border-outline-variant pb-md mb-md">
                                <div>
                                    <h4 class="font-headline-md text-headline-md text-primary">Distribución de <span id="chartTitleType">Gastos</span></h4>
                                    <p class="font-label-sm text-label-sm text-on-surface-variant mt-0.5">Haz clic en una sección del gráfico para filtrar transacciones.</p>
                                </div>
                                <div class="flex items-center gap-sm">
                                    <button id="clearChartFilterBtn" onclick="filterTableByCategory(null)" class="border border-outline-variant text-primary px-sm py-1.5 rounded-lg font-label-sm text-label-sm hover:bg-surface-container transition-colors bg-white hidden">
                                        Limpiar Filtro
                                    </button>
                                    <div class="flex bg-surface-container-low p-xs rounded-lg border border-outline-variant gap-xs">
                                        <button id="btnChartExpense" onclick="switchChartType('Gasto')" class="btn btn-primary btn-sm">Gastos</button>
                                        <button id="btnChartIncome" onclick="switchChartType('Ingreso')" class="btn btn-secondary btn-sm">Ingresos</button>
                                    </div>
                                </div>
                            </div>
                            <div class="relative w-full" style="height: 380px;">
                                <canvas id="expenseChart"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- VISTA REGISTRAR MOVIMIENTO -->
                    <div id="register-movement-view" class="dashboard-view max-w-md mx-auto space-y-lg" style="display: none;">
                        <div class="bg-surface-container-low p-md rounded-xl border border-outline-variant shadow-sm text-center">
                            <h2 class="font-headline-lg text-headline-lg text-primary">📝 Registrar Movimiento</h2>
                            <p class="font-body-md text-body-md text-on-surface-variant mt-1">Registra un nuevo ingreso o gasto para mantener tus finanzas al día.</p>
                        </div>

                        <div class="bg-white p-md rounded-xl shadow-sm border border-outline-variant space-y-md">
                            <div>
                                <label class="block font-label-md text-label-md text-on-surface-variant mb-xs">Categoría</label>
                                <select id="categoriaSelect" class="w-full bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-body-md focus:ring-primary px-md py-sm"></select>
                            </div>

                            <div class="grid grid-cols-2 gap-md">
                                <div>
                                    <label class="block font-label-md text-label-md text-on-surface-variant mb-xs">Monto ($)</label>
                                    <input type="number" id="expenseAmount" placeholder="0.00" class="w-full bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-body-md focus:ring-primary px-md py-sm">
                                </div>
                                <div>
                                    <label class="block font-label-md text-label-md text-on-surface-variant mb-xs">Fecha</label>
                                    <input type="date" id="expenseDate" class="w-full bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-body-md focus:ring-primary px-md py-sm">
                                </div>
                            </div>

                            <div class="p-sm bg-surface-container-low rounded-lg border border-outline-variant flex items-center gap-sm">
                                <input type="checkbox" id="isRecurringInput" class="w-5 h-5 cursor-pointer text-primary border-outline-variant rounded focus:ring-primary">
                                <label for="isRecurringInput" class="cursor-pointer font-label-sm text-label-sm text-on-surface-variant">🔁 Marcar como pago mensual recurrente</label>
                            </div>

                            <div class="flex gap-sm">
                                <button onclick="addIncome()" class="flex-1 bg-secondary text-on-secondary px-md py-sm rounded-lg font-label-md text-label-md flex items-center justify-center gap-xs hover:opacity-90 transition-colors shadow-sm font-bold">
                                    ＋ Ingreso
                                </button>
                                <button onclick="addExpense()" class="flex-1 bg-error text-on-error px-md py-sm rounded-lg font-label-md text-label-md flex items-center justify-center gap-xs hover:opacity-90 transition-colors shadow-sm font-bold">
                                    － Gasto
                                </button>
                            </div>

                            <div class="border-t border-outline-variant pt-md mt-md">
                                <label class="block font-label-md text-label-md text-on-surface-variant mb-xs">Nueva Categoría</label>
                                <div class="flex gap-sm">
                                    <input type="text" id="newCategoryInput" placeholder="Nombre de categoría..." class="flex-1 bg-surface-container-low border border-outline-variant rounded-lg font-body-md text-body-md focus:ring-primary px-md py-sm">
                                    <button onclick="addCategory()" class="border border-primary text-primary px-md py-sm rounded-lg font-label-md text-label-md hover:bg-surface-container transition-colors bg-white font-bold">
                                        Crear
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- VISTA METAS DE AHORRO -->
                    <div id="savings-view" class="dashboard-view space-y-lg" style="display: none;">
                        <div class="flex justify-between items-end bg-surface-container-low p-md rounded-xl border border-outline-variant shadow-sm">
                            <div>
                                <h2 class="font-headline-lg text-headline-lg text-primary">🎯 Metas de Ahorro</h2>
                                <p class="font-body-lg text-body-lg text-on-surface-variant">Establece objetivos de ahorro y sigue tu progreso mensual.</p>
                            </div>
                            <div>
                                <button onclick="openAddSavingsModal()" class="bg-primary text-on-primary px-md py-sm rounded-lg font-label-md text-label-md flex items-center gap-xs hover:opacity-90 transition-colors shadow-sm font-bold">
                                    <span class="material-symbols-outlined">add</span>
                                    Nueva Meta
                                </button>
                            </div>
                        </div>

                        <div id="dollar-price-container" class="bg-primary-container text-on-primary p-md rounded-xl border border-primary shadow-sm" style="display: none;">
                            <div class="flex justify-between items-center">
                                <div>
                                    <small class="text-on-primary-container font-label-sm text-label-sm block uppercase tracking-wider">Precio del Dólar (TRM Aprox.)</small>
                                    <h3 id="dollar-price-display" class="font-headline-lg text-headline-lg text-white font-bold mt-xs">--</h3>
                                </div>
                                <button id="btn-fetch-dollar" onclick="fetchDollarPrice()" class="bg-secondary-container text-on-secondary-container font-label-md text-label-md py-sm px-md rounded-lg hover:opacity-90 transition-colors flex items-center gap-xs shadow-md font-bold">
                                    <span class="material-symbols-outlined">refresh</span>
                                    Actualizar
                                </button>
                            </div>
                        </div>

                        <div id="savingsListContainer" class="grid grid-cols-1 md:grid-cols-2 gap-md"></div>
                    </div>

                    <!-- VISTA HISTORIAL -->
                    <div id="history-view" class="dashboard-view space-y-lg" style="display: none;">
                        <div class="flex justify-between items-end bg-surface-container-low p-md rounded-xl border border-outline-variant shadow-sm">
                            <div>
                                <h2 class="font-headline-lg text-headline-lg text-primary">Historial de Movimientos</h2>
                                <p class="font-body-lg text-body-lg text-on-surface-variant">Consulta y administra todas tus transacciones financieras.</p>
                            </div>
                            <div class="flex gap-sm">
                                <div class="flex items-center gap-xs bg-white border border-outline-variant px-sm py-1.5 rounded-lg shadow-sm">
                                    <input type="checkbox" id="filterRecurringHistory" onchange="renderMovements(currentMovements)" class="w-4 h-4 text-primary border-outline-variant rounded focus:ring-primary cursor-pointer">
                                    <label for="filterRecurringHistory" class="font-label-sm text-label-sm text-on-surface-variant cursor-pointer ml-1 select-none">Solo recurrentes</label>
                                </div>
                            </div>
                        </div>

                        <!-- FILTROS DE HISTORIAL -->
                        <div class="bg-white p-md rounded-xl border border-outline-variant shadow-sm">
                            <div class="flex flex-wrap items-end gap-sm">
                                <div>
                                    <label class="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Desde</label>
                                    <input type="date" id="historyDateFrom" onchange="renderMovements(currentMovements)" class="bg-surface-container-low border border-outline-variant rounded-lg font-label-md text-label-md px-sm py-1.5">
                                </div>
                                <div>
                                    <label class="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Hasta</label>
                                    <input type="date" id="historyDateTo" onchange="renderMovements(currentMovements)" class="bg-surface-container-low border border-outline-variant rounded-lg font-label-md text-label-md px-sm py-1.5">
                                </div>
                                <div>
                                    <label class="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Categoría</label>
                                    <select id="historyCategoryFilter" onchange="renderMovements(currentMovements)" class="bg-surface-container-low border border-outline-variant rounded-lg font-label-md text-label-md px-sm py-1.5">
                                        <option value="">Todas</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Monto mín.</label>
                                    <input type="number" id="historyAmountMin" placeholder="0" onchange="renderMovements(currentMovements)" class="bg-surface-container-low border border-outline-variant rounded-lg font-label-md text-label-md px-sm py-1.5 w-28">
                                </div>
                                <div>
                                    <label class="block font-label-sm text-label-sm text-on-surface-variant mb-xs">Monto máx.</label>
                                    <input type="number" id="historyAmountMax" placeholder="∞" onchange="renderMovements(currentMovements)" class="bg-surface-container-low border border-outline-variant rounded-lg font-label-md text-label-md px-sm py-1.5 w-28">
                                </div>
                                <button onclick="clearHistoryFilters()" class="border border-outline-variant text-on-surface-variant px-md py-1.5 rounded-lg font-label-sm text-label-sm hover:bg-surface-container transition-colors bg-white">
                                    Limpiar filtros
                                </button>
                            </div>
                        </div>

                        <div class="bg-white rounded-xl overflow-hidden shadow-sm border border-outline-variant">
                            <div class="overflow-x-auto">
                                <table class="w-full text-left">
                                    <thead class="bg-surface-container font-label-md text-label-md text-on-surface border-b border-outline-variant">
                                        <tr>
                                            <th onclick="sortTable('fecha')" class="px-md py-sm cursor-pointer select-none hover:bg-surface-container-high transition-colors">Fecha <span id="sortIconFecha">↕</span></th>
                                            <th onclick="sortTable('categoria')" class="px-md py-sm cursor-pointer select-none hover:bg-surface-container-high transition-colors">Categoría / Tipo <span id="sortIconCategoria">↕</span></th>
                                            <th onclick="sortTable('monto')" class="px-md py-sm cursor-pointer select-none hover:bg-surface-container-high transition-colors">Monto <span id="sortIconMonto">↕</span></th>
                                            <th class="px-md py-sm text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody id="movementsTableBody" class="divide-y divide-outline-variant"></tbody>
                                </table>
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
    updateDarkModeToggleLabel();

    // Cargar Fondo de Pantalla guardado
    loadSavedWallpaper();

    // Detectar cambios de tamaño de pantalla (ej: rotar celular) para ajustar fondo
    window.addEventListener('resize', () => {
        loadSavedWallpaper();
    });

    // VERIFICAR SESIÓN AL CARGAR (CORRECCIÓN F5)
    // Busca si hay un token guardado en el navegador (localStorage)
    const storedToken = getToken();
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




function toggleLoginPassword() {
    const input = document.getElementById("loginPassword");
    const button = document.querySelector(".auth-eye");
    if (!input) return;

    const shouldShow = input.type === "password";
    input.type = shouldShow ? "text" : "password";
    if (button) {
        button.classList.toggle("is-visible", shouldShow);
        button.setAttribute("aria-label", shouldShow ? "Ocultar contraseña" : "Mostrar contraseña");
    }
}

function toggleDashboardMenu(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    document.body.classList.remove('dashboard-menu-open');
    const logoButton = document.getElementById('dashboardMenuLogo');
    if (logoButton) logoButton.setAttribute('aria-label', 'Menú de funciones');
}

function closeDashboardMenu() {
    document.body.classList.remove('dashboard-menu-open');
    const logoButton = document.getElementById('dashboardMenuLogo');
    if (logoButton) logoButton.setAttribute('aria-label', 'Mostrar menú de funciones');
}

/* ======================
   VISTAS
====================== */
// Función auxiliar para ajustar el diseño del contenedor principal <main>
function adjustMainLayout(isDashboard) {
    const main = document.querySelector("main");
    const header = document.querySelector("header");
    if (!main) return;

    if (isDashboard) {
        // Al entrar al dashboard, se quita el fondo animado y se usan los colores base.
        document.body.classList.remove('auth-background');
        document.body.classList.remove('dashboard-menu-open');
        // En el Dashboard: Quitamos las restricciones de ancho y estilo de tarjeta
        // para que ocupe toda la pantalla y se vea bien en PC.
        main.style.maxWidth = "100%";
        main.style.width = "100%";
        main.style.margin = "0";
        main.style.padding = "0";
        main.style.background = "transparent";
        main.style.borderRadius = "0";
        main.style.boxShadow = "none";
        main.style.border = "0";
        main.style.minHeight = "100vh";
        main.style.backdropFilter = "none";
        main.style.webkitBackdropFilter = "none";
        if (header) header.style.display = "none"; // Oculta el header original en el Dashboard
        loadSavedWallpaper(); // Asegurar que el fondo se vea en el dashboard
    } else {
        // En las vistas de autenticación, se aplica el fondo animado.
        document.body.classList.add('auth-background');
        // En Login/Registro: Restauramos los estilos del CSS (tarjeta centrada de 400px)
        main.style.maxWidth = "";
        main.style.width = "";
        main.style.margin = "";
        main.style.padding = "";
        main.style.background = "";
        main.style.borderRadius = "";
        main.style.boxShadow = "";
        main.style.border = "";
        main.style.minHeight = "";
        main.style.backdropFilter = "";
        main.style.webkitBackdropFilter = "";
        if (header) header.style.display = "none"; // Ocultamos también el header original en Login/Registro
        document.body.style.backgroundImage = ""; // Limpiar fondo personalizado en login
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
async function showDashboard(email) {
    const token = getToken();

    if (!token) {
        showLogin();
        return;
    }

    try {
        const profileData = await apiFetchJson(`${API}/check-initial-profile`, {
            headers: { "Authorization": "Bearer " + token }
        }, 3);

        console.log("Perfil check:", profileData);

        if (profileData.needs_profile_info) {
            hideAll();
            showTerms();
        } else {
            const data = await apiFetchJson(`${API}/check-onboarding`, {
                headers: { "Authorization": "Bearer " + token }
            }, 3);

            hideAll();
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
        }
    } catch (err) {
        console.error("Error checking user status:", err);

        if (isAuthExpired(err)) {
            showToast("Tu sesión venció. Ingresa de nuevo.", "error");
            logout();
            return;
        }

        retryDashboardLoad(email, err);
    }
}

// Función para mostrar los Términos y Condiciones
function showTerms() {
    hideAll();
    adjustMainLayout(false);
    const view = document.getElementById("terms-view");
    view.style.display = "block";
    triggerFadeAnimation(view);
}

function acceptTerms() {
    showInitialProfile();
}

function cancelTerms() {
    logout();
}

/* ======================
   CHATBOT INTERACTIVO
====================== */
let isChatInitialized = false; // Bandera para saber si ya cargamos el menú
let chatHistory = []; // Últimos turnos (usuario/asistente) para dar contexto al LLM
const CHAT_HISTORY_MAX_TURNS = 8;

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
    showTypingIndicator();

    const token = getToken();
    const historyForRequest = chatHistory.slice(-CHAT_HISTORY_MAX_TURNS);

    // 2. Enviar al backend (con el historial reciente para dar contexto al LLM)
    fetch(`${API}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ message: message, history: historyForRequest })
    })
    .then(res => res.json())
    .then(data => {
        hideTypingIndicator();

        // 3. Mostrar respuesta del bot
        appendMessage(data.response, 'bot');
        chatHistory.push({ role: "user", text: message });
        chatHistory.push({ role: "assistant", text: data.response });
        chatHistory = chatHistory.slice(-CHAT_HISTORY_MAX_TURNS);

        // Si la respuesta indica éxito, recargar movimientos
        if (data.response.includes("registrado") || data.response.includes("eliminado")) {
            filterMovements();
            loadPaymentStatus();
            if (data.response.includes("Ahorro")) loadSavingsGoals();
        }

        const container = document.getElementById("chat-messages");

        if (data.pending_action) {
            renderPendingActionCard(data.pending_action);
        } else if (data.options && data.options.length > 0) {
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
            container.appendChild(renderChatMenuOptions());
        }

        container.scrollTop = container.scrollHeight;
    })
    .catch(err => {
        hideTypingIndicator();
        appendMessage("Error de conexión con el asistente.", 'bot');
        // Mostrar menú incluso si hay error
        const container = document.getElementById("chat-messages");
        container.appendChild(renderChatMenuOptions());
        container.scrollTop = container.scrollHeight;
    });
}

function showTypingIndicator() {
    const container = document.getElementById("chat-messages");
    const div = document.createElement("div");
    div.className = "message bot";
    div.id = "chat-typing-indicator";
    div.innerText = "Escribiendo…";
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function hideTypingIndicator() {
    const el = document.getElementById("chat-typing-indicator");
    if (el) el.remove();
}

// --- Tarjeta de confirmación para gastos/ingresos detectados por el LLM ---
function renderPendingActionCard(pendingAction) {
    const container = document.getElementById("chat-messages");

    const formDiv = document.createElement("div");
    formDiv.className = "chat-form-container";
    formDiv.style.cssText = "background: var(--card-bg); padding: 12px; border-radius: 12px; border: 1px solid var(--border-color); margin-top: 8px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);";

    const esGasto = pendingAction.type === "add_expense";

    formDiv.innerHTML = `
        <input type="number" id="pendingAmount" placeholder="Monto ($)" class="form-control" style="font-size: 0.9rem; padding: 8px;" value="${pendingAction.monto}">
        <input type="text" id="pendingCategory" placeholder="Categoría" class="form-control" style="font-size: 0.9rem; padding: 8px;" value="${escapeHtml(pendingAction.categoria)}">
        <input type="date" id="pendingDate" class="form-control" style="font-size: 0.9rem; padding: 8px;" value="${pendingAction.fecha}">
        <div style="display:flex; gap:8px; margin-top: 5px;">
            <button onclick="cancelPendingAction(this)" class="btn btn-secondary btn-sm" style="flex:1;">Cancelar</button>
            <button onclick="confirmPendingAction(this)" class="btn btn-primary btn-sm" style="flex:1;">Confirmar</button>
        </div>
    `;
    formDiv.dataset.type = pendingAction.type;
    formDiv.dataset.recurrente = pendingAction.es_recurrente ? "1" : "0";

    container.appendChild(formDiv);
    container.scrollTop = container.scrollHeight;
}

function confirmPendingAction(btnElement) {
    const card = btnElement.closest(".chat-form-container");
    const type = card.dataset.type;
    const amount = document.getElementById("pendingAmount").value;
    const category = document.getElementById("pendingCategory").value;
    const date = document.getElementById("pendingDate").value;

    if (!amount || !category || !date) {
        return showToast("Completa monto, categoría y fecha.", 'error');
    }

    btnElement.disabled = true;
    btnElement.innerText = "...";

    const token = getToken();
    const endpoint = type === "add_income" ? "add-income" : "add-expense";
    const body = type === "add_income"
        ? { categoria: category, monto: amount, fecha: date }
        : { tipo: category, monto: amount, fecha: date, es_recurrente: card.dataset.recurrente === "1" };

    fetch(`${API}/${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify(body)
    })
    .then(res => res.json())
    .then(() => {
        card.remove();
        const etiqueta = type === "add_income" ? "Ingreso" : "Gasto";
        appendMessage(`✅ ${etiqueta} registrado: $${amount} en ${category}`, 'bot');
        filterMovements();
        loadPaymentStatus();

        const chatContainer = document.getElementById("chat-messages");
        chatContainer.appendChild(renderChatMenuOptions());
        chatContainer.scrollTop = chatContainer.scrollHeight;
    })
    .catch(err => {
        console.error(err);
        showToast("Error al registrar el movimiento", 'error');
        btnElement.disabled = false;
        btnElement.innerText = "Confirmar";
    });
}

function cancelPendingAction(btnElement) {
    const card = btnElement.closest(".chat-form-container");
    card.remove();
    appendMessage("Operación cancelada.", 'bot');

    const chatContainer = document.getElementById("chat-messages");
    chatContainer.appendChild(renderChatMenuOptions());
    chatContainer.scrollTop = chatContainer.scrollHeight;
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

    appendMessage("👋 ¡Hola! Soy tu asistente financiero. Puedes escribirme en lenguaje natural, ej: \"gasté 20000 en transporte hoy\", y yo lo registro por ti (te pediré confirmar antes de guardar). También puedes usar estos accesos rápidos:", 'bot');

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
    const token = getToken();

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

    const token = getToken();
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
        filterMovements(); // Actualizar dashboard
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
    hidePostLoginLoader();
}

/* ======================
   PANTALLA DE CARGA POST-LOGIN
====================== */
const POST_LOGIN_LOADER_MIN_MS = 2000; // Tiempo mínimo visible, aunque el backend responda rápido
let postLoginLoaderShownAt = 0;
let postLoginLoaderHideTimer = null;

function showPostLoginLoader() {
    const el = document.getElementById("post-login-loader");
    if (!el) return;
    clearTimeout(postLoginLoaderHideTimer);
    postLoginLoaderShownAt = Date.now();
    el.classList.add("active");
}

function hidePostLoginLoader() {
    const el = document.getElementById("post-login-loader");
    if (!el || !el.classList.contains("active")) return;

    const elapsed = Date.now() - postLoginLoaderShownAt;
    const remaining = POST_LOGIN_LOADER_MIN_MS - elapsed;

    clearTimeout(postLoginLoaderHideTimer);
    if (remaining > 0) {
        postLoginLoaderHideTimer = setTimeout(() => el.classList.remove("active"), remaining);
    } else {
        el.classList.remove("active");
    }
}

// Función auxiliar para reiniciar la animación fade-in
function triggerFadeAnimation(element) {
    if (!element) return;
    element.classList.remove('fade-in');
    void element.offsetWidth; // Trigger reflow (truco para reiniciar animación CSS)
    element.classList.add('fade-in');
}

// Función para cambiar entre vistas del dashboard
function showDashboardView(viewId, preserveSearch = false) {
    // Al navegar a cualquier vista del menú (salvo que venga de la propia
    // búsqueda), limpiamos la barra de búsqueda y el filtro que haya dejado
    // aplicado en la tabla de Historial (aunque el input ya esté vacío).
    if (!preserveSearch && searchFilterActive) {
        const searchInput = document.getElementById("globalSearchInput");
        if (searchInput) searchInput.value = "";
        renderMovements(currentMovements);
        searchFilterActive = false;
    }

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

    // Actualizar colores de los botones de navegación (clases de Tailwind y tema)
    document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.tagName === 'A') {
            btn.classList.remove('text-secondary-container', 'font-bold', 'bg-white/10');
            btn.classList.add('text-on-primary-container', 'hover:bg-white/10');
        }
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
    if (activeBtn && activeBtn.tagName === 'A') {
        activeBtn.classList.remove('text-on-primary-container', 'hover:bg-white/10');
        activeBtn.classList.add('text-secondary-container', 'font-bold', 'bg-white/10');
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

    closeDashboardMenu();

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
async function login() {
    const loginBtn = document.querySelector("#login-view button[onclick='login()']");
    const loginMsg = document.getElementById("loginMsg");
    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        showToast("Ingresa correo y contraseña.", "error");
        return;
    }

    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerText = "Conectando...";
    }

    if (loginMsg) {
        loginMsg.innerText = "";
        loginMsg.style.color = "";
    }

    try {
        const data = await apiFetchJson(`${API}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        }, 3);

        console.log("LOGIN RESPONSE:", data);

        if (data.token) {
            const remember = document.getElementById("rememberMe")?.checked ?? true;
            setToken(data.token, remember);
            localStorage.setItem("email", email);
            showPostLoginLoader();
            showDashboard(email);
        } else {
            showToast(data.message || "Error al iniciar sesión", 'error');
        }
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        const message = err.message || "Error al iniciar sesión. Verifica tu conexión o las credenciales.";
        showToast(message, err.recoverable ? "info" : "error");
        if (loginMsg) {
            loginMsg.innerText = message;
            loginMsg.style.color = err.recoverable ? "var(--secondary)" : "red";
        }
    } finally {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerText = "Ingresar";
        }
    }
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
    const token = getToken();
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
    apiFetchJson(url, {
        headers: { "Authorization": "Bearer " + token }
    }, 2)
    .then(data => {
        currentMovements = data; // Guardamos los datos en memoria
        populateHistoryCategoryFilter(currentMovements);
        renderMovements(currentMovements); // Dibujamos la tabla
        renderChart(currentMovements); // Dibujamos el gráfico
    })
    .catch(err => {
        console.error("Error cargando movimientos:", err);
        if (isAuthExpired(err)) return logout();
        showToast(err.message || "No se pudieron cargar los movimientos.", err.recoverable ? "info" : "error");
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

    // --- FILTROS DE HISTORIAL (fecha, categoría, monto) ---
    const dateFrom = document.getElementById("historyDateFrom")?.value;
    const dateTo = document.getElementById("historyDateTo")?.value;
    const categoryFilter = document.getElementById("historyCategoryFilter")?.value;
    const amountMinRaw = document.getElementById("historyAmountMin")?.value;
    const amountMaxRaw = document.getElementById("historyAmountMax")?.value;
    const amountMin = amountMinRaw !== "" && amountMinRaw != null ? parseFloat(amountMinRaw) : null;
    const amountMax = amountMaxRaw !== "" && amountMaxRaw != null ? parseFloat(amountMaxRaw) : null;

    if (dateFrom) data = data.filter(m => m.fecha >= dateFrom);
    if (dateTo) data = data.filter(m => m.fecha <= dateTo);
    if (categoryFilter) data = data.filter(m => m.categoria === categoryFilter);
    if (amountMin !== null && !isNaN(amountMin)) data = data.filter(m => parseFloat(m.monto) >= amountMin);
    if (amountMax !== null && !isNaN(amountMax)) data = data.filter(m => parseFloat(m.monto) <= amountMax);

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-md py-lg text-center text-on-surface-variant font-body-md text-body-md">No hay movimientos que coincidan con los filtros.</td></tr>`;
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
        row.className = "hover:bg-surface-container-low transition-colors group";
        
        // Define colores: verde para ingreso, rojo para gasto
        const isIngreso = mov.tipo === "Ingreso";
        const color = isIngreso ? "#006c49" : "#ba1a1a";
        const signo = isIngreso ? "+" : "-";
        
        // Icono indicador de recurrente
        const iconRecurrente = mov.es_recurrente 
            ? '<span class="px-xs py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-label-sm border border-outline-variant flex items-center gap-1 select-none">🔁 Recurrente</span>' 
            : '';

        row.innerHTML = `
            <td class="px-md py-md font-numeric-data text-numeric-data text-on-surface-variant">${formattedDate}</td>
            <td class="px-md py-md">
                <div class="flex items-center gap-sm">
                    <span class="font-body-md text-body-md font-bold text-primary">${escapeHtml(mov.categoria)}</span>
                    ${iconRecurrente}
                </div>
            </td>
            <td class="px-md py-md font-numeric-data text-numeric-data font-bold" style="color: ${color};">
                ${signo} ${formatCurrency(mov.monto)}
            </td>
            <td class="px-md py-md text-right">
                <button data-type="${escapeHtml(mov.tipo)}" onclick="deleteMovement(${mov.id}, this.dataset.type)" class="text-on-surface-variant hover:text-error transition-colors flex items-center justify-center p-1.5 hover:bg-surface-container rounded-full ml-auto" title="Eliminar">
                    <span class="material-symbols-outlined text-md text-error">delete</span>
                </button>
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
        balanceDisplay.style.color = balance >= 0 ? "#006c49" : "#ba1a1a";
    }

    // 2. Actualizar Mini Balance del Header (Pequeño)
    const miniBalanceAmount = document.getElementById("miniBalanceAmount");
    if (miniBalanceAmount) {
        miniBalanceAmount.innerText = formatCurrency(balance);
        miniBalanceAmount.style.color = balance >= 0 ? "#006c49" : "#ba1a1a";
    }
}


function consultarBalance() {
    const token = getToken();

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

    // Paletas: colores limpios para modo claro y una gama sobria para modo oscuro.
    const paletteLight = ['#e63946', '#f77f00', '#fcbf49', '#003049', '#d62828', '#2a9d8f', '#264653', '#457b9d'];
    const paletteDark = ['#7dd3b0', '#f2cc8f', '#e07a5f', '#81b29a', '#c3b1e1', '#74c0fc', '#f4a261', '#9ad5ca'];
    
    const palette = isDarkMode ? paletteDark : paletteLight;
    const incomeColor = isDarkMode ? '#7dd3b0' : '#2ec4b6';
    // Usar la paleta de colores también para ingresos para poder discriminarlos
    const bgColors = labels.map((cat, i) => palette[i % palette.length]);
    
    // El borde separa los segmentos: blanco en modo claro, gris oscuro en modo oscuro
    const borderColors = labels.map(() => isDarkMode ? '#101815' : '#ffffff');

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
                            color: isDarkMode ? '#a9beb3' : '#666'
                        }
                    },
                    // INTERACTIVIDAD: Filtrar tabla al hacer clic
                    tooltip: {
                        backgroundColor: isDarkMode ? '#101815' : '#ffffff',
                        titleColor: isDarkMode ? '#edf7f1' : '#24352f',
                        bodyColor: isDarkMode ? '#d7e7de' : '#24352f',
                        borderColor: isDarkMode ? '#31483f' : '#ded6ca',
                        borderWidth: 1,
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
    if (currentSortColumn === column) {
        sortAsc = !sortAsc; // Invertir orden si es la misma columna
    } else {
        currentSortColumn = column;
        sortAsc = true;
    }

    currentMovements.sort((a, b) => {
        // Compara números o textos según la columna
        let valA = column === 'monto' ? parseFloat(a[column]) : (a[column] || '').toString().toLowerCase();
        let valB = column === 'monto' ? parseFloat(b[column]) : (b[column] || '').toString().toLowerCase();

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    updateSortIndicators();
    renderMovements(currentMovements);
}

// Actualiza las flechas ↑/↓ del encabezado según la columna activa
function updateSortIndicators() {
    const icons = { fecha: 'sortIconFecha', categoria: 'sortIconCategoria', monto: 'sortIconMonto' };
    Object.entries(icons).forEach(([col, id]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = currentSortColumn === col ? (sortAsc ? '↑' : '↓') : '↕';
    });
}

// Llena el select de categorías del Historial con las categorías presentes
// en los movimientos cargados (preserva la selección actual si sigue existiendo).
function populateHistoryCategoryFilter(data) {
    const select = document.getElementById("historyCategoryFilter");
    if (!select) return;

    const previousValue = select.value;
    const categories = Array.from(new Set(data.map(m => m.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b));

    select.innerHTML = '<option value="">Todas</option>' +
        categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');

    if (categories.includes(previousValue)) {
        select.value = previousValue;
    }
}

// Limpia todos los filtros del Historial (fecha, categoría, monto, recurrentes)
function clearHistoryFilters() {
    const ids = ["historyDateFrom", "historyDateTo", "historyCategoryFilter", "historyAmountMin", "historyAmountMax"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const recurringCheckbox = document.getElementById("filterRecurringHistory");
    if (recurringCheckbox) recurringCheckbox.checked = false;
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

// Función para buscar gastos rápidamente por palabra clave (barra superior)
function searchExpenses() {
    const input = document.getElementById("globalSearchInput");
    const query = (input?.value || "").trim().toLowerCase();

    showDashboardView('history-view', true); // preservar el texto buscado en el input

    if (!query) {
        renderMovements(currentMovements);
        searchFilterActive = false;
        return;
    }

    const results = currentMovements.filter(m =>
        m.tipo === "Gasto" && m.categoria && m.categoria.toLowerCase().includes(query)
    );
    renderMovements(results);
    searchFilterActive = true;
    showToast(
        results.length
            ? `${results.length} gasto(s) encontrados para "${query}"`
            : `No se encontraron gastos para "${query}"`,
        results.length ? 'success' : 'info'
    );
}

// Función para borrar un movimiento
function deleteMovement(id, tipo) {
    // Pregunta confirmación al usuario
    if (!confirm("¿Estás seguro de eliminar este movimiento?")) return;

    const token = getToken();
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
        showToast(data.message, 'success');
        filterMovements(); // Recargar la tabla y balance, respetando el filtro de mes
    });
}

/* ======================
   EXPORTAR A CSV
====================== */
// Función para descargar los datos en Excel (CSV)
function exportToCSV() {
    const token = getToken();
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

    apiFetchJson(url, {
        headers: { "Authorization": "Bearer " + token }
    }, 2)
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
    const token = getToken();
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
    const token = getToken();
    
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
            filterMovements(); 
        }
    })
    .catch(err => console.error(err));
}

/* ======================
   AGREGAR INGRESO
====================== */
// Función para registrar un nuevo ingreso
function addIncome() {
    const token = getToken();
    const monto = document.getElementById("expenseAmount").value;
    const fecha = document.getElementById("expenseDate").value;
    const categoria = document.getElementById("categoriaSelect").value;
    const isRecurring = document.getElementById("isRecurringInput").checked;

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
        if (data.message.includes("agregado")) {
            document.getElementById("expenseAmount").value = "";
            document.getElementById("isRecurringInput").checked = false; // Resetear checkbox
            filterMovements(); // Actualizar tabla y gráfico

            // Los ingresos no tienen un mecanismo de "recurrente" propio (a diferencia
            // de los gastos): el ingreso mensual recurrente se administra desde
            // Pagos > "Confirmar Ingreso Principal". Avisamos en vez de ignorar el check.
            if (isRecurring) {
                showToast('Ingreso agregado. Para marcar tu ingreso principal como recurrente, ve a "Pagos" y usa "Confirmar Ingreso Principal".', 'success');
            } else {
                showToast(data.message, 'success');
            }
        } else {
            showToast(data.message, 'success');
        }
    })
    .catch(err => console.error(err));
}

/* ======================
   REGISTRO
====================== */
// Función para crear una cuenta nueva
async function register() {
    const email = document.getElementById("registerEmail").value.trim().toLowerCase();
    const password = document.getElementById("registerPassword").value;
    const registerBtn = document.querySelector("#register-view button[onclick='register()']");

    // Limpiar mensajes previos
    const msg = document.getElementById("registerMsg");
    if(msg) {
        msg.innerText = "";
        msg.style.color = "";
    }

    if (!email || !password) {
        showToast("Completa correo y contraseña.", "error");
        return;
    }

    if (registerBtn) {
        registerBtn.disabled = true;
        registerBtn.innerText = "Registrando...";
    }

    try {
        const data = await apiFetchJson(`${API}/register`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ email, password })
        }, 0);

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
    } catch (err) {
        console.error("REGISTER ERROR:", err); // Registrar cualquier error de red o de parseo
        if (msg) {
            // Si el error es de conexión (común en Render al despertar el server)
            if (err.recoverable || err instanceof TypeError) {
                msg.innerText = "El servidor se está reconectando. Tu formulario queda listo para reintentar en unos segundos.";
                showToast("Servidor en reconexión. Intenta de nuevo en unos segundos.", "info");
            } else {
                // Para otros errores, muestra el mensaje del backend
                msg.innerText = err.message || "Error al registrar usuario. Inténtalo de nuevo.";
                if (msg.innerText.includes("Usuario ya existe")) {
                    document.getElementById("loginEmail").value = email;
                    setTimeout(showLogin, 900);
                }
            }
            msg.style.color = "red";
        }
    } finally {
        if (registerBtn) {
            registerBtn.disabled = false;
            registerBtn.innerText = "Registrar";
        }
    }
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
    updateDarkModeToggleLabel();
    
    // Disparar evento para que la animación 3D u otros scripts reaccionen
    document.dispatchEvent(new Event('themeToggled'));
    
    // Redibujar el gráfico si existen datos para aplicar los nuevos colores inmediatamente
    if (currentMovements.length > 0) {
        renderChart(currentMovements);
    }
}

function updateDarkModeToggleLabel() {
    const button = document.getElementById('darkModeToggleBtn');
    if (button) {
        button.textContent = document.body.classList.contains('dark-mode') ? '☀️ Modo Claro' : '🌙 Modo Oscuro';
    }
    
    // Actualizar icono en el login si existe
    const loginIcon = document.getElementById('loginThemeIcon');
    if (loginIcon) {
        loginIcon.textContent = document.body.classList.contains('dark-mode') ? 'light_mode' : 'dark_mode';
    }
}

// Cerrar el menú si se hace clic fuera de él
document.addEventListener('click', function(event) {
    const navColumn = document.querySelector('.nav-column');
    const menuToggle = document.querySelector('.menu-toggle');
    const profileDropdown = document.getElementById('profileDropdown');
    const profileAvatar = document.getElementById('profileAvatar');
    const alertsDropdown = document.getElementById('alertsDropdown');
    const alertsBtn = document.getElementById('alertsBtn');
    const chatbotWindow = document.getElementById('chatbot-window');
    const chatbotBtn = document.getElementById('chatbot-btn');
    const dashboardSidebar = document.getElementById('dashboardSidebar');

    // Si el menú está abierto, y el clic no fue dentro del menú ni en el botón
    if (navColumn && navColumn.classList.contains('active')) {
        if (!navColumn.contains(event.target) && (!menuToggle || !menuToggle.contains(event.target))) {
            navColumn.classList.remove('active');
        }
    }

    if (document.body.classList.contains('dashboard-menu-open') && dashboardSidebar) {
        if (!dashboardSidebar.contains(event.target)) closeDashboardMenu();
    }

    // Cerrar dropdown de perfil si se hace clic fuera
    if (profileDropdown && profileDropdown.classList.contains('active')) {
        if (!profileDropdown.contains(event.target) && !profileAvatar.contains(event.target)) {
            profileDropdown.classList.remove('active');
            profileAvatar.classList.remove('active');
        }
    }

    // Cerrar dropdown de alarmas si se hace clic fuera
    if (alertsDropdown && alertsDropdown.classList.contains('active')) {
        if (!alertsDropdown.contains(event.target) && (!alertsBtn || !alertsBtn.contains(event.target))) {
            alertsDropdown.classList.remove('active');
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
    clearToken();
    localStorage.removeItem("email"); // Borrar email al salir
    showLogin();
}

/* ======================
   GOOGLE LOGIN
====================== */
// Configuración inicial de Google al cargar la página
window.addEventListener("load", () => {
    // Verificamos que la librería de Google y el ID de cliente existan
    if (window.google && window.GOOGLE_CLIENT_ID) {
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
    }
});

// Función que maneja la respuesta de Google
function handleGoogle(response) {
    apiFetchJson(`${API}/google-login`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ token: response.credential })
    }, 2)
    .then(data => {
        // CORRECCIÓN: Verificamos si recibimos el token
        if (data.token) {
            const remember = document.getElementById("rememberMe")?.checked ?? true;
            setToken(data.token, remember);
            // Usamos el email que ahora nos devuelve el backend
            currentUser = data.email;
            localStorage.setItem("email", currentUser); // Guardar email para F5
            showPostLoginLoader();
            showDashboard(currentUser);
        } else {
            showToast(data.message || "Error al iniciar sesión con Google", 'error');
        }
    })
    .catch(err => showToast(err.message || "Error al iniciar sesión con Google", err.recoverable ? "info" : "error"));
}

/* ======================
   CATEGORÍAS
====================== */
// Función para cargar las categorías disponibles desde el servidor
function loadCategories() {
    const token = getToken();
    if (!token) return;

    apiFetchJson(`${API}/categories`, {
        headers: { "Authorization": "Bearer " + token }
    }, 2)
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
    .catch(err => {
        console.error("Error categories:", err);
        if (!err.recoverable) showToast(err.message || "Error cargando categorías", "error");
    });
}

// Función para crear una nueva categoría personalizada
function addCategory() {
    const token = getToken();
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
    const token = getToken();

    if (!nombre || !apellidos || !edad) {
        return showToast("Por favor, completa todos los campos.", "error");
    }

    apiFetchJson(`${API}/save-initial-profile`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ nombre, apellidos, edad })
    }, 1)
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

    const token = getToken();
    apiFetchJson(`${API}/save-onboarding`, {
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
    }, 1)
    .then(data => {
        nextOnboardingStep(3); // Mostrar éxito
    })
    .catch(err => {
        console.error("Error guardando onboarding:", err);
        showToast(err.message || "No se pudo guardar la configuración inicial.", err.recoverable ? "info" : "error");
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
    const token = getToken();
    
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

        currentBaseIncome = data.ingreso_base; // Guardar para el modal de edición
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

        const overduePayments = []; // Para el menú de alarmas (🔔)

        data.pagos.forEach(pago => {
            const div = document.createElement("div");
            
            let daysLeft = pago.dia_limite - currentDay;

            // --- Definir Estado, Icono, Clases y Color ---
            let statusIcon, statusText, statusColor, textColorClass;
            if (pago.pagado) {
                statusIcon = 'check_circle';
                statusText = 'Pagado';
                statusColor = '#006c49'; // secondary color
                textColorClass = 'text-secondary';
            } else {
                if (monthState === 'past') {
                    // Si es mes pasado y no pagó -> Vencido
                    statusIcon = 'warning';
                    statusText = 'No pagado (Vencido)';
                    statusColor = '#ba1a1a'; // error color
                    textColorClass = 'text-error';
                    overduePayments.push({ categoria: pago.categoria, monto: pago.monto_esperado, detalle: 'No pagado (mes anterior)' });
                } else if (monthState === 'future') {
                    // Si es mes futuro -> Pendiente normal
                    statusIcon = 'pending';
                    statusText = `Vence el día ${pago.dia_limite}`;
                    statusColor = '#131b2e'; // primary-container color
                    textColorClass = 'text-primary-container';
                } else {
                    // Mes actual (Lógica original)
                    if (daysLeft < 0) {
                        statusIcon = 'warning';
                        statusText = `Vencido hace ${Math.abs(daysLeft)} días`;
                        statusColor = '#ba1a1a';
                        textColorClass = 'text-error';
                        overduePayments.push({ categoria: pago.categoria, monto: pago.monto_esperado, detalle: `Vencido hace ${Math.abs(daysLeft)} día${Math.abs(daysLeft) === 1 ? '' : 's'}` });
                    } else if (daysLeft === 0) {
                        statusIcon = 'error';
                        statusText = 'Vence Hoy';
                        statusColor = '#e65100'; // orange
                        textColorClass = 'text-orange-600';
                    } else {
                        statusIcon = 'pending';
                        statusText = `Faltan ${daysLeft} días`;
                        statusColor = '#131b2e';
                        textColorClass = 'text-primary-container';
                    }
                }
            }

            div.className = "flex items-center justify-between p-md rounded-xl bg-white border border-outline-variant shadow-sm hover:shadow-md transition-all duration-200 group";
            div.style.borderLeft = `4px solid ${statusColor}`;

            div.innerHTML = `
                <div class="flex items-center gap-sm">
                    <div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center border border-outline-variant">
                        <span class="material-symbols-outlined text-primary-container font-bold">${statusIcon}</span>
                    </div>
                    <div>
                        <div class="flex items-center gap-xs">
                            <p class="font-body-md text-body-md font-bold text-primary">${escapeHtml(pago.categoria)}</p>
                            <button data-cat="${escapeHtml(pago.categoria)}" onclick="openEditModal(${pago.id}, this.dataset.cat, ${pago.monto_esperado}, ${pago.dia_limite})" class="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full hover:bg-surface-container" title="Editar">
                                <span class="material-symbols-outlined text-sm">edit</span>
                            </button>
                        </div>
                        <p class="font-label-sm text-label-sm mt-0.5 ${textColorClass} font-semibold">${statusText}</p>
                    </div>
                </div>
                <div class="flex items-center gap-md">
                    <div class="text-right">
                        <p class="font-numeric-data text-numeric-data text-primary text-lg font-bold">${formatCurrency(pago.monto_esperado)}</p>
                        ${!pago.pagado 
                            ? `<button onclick="quickPay('${escapeHtml(pago.categoria)}', ${pago.monto_esperado})" class="bg-primary text-on-primary font-label-sm text-label-sm px-md py-1.5 rounded-lg hover:opacity-90 transition-all shadow-sm mt-1">Pagar</button>` 
                            : `<span class="inline-flex items-center px-sm py-1 rounded bg-secondary-container text-on-secondary-container font-label-sm text-label-sm border border-outline-variant mt-1 font-semibold">Pagado</span>`
                        }
                    </div>
                </div>
            `;
            container.appendChild(div);
        });

        // Solo actualizamos el menú de alarmas (🔔) cuando los datos corresponden
        // al mes actual real; si el usuario está viendo otro mes, no lo tocamos.
        if (isCurrentMonth) updateOverdueAlerts(overduePayments);
    })
    .catch(err => {
        console.error("Error cargando pagos:", err);
        if (isAuthExpired(err)) return logout();
        showToast(err.message || "No se pudo cargar el estado de pagos.", err.recoverable ? "info" : "error");
    });
}

/* ======================
   ALARMAS (Pagos vencidos)
====================== */
function updateOverdueAlerts(overduePayments) {
    const badge = document.getElementById("alertsBadge");
    const list = document.getElementById("alertsList");
    if (!badge || !list) return;

    if (overduePayments.length > 0) {
        badge.textContent = overduePayments.length > 9 ? "9+" : String(overduePayments.length);
        badge.style.display = "flex";
    } else {
        badge.style.display = "none";
    }

    if (overduePayments.length === 0) {
        list.innerHTML = `<div class="alert-item-empty">✅ No tienes pagos vencidos.</div>`;
        return;
    }

    list.innerHTML = overduePayments.map(p => `
        <div class="alert-item">
            <div>
                <div class="font-body-md text-body-md font-bold text-primary">${escapeHtml(p.categoria)}</div>
                <div class="font-label-sm text-label-sm text-error">${escapeHtml(p.detalle)}</div>
            </div>
            <div class="font-numeric-data text-numeric-data font-bold text-primary">${formatCurrency(p.monto)}</div>
        </div>
    `).join('');
}

function toggleAlertsMenu(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById("alertsDropdown");
    if (dropdown) dropdown.classList.toggle("active");
    const profileDropdown = document.getElementById("profileDropdown");
    const profileAvatar = document.getElementById("profileAvatar");
    if (profileDropdown && profileDropdown.classList.contains("active")) {
        profileDropdown.classList.remove("active");
        if (profileAvatar) profileAvatar.classList.remove("active");
    }
}

function quickPay(categoria, monto) {
    // 1. Confirmación de seguridad
    if (!confirm(`¿Confirmar pago de ${formatCurrency(monto)} para ${categoria}?`)) return;

    const token = getToken();
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
        filterMovements();     // Actualizar historial y balance en segundo plano
    })
    .catch(err => showToast("Error al registrar pago", 'error'));
}

function confirmMainIncome() {
    if (!confirm("¿Confirmas que has recibido tu ingreso principal de este mes? Esto registrará un nuevo movimiento de ingreso.")) return;

    const token = getToken();
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
        filterMovements();
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
    const token = getToken();

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

    const token = getToken();
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
    const token = getToken();
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
    const token = getToken();
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
    const token = getToken();

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
            const token = getToken();

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
    
    const token = getToken();
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
   FONDOS DE PANTALLA (WALLPAPERS)
====================== */
function openWallpaperModal() {
    const grid = document.getElementById("wallpaper-grid");
    grid.innerHTML = ""; // Limpiar

    // Obtener el ID actual (si es null, asumimos 'default')
    const currentId = localStorage.getItem("dashboardWallpaperId") || 'default';

    // OPCIÓN: Rotación Automática
    const autoDiv = document.createElement("div");
    autoDiv.className = "wallpaper-option";
    autoDiv.style.display = "flex";
    autoDiv.style.alignItems = "center";
    autoDiv.style.justifyContent = "center";
    autoDiv.style.backgroundColor = "var(--primary)";
    autoDiv.style.color = "white";
    autoDiv.innerText = "🔄 Auto";
    autoDiv.onclick = () => setWallpaper('auto');
    
    // Marcar si está seleccionado
    if (currentId === 'auto') {
        autoDiv.classList.add('selected');
    }
    grid.appendChild(autoDiv);

    // Detectar si es móvil para mostrar la miniatura correcta
    const isMobile = window.innerWidth <= 768;

    wallpapers.forEach(wp => {
        const img = document.createElement("img");
        // Usar mobileUrl si es móvil y existe, si no usar url normal
        const thumbUrl = (isMobile && wp.mobileUrl) ? wp.mobileUrl : wp.url;

        // Si es la opción "Por defecto" (url vacía), usamos una imagen placeholder o un color sólido
        img.src = thumbUrl ? thumbUrl : 'https://via.placeholder.com/150/e9ecef/333333?text=Original';
        img.className = "wallpaper-option";
        img.title = wp.name;
        // Ahora pasamos el ID en lugar de la URL directa
        img.onclick = () => setWallpaper(wp.id);

        // Marcar si está seleccionado
        if (wp.id === currentId) {
            img.classList.add('selected');
        }
        grid.appendChild(img);
    });

    document.getElementById("wallpaper-modal").classList.add("active");
}

function setWallpaper(id) {
    // Lógica para Rotación Automática
    if (id === 'auto') {
        localStorage.setItem("dashboardWallpaperId", 'auto');
        startAutoRotation();
        showToast("Rotación automática activada (1 min)", "success");
        closeModal("wallpaper-modal");
        return;
    }
    stopAutoRotation(); // Detener rotación si se elige uno fijo

    const wp = wallpapers.find(w => w.id === id);
    
    if (wp && wp.id !== 'default') {
        // Detectar si es móvil (ancho menor a 768px)
        const isMobile = window.innerWidth <= 768;
        const urlToUse = (isMobile && wp.mobileUrl) ? wp.mobileUrl : wp.url;

        document.body.style.backgroundImage = `url('${urlToUse}')`;
        localStorage.setItem("dashboardWallpaperId", id); // Guardamos el ID, no la URL
        showToast("Fondo actualizado", "success");
    } else {
        // Restaurar fondo original
        document.body.style.backgroundImage = "";
        localStorage.removeItem("dashboardWallpaperId");
        showToast("Fondo restaurado", "info");
    }
    closeModal("wallpaper-modal");
}

function loadSavedWallpaper() {
    // Solo aplicar si estamos en el dashboard (no en login)
    const dashboard = document.getElementById("dashboard-view");
    // Verificamos si el dashboard está visible o si hay un usuario logueado
    const token = getToken();
    
    if (token) {
        const savedId = localStorage.getItem("dashboardWallpaperId");
        
        if (savedId === 'auto') {
            if (!rotationInterval) startAutoRotation();
            else applyAutoWallpaper(); // Re-aplicar el actual si se redimensiona
            return;
        }

        if (savedId) {
            const wp = wallpapers.find(w => w.id === savedId);
            if (wp) {
                const isMobile = window.innerWidth <= 768;
                const urlToUse = (isMobile && wp.mobileUrl) ? wp.mobileUrl : wp.url;
                
                document.body.style.backgroundImage = `url('${urlToUse}')`;
                document.body.classList.remove('auth-background');
            }
        }
    }
}

// --- FUNCIONES PARA ROTACIÓN AUTOMÁTICA ---
function startAutoRotation() {
    if (rotationInterval) clearInterval(rotationInterval);
    changeRandomWallpaper(); // Cambiar inmediatamente
    // Cambiar cada 60 segundos (60000 ms)
    rotationInterval = setInterval(changeRandomWallpaper, 60000);
}

function stopAutoRotation() {
    if (rotationInterval) clearInterval(rotationInterval);
    rotationInterval = null;
}

function changeRandomWallpaper() {
    const valid = wallpapers.filter(w => w.id !== 'default');
    if (valid.length === 0) return;
    currentAutoWallpaperObj = valid[Math.floor(Math.random() * valid.length)];
    applyAutoWallpaper();
}

function applyAutoWallpaper() {
    if (!currentAutoWallpaperObj) return;
    const isMobile = window.innerWidth <= 768;
    const urlToUse = (isMobile && currentAutoWallpaperObj.mobileUrl) ? currentAutoWallpaperObj.mobileUrl : currentAutoWallpaperObj.url;
    document.body.style.backgroundImage = `url('${urlToUse}')`;
    document.body.classList.remove('auth-background');
}

/* ======================
   MODALES (LÓGICA)
====================== */
function openEditBaseIncomeModal() {
    document.getElementById("editBaseIncomeAmount").value = currentBaseIncome;
    document.getElementById("edit-base-income-modal").classList.add("active");
}

function saveBaseIncome() {
    const newIncome = document.getElementById("editBaseIncomeAmount").value;
    if (!newIncome || parseFloat(newIncome) < 0) {
        return showToast("Por favor, ingresa un monto válido.", "error");
    }

    const token = getToken();

    fetch(`${API}/update-base-income`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ ingreso_mensual: parseFloat(newIncome) })
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => { throw new Error(err.message || "Error al actualizar."); });
        }
        return res.json();
    })
    .then(data => {
        showToast(data.message, "success");
        closeModal("edit-base-income-modal");
        loadPaymentStatus(); // Recargar para ver el nuevo valor
    })
    .catch(err => {
        showToast(err.message, "error");
    });
}

/* ======================
   METAS DE AHORRO
====================== */
function loadSavingsGoals() {
    const token = getToken();
    apiFetchJson(`${API}/savings-goals`, {
        headers: { "Authorization": "Bearer " + token }
    }, 2)
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
            div.className = "bg-white p-md rounded-xl shadow-sm border border-outline-variant flex flex-col justify-between";
            
            div.innerHTML = `
                <div>
                    <div class="flex justify-between items-center mb-sm">
                        <h4 class="font-headline-md text-headline-md text-primary font-bold">${escapeHtml(meta.nombre)}</h4>
                        <button onclick="deleteSavingsGoal(${meta.id})" class="text-on-surface-variant hover:text-error transition-colors flex items-center justify-center p-1.5 hover:bg-surface-container rounded-full" title="Eliminar">
                            <span class="material-symbols-outlined text-md text-error">delete</span>
                        </button>
                    </div>
                    <div class="flex justify-between font-label-sm text-label-sm text-on-surface-variant mb-xs">
                        <span class="font-numeric-data">${formatCurrency(meta.actual)} / ${formatCurrency(meta.objetivo)}</span>
                        <span class="font-semibold text-primary">${porcentaje}%</span>
                    </div>
                    <div class="w-full h-2 bg-surface-container rounded-full overflow-hidden mb-md">
                        <div class="h-full bg-secondary rounded-full" style="width: ${porcentaje}%"></div>
                    </div>
                </div>
                <div class="flex justify-between items-center mt-auto border-t border-outline-variant pt-sm">
                    <small class="font-label-sm text-label-sm text-on-surface-variant">Vence: ${meta.fecha}</small>
                    <button data-name="${escapeHtml(meta.nombre)}" onclick="openUpdateSavingsModal(${meta.id}, this.dataset.name, ${meta.actual})" class="bg-primary text-on-primary font-label-sm text-label-sm px-md py-1.5 rounded-lg hover:opacity-90 transition-opacity shadow-sm font-bold">
                        ＋ Agregar
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    })
    .catch(err => {
        console.error("Error cargando ahorros:", err);
        if (isAuthExpired(err)) return logout();
        showToast(err.message || "No se pudieron cargar las metas de ahorro.", err.recoverable ? "info" : "error");
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
    const token = getToken();

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
    const token = getToken();

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
            filterMovements(); // Recargar movimientos si se creó un gasto
            loadPaymentStatus();
        }
    });
}

function deleteSavingsGoal(id) {
    if (!confirm("¿Eliminar esta meta? Si tiene fondos, se devolverán a tu saldo.")) return;
    const token = getToken();
    fetch(`${API}/delete-savings-goal/${id}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } })
    .then(res => res.json())
    .then(data => {
        showToast(data.message, 'success');
        loadSavingsGoals();
        filterMovements(); // Actualizar historial para ver la devolución
        loadPaymentStatus(); // Actualizar balance en el header
    });
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

    const token = getToken();

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
