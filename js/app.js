const API = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://127.0.0.1:5000"
    : "https://fincsdash-backend.onrender.com";

let currentUser = null;
let usuarioActual = null;
let currentMovements = []; // Para guardar los datos y poder ordenarlos
let sortAsc = true;        // Para alternar entre ascendente y descendente
let myChart = null;        // Variable global para el gráfico

/* ======================
   ESTILOS (INYECCIÓN)
====================== */
// Cambiar fondo a blanco y botones a gris
document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement('style');
    style.innerHTML = `
        :root {
            --primary: #4361ee;
            --success: #2ec4b6;
            --danger: #e63946;
            --dark: #2b2d42;
            --light: #f8f9fa;
            --bg-body: #f4f7f6;
            --card-bg: #ffffff;
            --text-muted: #6c757d;
        }

        body { 
            background-color: var(--bg-body) !important; 
            color: var(--dark) !important; 
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
        }

        /* Layout & Cards */
        .dashboard-container { max-width: 1100px; margin: 30px auto; padding: 0 20px; }
        
        .card {
            background: var(--card-bg);
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            padding: 25px;
            margin-bottom: 25px;
            border: 1px solid rgba(0,0,0,0.02);
        }

        .header-bar {
            background: var(--card-bg);
            padding: 15px 25px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.03);
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 30px;
        }

        .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 25px; }

        /* Typography */
        h2, h3, h4 { margin-top: 0; color: var(--dark); font-weight: 700; }
        .text-muted { color: var(--text-muted); font-size: 0.9em; }
        .balance-title { font-size: 2.8em; margin: 10px 0; color: var(--primary); font-weight: 800; }

        /* Forms */
        .form-group { margin-bottom: 15px; }
        .form-label { display: block; margin-bottom: 8px; font-weight: 600; color: #555; font-size: 0.9rem; }
        .form-control {
            width: 100%; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px;
            font-size: 1rem; transition: all 0.2s; box-sizing: border-box;
        }
        .form-control:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.15); }

        /* Buttons */
        .btn {
            padding: 12px 20px; border: none; border-radius: 8px; font-weight: 600;
            cursor: pointer; transition: transform 0.1s, opacity 0.2s; font-size: 0.95rem;
        }
        .btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-primary { background-color: var(--primary) !important; color: white !important; }
        .btn-success { background-color: var(--success) !important; color: white !important; }
        .btn-danger { background-color: var(--danger) !important; color: white !important; }
        .btn-secondary { background-color: #6c757d !important; color: white !important; }
        .w-100 { width: 100%; }
        .flex-gap { display: flex; gap: 10px; }

        /* Table */
        .table-container { overflow-x: auto; border-radius: 12px; }
        table { width: 100%; border-collapse: collapse; background: white; }
        th { 
            background-color: #f8f9fa; color: var(--text-muted); padding: 15px; 
            text-align: left; font-weight: 600; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px;
            border-bottom: 2px solid #eee;
        }
        td { padding: 15px; border-bottom: 1px solid #f1f1f1; vertical-align: middle; }
        tr:hover td { background-color: #fcfcfc; }
        
        /* Spinner */
        .spinner {
            border: 3px solid rgba(0,0,0,0.1);
            border-top: 3px solid var(--primary);
            border-radius: 50%;
            width: 24px; height: 24px;
            animation: spin 1s linear infinite;
            display: inline-block; vertical-align: middle;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // INYECTAR LIBRERÍA CHART.JS (Corrección para gráficos)
    if (!document.querySelector('script[src*="chart.js"]')) {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        script.onload = () => {
            if (currentMovements.length > 0) renderChart(currentMovements);
        };
        document.head.appendChild(script);
    }

    // INYECTAR ESTRUCTURA DEL DASHBOARD (Para asegurar que se vean los elementos)
    const dashboard = document.getElementById("dashboard-view");
    if (dashboard) {
        dashboard.innerHTML = `
            <div class="dashboard-container">
                <!-- Encabezado -->
                <div class="header-bar">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <img src="${API}/logo" alt="FinCSDash" style="height: 45px;">
                        <h2 style="margin: 0; font-size: 1.5rem;">FinCSDash</h2>
                    </div>
                    <div style="text-align: right;">
                        <small class="text-muted" style="display: block;">Bienvenido,</small>
                        <span id="userEmail" style="font-weight: 600;"></span>
                        <button onclick="logout()" class="btn btn-danger" style="padding: 6px 15px; font-size: 0.85rem; margin-left: 15px;">Salir</button>
                    </div>
                </div>

                <!-- Panel de Control -->
                <div class="grid-2">
                    <!-- Tarjeta Agregar -->
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
                    <!-- Tarjeta Resumen -->
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

                <!-- Gráfico y Tabla -->
                <div class="card">
                    <h4>📈 Análisis de Gastos</h4>
                    <div style="height: 300px; position: relative;"><canvas id="expenseChart"></canvas></div>
                </div>

                <div class="card">
                    <h3 style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">Historial de Movimientos</h3>
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
        `;
        // Fecha por defecto hoy
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById("expenseDate");
        if(dateInput) dateInput.value = today;
    }

    // VERIFICAR SESIÓN AL CARGAR (CORRECCIÓN F5)
    const storedToken = localStorage.getItem("token");
    const storedEmail = localStorage.getItem("email");
    if (storedToken && storedEmail) {
        showDashboard(storedEmail);
    } else {
        showLogin();
    }
});

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
    loadCategories();
    loadMovements();
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
            email: document.getElementById("loginEmail").value,
            password: document.getElementById("loginPassword").value
        })
    })
    .then(res => res.json())
    .then(data => {
        const msg = document.getElementById("loginMsg");
        if(msg) msg.innerText = data.message;
        
        if (data.message === "Login exitoso") {
            localStorage.setItem("token", data.token);
            currentUser = document.getElementById("loginEmail").value;
            localStorage.setItem("email", currentUser); // Guardar email para F5
            showDashboard(currentUser);
        }
    });
}

/* ======================
   MOVIMIENTOS (TABLA)
====================== */
function loadMovements(month = null, year = null) {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Mostrar spinner en la tabla antes de cargar
    const tbody = document.getElementById("movementsTableBody");
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="padding: 20px; color: #666;">
                    <div class="spinner"></div> Cargando movimientos...
                </td>
            </tr>`;
    }

    let url = `${API}/movements`;
    if (month && year) {
        url += `?month=${month}&year=${year}`;
    }

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

