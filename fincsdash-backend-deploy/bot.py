# Importa el módulo 'time' para poder pausar la ejecución (simular espera).
import time
# Importa el módulo 'random' para elegir opciones al azar.
import random

# Define la función que será llamada desde app.py.
def obtener_frase_motivacional():
    """
    Devuelve una frase motivacional aleatoria (Simulación de bot).
    """
    # Imprime un mensaje en la consola del servidor para saber que el bot arrancó.
    print("🤖 Iniciando bot de frases...")

    # Simular un proceso
    # Pausa el código durante 1 segundo para que parezca que está "pensando" o cargando.
    time.sleep(1)

    # Crea una lista (array) con varias frases de texto.
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

    # Crea un diccionario (objeto JSON) con la respuesta que enviaremos.
    resultado = {
        "status": "success", # Indica que todo salió bien.
        "mensaje": "Frase del día", # Un título para el mensaje.
        "dato_extraido": random.choice(frases) # Elige una frase al azar de la lista.
    }
    
    # Devuelve el diccionario con la información.
    return resultado

# Para probarlo solo: python bot.py
# Este bloque 'if' solo se ejecuta si corres este archivo directamente, no si lo importas.
if __name__ == "__main__":
    # Imprime el resultado de la función para probarla en la terminal.
    print(obtener_frase_motivacional())