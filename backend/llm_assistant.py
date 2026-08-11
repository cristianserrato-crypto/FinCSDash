"""
llm_assistant.py
Interpreta mensajes en lenguaje natural del chat usando un modelo local
servido por Ollama, y devuelve una intención estructurada (JSON) para que
app.py decida qué hacer. El modelo nunca calcula cifras financieras: solo
entiende el mensaje y extrae monto/categoria/fecha.
"""

import os
import json
import logging
from datetime import datetime, timedelta

import requests

logger = logging.getLogger(__name__)

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_TIMEOUT_SECONDS = int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "45"))

INTENTS = [
    "add_expense",
    "add_income",
    "query_balance",
    "query_biggest_expense",
    "query_savings",
    "list_pending",
    "delete_last_expense",
    "chat",
]

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": INTENTS},
        "monto": {"type": ["number", "null"]},
        "categoria": {"type": ["string", "null"]},
        "fecha": {"type": ["string", "null"]},
        "es_recurrente": {"type": "boolean"},
        "reply": {"type": "string"},
    },
    "required": ["intent", "reply", "monto", "categoria", "es_recurrente"],
}

SYSTEM_PROMPT_TEMPLATE = """Eres el asistente financiero de FinCSDash, una app para llevar el control de \
ingresos y gastos personales. Hoy es {hoy} ({dia_semana}). Ayer fue {ayer}.

Categorías de gasto/ingreso que ya usa este usuario: {categorias}.

Tu única función es interpretar el mensaje del usuario y devolver JSON con estos campos:
- intent: una de {intents}.
  - add_expense: el usuario PAGÓ, GASTÓ o COMPRÓ algo (dinero que sale). Verbos típicos: "gasté", \
"pagué", "compré", "me tocó pagar". Ej: "gasté 20 mil en comida", "pagué 15 mil de taxi".
  - add_income: el usuario RECIBIÓ dinero (dinero que entra). Verbos típicos: "me pagaron", "recibí", \
"me depositaron", "cobré". Ej: "me pagaron 500000 del sueldo".
  - Si el mensaje describe un pago/compra hecho POR el usuario, es SIEMPRE add_expense, nunca add_income.
  - Usa las query_* cuando pregunte por su saldo, su mayor gasto, sus ahorros o pagos pendientes. \
Usa delete_last_expense si pide borrar o deshacer el último gasto. Usa chat para saludos, \
agradecimientos o cualquier cosa no financiera.
- monto: el valor numérico en pesos como número (sin puntos ni comas), o null si no lo mencionó. \
Interpreta expresiones coloquiales colombianas: "50 mil" = 50000, "un millón" = 1000000, "20 lucas" = 20000. \
Nunca inventes un monto que el usuario no dijo.
- categoria: la categoría de la lista de arriba que mejor encaje, o null si no es claro.
- fecha: fecha en formato YYYY-MM-DD. Si dice "hoy" usa {hoy}. Si dice "ayer" usa {ayer}. Si no \
menciona ninguna fecha, usa null (no {hoy} por defecto).
- es_recurrente: true solo si el usuario dice explícitamente que es un pago recurrente/mensual.
- reply: si intent es add_expense/add_income y falta el monto, una pregunta breve en español \
pidiendo el monto que falta. Si es chat, una respuesta breve y amable (máximo 2 frases), sin \
inventar cifras de saldo/gastos. En cualquier otro caso deja reply como cadena vacía "".

Responde ÚNICAMENTE con el JSON, sin texto adicional."""


def _build_system_prompt(categorias_usuario, hoy):
    hoy_dt = datetime.strptime(hoy, "%Y-%m-%d")
    ayer = (hoy_dt - timedelta(days=1)).strftime("%Y-%m-%d")
    dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    dia_semana = dias[hoy_dt.weekday()]

    categorias_txt = ", ".join(categorias_usuario) if categorias_usuario else "Otros"
    return SYSTEM_PROMPT_TEMPLATE.format(
        hoy=hoy, ayer=ayer, dia_semana=dia_semana,
        categorias=categorias_txt, intents=", ".join(INTENTS)
    )


def interpretar_mensaje(history, categorias_usuario, hoy):
    """
    history: lista de dicts {"role": "user"|"assistant", "text": str}, en orden
             cronológico, terminando con el mensaje actual del usuario.
    Devuelve un dict con las llaves de RESPONSE_SCHEMA. Ante cualquier fallo de
    Ollama devuelve {"intent": "error", "reply": "..."}.
    """
    messages = [{"role": "system", "content": _build_system_prompt(categorias_usuario, hoy)}]
    for turn in history:
        role = "assistant" if turn.get("role") == "assistant" else "user"
        text = (turn.get("text") or "").strip()
        if text:
            messages.append({"role": role, "content": text})

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": messages,
        "format": RESPONSE_SCHEMA,
        "options": {"temperature": 0.1},
        # Mantiene el modelo cargado en RAM entre mensajes para evitar
        # recargas en frío (~15-20s) en cada turno de la conversación.
        "keep_alive": "30m",
    }

    try:
        resp = requests.post(
            f"{OLLAMA_HOST}/api/chat", json=payload, timeout=OLLAMA_TIMEOUT_SECONDS
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["message"]["content"]
    except Exception:
        logger.exception("Fallo al consultar el asistente LLM (Ollama)")
        return {
            "intent": "error",
            "monto": None,
            "categoria": None,
            "fecha": None,
            "es_recurrente": False,
            "reply": "El asistente inteligente no está disponible en este momento.",
        }

    try:
        parsed = json.loads(content)
    except (ValueError, TypeError):
        logger.warning("Respuesta del LLM no es JSON válido: %r", content)
        return {
            "intent": "error",
            "monto": None,
            "categoria": None,
            "fecha": None,
            "es_recurrente": False,
            "reply": "No entendí bien eso, ¿puedes reformularlo?",
        }

    if parsed.get("intent") not in INTENTS:
        parsed["intent"] = "chat"

    return {
        "intent": parsed.get("intent"),
        "monto": parsed.get("monto"),
        "categoria": parsed.get("categoria"),
        "fecha": parsed.get("fecha"),
        "es_recurrente": bool(parsed.get("es_recurrente")),
        "reply": parsed.get("reply") or "",
    }
