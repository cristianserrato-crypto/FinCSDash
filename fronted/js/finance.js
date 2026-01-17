let chartFinanzas = null;

// ======================
// INGRESOS
// ======================
function agregarIngreso() {
    fetch("http://127.0.0.1:5000/add-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: usuarioActual,
            monto: document.getElementById("incomeMonto").value,
            fecha: document.getElementById("incomeFecha").value
        })
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("incomeResult").innerText = data.message;
    });
}

// ======================
// GASTOS
// ======================
function agregarGasto() {
    fetch("http://127.0.0.1:5000/add-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: usuarioActual,
            tipo: document.getElementById("expenseTipo").value,
            monto: document.getElementById("expenseMonto").value,
            fecha: document.getElementById("expenseFecha").value
        })
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("expenseResult").innerText = data.message;
    });
}

// ======================
// BALANCE + GRÁFICA
// ======================
function consultarBalance() {
    fetch("http://127.0.0.1:5000/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: usuarioActual })
    })
    .then(res => res.json())
    .then(data => {
        document.getElementById("balanceResult").innerText =
            "Ingresos: " + data.ingresos +
            " | Gastos: " + data.gastos +
            " | Balance: " + data.balance;

        dibujarGrafica(data.ingresos, data.gastos);
    });
}

function dibujarGrafica(ingresos, gastos) {
    const ctx = document.getElementById("graficaFinanzas").getContext("2d");

    if (chartFinanzas) chartFinanzas.destroy();

    chartFinanzas = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Ingresos", "Gastos"],
            datasets: [{
                data: [ingresos, gastos],
                backgroundColor: ["#4CAF50", "#F44336"]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: "bottom" }
            }
        }
    });
}
