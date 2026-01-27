import time
import random

def ejecutar_bot_selenium():
    """
    Versión simplificada del bot que no usa Selenium.
    Devuelve una frase motivacional aleatoria.
    """
    print("🤖 Iniciando bot de frases...")

    # Simular un proceso
    time.sleep(1)

    frases = [
        "El éxito es la suma de pequeños esfuerzos repetidos día tras día.",
        "No ahorres lo que te queda después de gastar, gasta lo que te queda después de ahorrar.",
        "La riqueza no consiste en tener grandes posesiones, sino en tener pocas necesidades.",
        "Cuida de los pequeños gastos; un pequeño agujero hunde un barco.",
        "El dinero es un buen siervo, pero un mal amo.",
        "Invierte en ti mismo, es la mejor inversión que puedes hacer.",
        "La disciplina es el puente entre metas y logros.",
        "No cuentes los días, haz que los días cuenten."
    ]

    resultado = {
        "status": "success",
        "mensaje": "Frase del día",
        "dato_extraido": random.choice(frases)
    }
    
    return resultado

# Para probarlo solo: python bot.py
if __name__ == "__main__":
    print(ejecutar_bot_selenium())