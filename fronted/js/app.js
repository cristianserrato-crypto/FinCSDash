const API = "http://127.0.0.1:5000";
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
        body { background-color: #ffffff !important; color: #333 !important; }
        section { background-color: #ffffff !important; }
        /* Botones que antes eran azules (primary) ahora grises */
        button, .btn, .btn-primary { 
            background-color: #6c757d !important; 
            border-color: #6c757d !important; 
            color: white !important;
        }
        button:hover { background-color: #5a6268 !important; }

        /* Estilos mejorados para la tabla */
        table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 20px;
            box-shadow: 0 2px 15px rgba(0,0,0,0.1);
            border-radius: 8px;
            overflow: hidden;
        }
        th, td {
            padding: 12px 15px;
            text-align: center;
        }
        thead tr {
            background-color: #343a40 !important;
            color: white;
            text-transform: uppercase;
            font-size: 0.9rem;
            letter-spacing: 0.05em;
        }
        tbody tr {
            border-bottom: 1px solid #dddddd;
        }
        tbody tr:nth-of-type(even) {
            background-color: #f8f9fa;
        }
        tbody tr:hover {
            background-color: #e2e6ea;
            transition: background-color 0.2s ease-in-out;
        }

        /* Spinner de carga */
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px auto;
            display: block;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // INYECTAR ESTRUCTURA DEL DASHBOARD (Para asegurar que se vean los elementos)
    const dashboard = document.getElementById("dashboard-view");
    if (dashboard) {
        dashboard.innerHTML = `
            <div style="max-width: 900px; margin: 20px auto; padding: 20px;">
                <!-- Encabezado -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <img src="${API}/logo" alt="FinCSDash" style="height: 50px;">
                        <h2 style="margin: 0;">Mi Panel</h2>
                    </div>
                    <div style="text-align: right;">
                        <small style="display: block; color: #666;">Usuario:</small>
                        <span id="userEmail" style="font-weight: bold; font-size: 1.1em;"></span>
                        <button onclick="logout()" class="btn btn-sm btn-danger" style="margin-left: 10px; background-color: #dc3545 !important;">Cerrar Sesión</button>
                    </div>
                </div>

                <!-- Panel de Control -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                    <!-- Tarjeta Agregar -->
                    <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                        <h4 style="margin-top: 0; margin-bottom: 20px; color: #495057;">Agregar Movimiento</h4>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #666;">Categoría</label>
                            <select id="categoriaSelect" class="form-control" style="width: 100%; padding: 12px; border: 1px solid #ced4da; border-radius: 5px; background: white;"></select>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #666;">Monto ($)</label>
                                <input type="number" id="expenseAmount" placeholder="0.00" style="width: 100%; padding: 12px; border: 1px solid #ced4da; border-radius: 5px; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #666;">Fecha</label>
                                <input type="date" id="expenseDate" style="width: 100%; padding: 12px; border: 1px solid #ced4da; border-radius: 5px; box-sizing: border-box;">
                            </div>
                        </div>

                        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                            <button onclick="addIncome()" class="btn" style="flex: 1; padding: 12px; font-weight: bold; background-color: #28a745 !important; border: none; border-radius: 5px;">+ Ingreso</button>
                            <button onclick="addExpense()" class="btn" style="flex: 1; padding: 12px; font-weight: bold; background-color: #dc3545 !important; border: none; border-radius: 5px;">- Gasto</button>
                        </div>

                        <div style="border-top: 1px solid #e9ecef; padding-top: 15px; display: flex; gap: 10px; align-items: center;">
                            <input type="text" id="newCategoryInput" placeholder="Nombre nueva categoría..." style="flex: 1; padding: 10px; border: 1px solid #ced4da; border-radius: 5px;">
                            <button onclick="addCategory()" style="padding: 10px 15px; background-color: #6c757d !important; border-radius: 5px;">Crear</button>
                        </div>
                    </div>
                    <!-- Tarjeta Resumen -->
                    <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #eee;">
                        <h4 style="margin-top: 0;">Resumen</h4>
                        <h2 id="filteredBalanceDisplay" style="font-size: 2.5em; margin: 10px 0;">$0.00</h2>
                        <div style="margin-top: 20px;">
                            <label>Filtrar por fecha:</label>
                            <input type="month" id="monthFilter" onchange="filterMovements()" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; width: 100%;">
                        </div>
                        <div style="margin-top: 20px; display: flex; gap: 10px;">
                            <button onclick="exportToCSV()" class="btn" style="flex: 1;">Exportar CSV</button>
                            <button onclick="exportToPDF()" class="btn" style="flex: 1;">Exportar PDF</button>
                        </div>
                    </div>
                </div>

                <!-- Gráfico y Tabla -->
                <div style="margin-bottom: 40px; height: 300px;"><canvas id="expenseChart"></canvas></div>
                <h3 style="border-bottom: 2px solid #343a40; padding-bottom: 10px;">Historial</h3>
                <div style="overflow-x: auto;">
                    <table>
                        <thead><tr><th>Fecha</th><th>Categoría</th><th onclick="sortTable('monto')" style="cursor:pointer;">Monto ↕</th><th>Acciones</th></tr></thead>
                        <tbody id="movementsTableBody"></tbody>
                    </table>
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
