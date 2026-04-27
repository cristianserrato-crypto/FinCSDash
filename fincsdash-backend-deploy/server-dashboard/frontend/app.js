(function () {
  const POLL_MS = 5000;
  const HISTORY_MAX = 36;
  const TOKEN_KEY = "sysdash_token";

  const $ = (sel) => document.querySelector(sel);

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {},
  };

  const gridColor = "rgba(56, 189, 248, 0.08)";
  const lineColor = "#22d3ee";
  const fillColor = "rgba(34, 211, 238, 0.15)";

  let chartCpu, chartLoad, chartRam, chartSwap;
  const cpuHistory = [];
  const loadHistory = [];
  let labels = [];

  function fmtBytes(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < u.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
  }

  function fmtUptime(sec) {
    const s = Math.floor(sec);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(t) {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  function showGate(show) {
    const root = document.documentElement;
    if (show) root.classList.remove("has-token");
    else root.classList.add("has-token");
  }

  async function fetchMetrics() {
    const token = getToken();
    const res = await fetch("/api/metrics", {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) throw new Error("auth");
    if (!res.ok) throw new Error("http " + res.status);
    return res.json();
  }

  function pushHistory(arr, val, max) {
    arr.push(val);
    if (arr.length > max) arr.shift();
  }

  function initCharts() {
    const ctxCpu = $("#chartCpu").getContext("2d");
    chartCpu = new Chart(ctxCpu, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            borderColor: lineColor,
            backgroundColor: fillColor,
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        ...chartDefaults,
        scales: {
          x: { display: false },
          y: {
            min: 0,
            max: 100,
            ticks: { color: "#64748b", font: { size: 10 } },
            grid: { color: gridColor },
          },
        },
      },
    });

    const ctxLoad = $("#chartLoad").getContext("2d");
    chartLoad = new Chart(ctxLoad, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.12)",
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        ...chartDefaults,
        scales: {
          x: { display: false },
          y: {
            beginAtZero: true,
            ticks: { color: "#64748b", font: { size: 10 } },
            grid: { color: gridColor },
          },
        },
      },
    });

    const doughnutOpts = {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "72%",
      plugins: { legend: { display: false } },
    };

    chartRam = new Chart($("#chartRam").getContext("2d"), {
      type: "doughnut",
      data: {
        datasets: [
          {
            data: [0, 100],
            backgroundColor: [lineColor, "rgba(30, 41, 59, 0.8)"],
            borderWidth: 0,
          },
        ],
      },
      options: doughnutOpts,
    });

    chartSwap = new Chart(document.getElementById("chartSwap").getContext("2d"), {
      type: "doughnut",
      data: {
        datasets: [
          {
            data: [0, 100],
            backgroundColor: ["#3b82f6", "rgba(30, 41, 59, 0.8)"],
            borderWidth: 0,
          },
        ],
      },
      options: doughnutOpts,
    });
  }

  function updateCharts(data) {
    const t = new Date().toLocaleTimeString("es", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    pushHistory(cpuHistory, data.cpu.percent, HISTORY_MAX);
    pushHistory(loadHistory, data.system.load_avg["1m"], HISTORY_MAX);
    pushHistory(labels, t, HISTORY_MAX);

    chartCpu.data.labels = labels;
    chartCpu.data.datasets[0].data = cpuHistory;
    chartCpu.update("none");

    chartLoad.data.labels = labels;
    chartLoad.data.datasets[0].data = loadHistory;
    const maxL = Math.max(0.5, ...loadHistory, data.system.load_avg["1m"] * 1.2);
    chartLoad.options.scales.y.suggestedMax = maxL;
    chartLoad.update("none");

    const rp = data.memory.percent;
    chartRam.data.datasets[0].data = [rp, Math.max(0, 100 - rp)];
    chartRam.update("none");

    const sp = data.swap.total > 0 ? data.swap.percent : 0;
    chartSwap.data.datasets[0].data = [sp, Math.max(0, 100 - sp)];
    chartSwap.update("none");
  }

  function render(data) {
    $("#cpuValue").textContent = `${data.cpu.percent.toFixed(1)}%`;
    $("#ramValue").textContent = `${data.memory.percent.toFixed(1)}%`;
    $("#swapValue").textContent =
      data.swap.total > 0 ? `${data.swap.percent.toFixed(1)}%` : "N/A";

    $("#hostPill").textContent = data.system.hostname;
    $("#lastUpdate").textContent = new Date().toLocaleString("es");

    $("#loadAvg").textContent = `1m ${data.system.load_avg["1m"].toFixed(2)} · 5m ${data.system.load_avg["5m"].toFixed(2)} · 15m ${data.system.load_avg["15m"].toFixed(2)} · uptime ${fmtUptime(data.system.uptime_seconds)}`;

    const cores = $("#cpuCores");
    cores.innerHTML = "";
    (data.cpu.per_cpu || []).forEach((p) => {
      const wrap = document.createElement("div");
      wrap.className = "core-bar";
      const inner = document.createElement("span");
      inner.style.width = `${Math.min(100, p)}%`;
      wrap.appendChild(inner);
      cores.appendChild(wrap);
    });

    const ramStats = $("#ramStats");
    ramStats.innerHTML = `
      <li><span>Usado</span><strong>${fmtBytes(data.memory.used)}</strong></li>
      <li><span>Disponible</span><strong>${fmtBytes(data.memory.available)}</strong></li>
      <li><span>Total</span><strong>${fmtBytes(data.memory.total)}</strong></li>
    `;

    const sw = $("#swapStats");
    if (data.swap.total > 0) {
      sw.innerHTML = `
        <li><span>Usado</span><strong>${fmtBytes(data.swap.used)}</strong></li>
        <li><span>Libre</span><strong>${fmtBytes(data.swap.free)}</strong></li>
        <li><span>Total</span><strong>${fmtBytes(data.swap.total)}</strong></li>
      `;
    } else {
      sw.innerHTML = `<li><span>Swap</span><strong>no configurado</strong></li>`;
    }

    const fc = data.fincsdash_users || {};
    $("#fcTotal").textContent = `${fc.total ?? 0} usuarios`;
    $("#fcVerified").textContent = `${fc.verified_count ?? 0} verificados`;

    const fcHint = $("#fcHint");
    const fcErr = $("#fcError");
    if (!fc.configured) {
      fcHint.textContent =
        fc.error ||
        "Configura las mismas variables DB_* que FinCSDash en ~/server-dashboard/sysdash.env (ver README). Para PostgreSQL local suele hacer falta DB_SSLMODE=disable.";
      fcErr.setAttribute("hidden", "hidden");
    } else if (fc.error) {
      fcHint.textContent = "";
      fcErr.textContent = "Base de datos: " + fc.error;
      fcErr.removeAttribute("hidden");
    } else {
      fcHint.textContent =
        "Datos leídos de la tabla usuarios (solo lectura). Se actualiza con el resto del panel.";
      fcErr.setAttribute("hidden", "hidden");
    }

    const fcBody = $("#fcUsersBody");
    fcBody.innerHTML = "";
    (fc.users || []).forEach((u) => {
      const tr = document.createElement("tr");
      const ok = u.verificado ? "Sí" : "No";
      tr.innerHTML = `
        <td>${u.id}</td>
        <td class="name-cell" title="${escapeHtml(u.email)}">${escapeHtml(u.email)}</td>
        <td>${ok}</td>
      `;
      fcBody.appendChild(tr);
    });

    const diskList = $("#diskList");
    diskList.innerHTML = "";
    (data.disk || []).forEach((d) => {
      const el = document.createElement("div");
      el.className = "disk-item";
      el.innerHTML = `
        <header>
          <span class="mount">${escapeHtml(d.mountpoint)}</span>
          <span class="pct">${d.percent.toFixed(1)}%</span>
        </header>
        <div class="disk-bar"><span style="width:${d.percent}%"></span></div>
        <div class="disk-meta">${escapeHtml(d.device)} · ${escapeHtml(d.fstype)} · usado ${fmtBytes(d.used)} / ${fmtBytes(d.total)}</div>
      `;
      diskList.appendChild(el);
    });

    const pb = $("#procBody");
    pb.innerHTML = "";
    (data.top_processes || []).forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.pid}</td>
        <td class="name-cell" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</td>
        <td>${p.memory_percent.toFixed(1)}</td>
        <td>${p.cpu_percent.toFixed(1)}</td>
      `;
      pb.appendChild(tr);
    });

    const sb = $("#svcBody");
    sb.innerHTML = "";
    const svcs = data.services || [];
    $("#svcCount").textContent = String(svcs.length);

    const errEl = $("#svcError");
    if (data.services_error) {
      errEl.textContent = "Servicios: " + data.services_error;
      errEl.removeAttribute("hidden");
    } else {
      errEl.setAttribute("hidden", "hidden");
    }

    svcs.forEach((s) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(s.unit)}</td>
        <td>${escapeHtml(s.active)} ${escapeHtml(s.sub)}</td>
        <td class="name-cell" title="${escapeHtml(s.description)}">${escapeHtml(s.description)}</td>
      `;
      sb.appendChild(tr);
    });

    updateCharts(data);
  }

  function escapeHtml(s) {
    if (!s) return "";
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  let timer;

  async function tick() {
    try {
      const data = await fetchMetrics();
      render(data);
    } catch (e) {
      if (e.message === "auth") {
        setToken("");
        document.documentElement.classList.remove("has-token");
        showGate(true);
        if (timer) clearInterval(timer);
      }
      console.error(e);
    }
  }

  function startPolling() {
    if (timer) clearInterval(timer);
    tick();
    timer = setInterval(tick, POLL_MS);
  }

  $("#intervalLabel").textContent = String(POLL_MS / 1000);

  $("#tokenSave").addEventListener("click", () => {
    const v = $("#tokenInput").value.trim();
    const err = $("#gateError");
    if (!v) {
      err.textContent = "Introduce un token.";
      err.removeAttribute("hidden");
      return;
    }
    setToken(v);
    err.setAttribute("hidden", "hidden");
    fetchMetrics()
      .then(() => {
        $("#tokenInput").value = "";
        document.documentElement.classList.add("has-token");
        showGate(false);
        startPolling();
      })
      .catch(() => {
        setToken("");
        err.textContent = "Token inválido o error de red.";
        err.removeAttribute("hidden");
      });
  });

  $("#btnLogout").addEventListener("click", () => {
    setToken("");
    document.documentElement.classList.remove("has-token");
    showGate(true);
    if (timer) clearInterval(timer);
  });

  document.addEventListener("DOMContentLoaded", () => {
    initCharts();
    if (!getToken()) {
      showGate(true);
      return;
    }
    showGate(false);
    startPolling();
  });
})();