function renderMovements(data) {
    const tbody = document.getElementById("movementsTableBody");
    if (!tbody) return;

    tbody.innerHTML = ""; // Limpiar tabla actual
    
    let totalIngresos = 0;
    let totalGastos = 0;

    data.forEach(mov => {
        if (mov.tipo === "Ingreso") {
            totalIngresos += parseFloat(mov.monto);
        } else {
            totalGastos += parseFloat(mov.monto);
        }

        // Formatear fecha de YYYY-MM-DD a DD/MM/YYYY
        const [year, month, day] = mov.fecha.split("-");
        const formattedDate = `${day}/${month}/${year}`;

        const row = document.createElement("tr");
        const color = mov.tipo === "Ingreso" ? "green" : "red";
        const signo = mov.tipo === "Ingreso" ? "+" : "-";
        
        row.innerHTML = `
            <td>${formattedDate}</td>
            <td>${mov.categoria}</td>
            <td style="color: ${color}; font-weight: bold;">
                ${signo}$${parseFloat(mov.monto).toFixed(2)}
            </td>
            <td>
                <button onclick="deleteMovement(${mov.id}, '${mov.tipo}')" style="color: red; cursor: pointer;">🗑️</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Mostrar el balance calculado de los movimientos visibles
    const balanceDisplay = document.getElementById("filteredBalanceDisplay");
    if (balanceDisplay) {
        const balance = totalIngresos - totalGastos;
        balanceDisplay.innerText = `Balance: $${balance.toFixed(2)}`;
        balanceDisplay.style.color = balance >= 0 ? "green" : "red";
    }
}

/* ======================
   GRÁFICO (CHART.JS)
====================== */
function renderChart(data) {
    const ctx = document.getElementById('expenseChart');
    if (!ctx) return; // Si no existe el canvas, no hacemos nada

    // 1. Agrupar por categoría (Ingresos y Gastos)
    const montosPorCat = {};
    data.forEach(mov => {
        const cat = mov.categoria;
        const monto = parseFloat(mov.monto);
        montosPorCat[cat] = (montosPorCat[cat] || 0) + monto;
    });

    // Convertir a array para ordenar de mayor a menor
    const sortedData = Object.keys(montosPorCat).map(cat => ({
        cat: cat,
        amount: montosPorCat[cat]
    }));

    sortedData.sort((a, b) => b.amount - a.amount);

    const labels = sortedData.map(item => item.cat);
    const values = sortedData.map(item => item.amount);

    // Colores: Verde para Ingreso, Rojo para Gastos
    const bgColors = labels.map(cat => cat === "Ingreso" ? 'rgba(40, 167, 69, 0.6)' : 'rgba(220, 53, 69, 0.6)');
    const borderColors = labels.map(cat => cat === "Ingreso" ? 'rgba(40, 167, 69, 1)' : 'rgba(220, 53, 69, 1)');

    // 2. Destruir gráfico anterior si existe (para actualizar)
    if (myChart) {
        myChart.destroy();
    }

    // 3. Crear nuevo gráfico
    if (typeof Chart !== 'undefined') {
        myChart = new Chart(ctx, {
            type: 'bar', // Puedes cambiar a 'pie' o 'doughnut' si prefieres
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
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
}

function sortTable(column) {
    sortAsc = !sortAsc; // Invertir orden
    
    currentMovements.sort((a, b) => {
        let valA = column === 'monto' ? parseFloat(a[column]) : a[column].toString().toLowerCase();
        let valB = column === 'monto' ? parseFloat(b[column]) : b[column].toString().toLowerCase();

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    renderMovements(currentMovements);
}

function filterMovements() {
    const input = document.getElementById("monthFilter");
    if (!input || !input.value) return loadMovements(); // Cargar todo si está vacío

    // input.value viene como "2023-10"
    const [year, month] = input.value.split("-");
    loadMovements(month, year);
}

function deleteMovement(id, tipo) {
    if (!confirm("¿Estás seguro de eliminar este movimiento?")) return;

    const token = localStorage.getItem("token");
    // Determinamos si es gasto o ingreso para llamar al endpoint correcto
    const endpoint = tipo === "Ingreso" ? "/delete-income" : "/delete-expense";

    fetch(`${API}${endpoint}/${id}`, {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + token
        }
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        loadMovements(); // Recargar la tabla para ver los cambios
    });
}

/* ======================
   EXPORTAR A CSV
====================== */
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

        // Encabezados del CSV
        let csv = "Fecha,Tipo,Categoría,Monto\n";
        data.forEach(d => {
            // Protegemos la categoría por si tiene comas
            const cat = d.categoria.includes(",") ? `"${d.categoria}"` : d.categoria;
            csv += `${d.fecha},${d.tipo},${cat},${d.monto}\n`;
        });

        // Crear archivo blob con BOM (\uFEFF) para que Excel reconozca tildes
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
function exportToPDF() {
    const token = localStorage.getItem("token");
    if (!token) return;

    const input = document.getElementById("monthFilter");
    let url = `${API}/export-pdf`;

    if (input && input.value) {
        const [year, month] = input.value.split("-");
        url += `?month=${month}&year=${year}`;
    }

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
    .catch(err => alert(err.message));
}

/* ======================
   AGREGAR GASTO
====================== */
function addExpense() {
    const token = localStorage.getItem("token");
    
    // Obtenemos los valores del formulario
    // Asegúrate de que tus inputs en el HTML tengan estos IDs
    const tipo = document.getElementById("categoriaSelect").value;
    const monto = document.getElementById("expenseAmount").value;
    const fecha = document.getElementById("expenseDate").value;

    if (!tipo || !monto || !fecha) {
        return alert("Por favor completa todos los campos (Categoría, Monto y Fecha)");
    }

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
function addIncome() {
    const token = localStorage.getItem("token");
    const monto = document.getElementById("expenseAmount").value;
    const fecha = document.getElementById("expenseDate").value;

    if (!monto || !fecha) {
        return alert("Por favor completa el Monto y la Fecha");
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
function register() {
    const email = document.getElementById("registerEmail").value;
    const password = document.getElementById("registerPassword").value;

    fetch(`${API}/register`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            email: email,
            password: password
        })
    })
    .then(res => res.json())
    .then(data => {
        const msg = document.getElementById("registerMsg");
        if(msg) msg.innerText = data.message;

        // Si el mensaje indica éxito (contiene "registrado" o "código"), ir a verificar
        if (data.message.includes("registrado") || data.message.includes("código")) {
            document.getElementById("verifyEmail").value = email;
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
   LOGOUT
====================== */
function logout() {
    currentUser = null;
    localStorage.removeItem("token");
    localStorage.removeItem("email"); // Borrar email al salir
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

    const googleBtn = document.getElementById("googleBtn");
    if (googleBtn) {
        google.accounts.id.renderButton(
            googleBtn,
            { theme: "outline", size: "large" }
        );
    }
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
function loadCategories() {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch(`${API}/categories`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json())
    .then(categorias => {
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
    });
}

function addCategory() {
    const token = localStorage.getItem("token");
    const input = document.getElementById("newCategoryInput");
    const nombre = input ? input.value : "";

    if (!nombre) return alert("Escribe un nombre para la categoría");

    fetch(`${API}/add-category`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ nombre: nombre })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        if (data.message === "Categoría agregada") {
            input.value = "";
            loadCategories();
        }
    });
}
