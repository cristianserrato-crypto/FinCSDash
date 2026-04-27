#!/usr/bin/env python3
"""Copia DB_* desde /etc/systemd/system/fincsdash.service hacia ~/server-dashboard/sysdash.env."""
import re
import sys
from pathlib import Path

HOME = Path.home()
SD_ENV = HOME / "server-dashboard" / "sysdash.env"
SVC = Path("/etc/systemd/system/fincsdash.service")


def load_env_file(p: Path) -> dict:
    d = {}
    if p.exists():
        for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            d[k.strip()] = v.strip()
    return d


def load_db_from_systemd(p: Path) -> dict:
    if not p.exists():
        return {}
    text = p.read_text(encoding="utf-8", errors="replace")
    d = {}
    for m in re.finditer(r'Environment="(DB_[A-Z0-9_]+)=([^"]*)"', text):
        d[m.group(1)] = m.group(2).strip()
    return d


def main():
    if not SVC.exists():
        print("No existe fincsdash.service", file=sys.stderr)
        return 1
    env = load_env_file(SD_ENV)
    db = load_db_from_systemd(SVC)
    if not db:
        print("No se encontraron variables DB_ en fincsdash.service", file=sys.stderr)
        return 1
    for k, v in db.items():
        env.setdefault(k, v)
    if "DB_SSLMODE" not in env:
        env["DB_SSLMODE"] = "disable"
    order = []
    if "DASHBOARD_TOKEN" in env:
        order.append("DASHBOARD_TOKEN")
    order.extend(sorted(k for k in env if k != "DASHBOARD_TOKEN"))
    lines = [f"{k}={env[k]}" for k in order]
    SD_ENV.parent.mkdir(parents=True, exist_ok=True)
    SD_ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")
    SD_ENV.chmod(0o600)
    print("sysdash.env actualizado con:", ", ".join(sorted(db.keys())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
