"""
Dashboard de métricas del servidor (solo lectura).
Protegido con DASHBOARD_TOKEN (Bearer en Authorization).
"""

import os
import subprocess
from functools import wraps
from pathlib import Path

import psutil
from flask import Flask, jsonify, request, send_from_directory

# Raíz del proyecto server-dashboard (backend/..)
ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "frontend"

app = Flask(__name__, static_folder=str(STATIC), static_url_path="")

TOKEN = (os.environ.get("DASHBOARD_TOKEN") or "").strip()
ALLOWED_ORIGINS = os.environ.get(
    "DASHBOARD_CORS_ORIGINS",
    "http://127.0.0.1:8001,http://localhost:8001",
).split(",")


def require_token(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not TOKEN:
            return jsonify({"error": "DASHBOARD_TOKEN no configurado en el servidor"}), 503
        auth = request.headers.get("Authorization", "")
        if auth != f"Bearer {TOKEN}":
            return jsonify({"error": "No autorizado"}), 401
        return fn(*args, **kwargs)

    return wrapper


def run_systemctl_list():
    """Lista servicios systemd en ejecución (solo lectura)."""
    try:
        out = subprocess.run(
            [
                "systemctl",
                "list-units",
                "--type=service",
                "--state=running",
                "--no-pager",
                "--no-legend",
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if out.returncode != 0:
            return [], out.stderr or "systemctl error"
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        return [], str(e)

    services = []
    for line in out.stdout.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split(None, 4)
        if len(parts) < 1:
            continue
        unit = parts[0]
        if not unit.endswith(".service"):
            continue
        load = parts[1] if len(parts) > 1 else ""
        active = parts[2] if len(parts) > 2 else ""
        sub = parts[3] if len(parts) > 3 else ""
        desc = parts[4] if len(parts) > 4 else ""
        services.append(
            {
                "unit": unit,
                "load": load,
                "active": active,
                "sub": sub,
                "description": desc.strip(),
            }
        )
    services.sort(key=lambda x: x["unit"])
    return services, None


def fetch_fincsdash_usuarios():
    """Cuenta y listado de usuarios FinCSDash (tabla usuarios en PostgreSQL)."""
    required = ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD")
    missing = [k for k in required if not (os.environ.get(k) or "").strip()]
    if missing:
        return {
            "configured": False,
            "total": 0,
            "verified_count": 0,
            "users": [],
            "error": "Añade en sysdash.env: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD (y opcional DB_PORT, DB_SSLMODE).",
        }
    try:
        import psycopg2

        conn = psycopg2.connect(
            host=os.environ["DB_HOST"],
            database=os.environ["DB_NAME"],
            user=os.environ["DB_USER"],
            password=os.environ["DB_PASSWORD"],
            port=os.environ.get("DB_PORT", "5432"),
            sslmode=os.environ.get("DB_SSLMODE", "prefer"),
            connect_timeout=8,
        )
        cur = conn.cursor()
        cur.execute(
            "SELECT id, email, COALESCE(verificado, 0) FROM usuarios ORDER BY id ASC"
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        users = [
            {"id": int(r[0]), "email": r[1], "verificado": int(r[2] or 0)} for r in rows
        ]
        verified = sum(1 for u in users if u["verificado"])
        return {
            "configured": True,
            "total": len(users),
            "verified_count": verified,
            "users": users,
            "error": None,
        }
    except Exception as e:
        return {
            "configured": True,
            "total": 0,
            "verified_count": 0,
            "users": [],
            "error": str(e),
        }


@app.after_request
def cors_headers(resp):
    origin = request.headers.get("Origin")
    if origin and origin.rstrip("/") in [o.rstrip("/") for o in ALLOWED_ORIGINS if o.strip()]:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return resp


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/api/metrics", methods=["OPTIONS"])
def metrics_options():
    return "", 204


@app.route("/api/metrics", methods=["GET"])
@require_token
def metrics():
    cpu_pct = psutil.cpu_percent(interval=0.25)
    per_cpu = psutil.cpu_percent(interval=None, percpu=True)
    vm = psutil.virtual_memory()
    sw = psutil.swap_memory()

    disks = []
    try:
        for part in psutil.disk_partitions(all=False):
            if "cdrom" in part.opts or not part.fstype:
                continue
            try:
                u = psutil.disk_usage(part.mountpoint)
            except PermissionError:
                continue
            disks.append(
                {
                    "mountpoint": part.mountpoint,
                    "device": part.device,
                    "fstype": part.fstype,
                    "total": u.total,
                    "used": u.used,
                    "free": u.free,
                    "percent": u.percent,
                }
            )
    except Exception:
        pass

    services, sys_err = run_systemctl_list()
    fincsdash_users = fetch_fincsdash_usuarios()

    procs = []
    try:
        for p in sorted(
            psutil.process_iter(["pid", "name", "memory_percent", "cpu_percent"]),
            key=lambda x: x.info.get("memory_percent") or 0,
            reverse=True,
        )[:12]:
            info = p.info
            if info.get("name"):
                procs.append(
                    {
                        "pid": info.get("pid"),
                        "name": info.get("name"),
                        "memory_percent": round(info.get("memory_percent") or 0, 2),
                        "cpu_percent": round(info.get("cpu_percent") or 0, 2),
                    }
                )
    except Exception:
        pass

    load1, load5, load15 = os.getloadavg() if hasattr(os, "getloadavg") else (0, 0, 0)
    bt = psutil.boot_time()

    return jsonify(
        {
            "system": {
                "hostname": os.uname().nodename,
                "platform": f"{os.uname().sysname} {os.uname().release}",
                "boot_time": bt,
                "uptime_seconds": __import__("time").time() - bt,
                "load_avg": {"1m": load1, "5m": load5, "15m": load15},
            },
            "cpu": {
                "percent": round(cpu_pct, 2),
                "count_logical": psutil.cpu_count(logical=True) or 0,
                "count_physical": psutil.cpu_count(logical=False) or 0,
                "per_cpu": [round(x, 2) for x in per_cpu],
            },
            "memory": {
                "total": vm.total,
                "available": vm.available,
                "used": vm.used,
                "percent": vm.percent,
            },
            "swap": {
                "total": sw.total,
                "used": sw.used,
                "free": sw.free,
                "percent": sw.percent,
            },
            "disk": disks,
            "services": services,
            "services_error": sys_err,
            "top_processes": procs,
            "python_psutil": True,
            "fincsdash_users": fincsdash_users,
        }
    )


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def static_files(path):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    target = STATIC / path
    if target.is_file():
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8001"))
    app.run(host="127.0.0.1", port=port, debug=False)
