from selenium import webdriver
import os
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def ejecutar_bot_selenium():
    """
    Inicia un navegador Chrome, extrae el precio del dólar (TRM en Colombia) y lo devuelve.
    """
    print("🤖 Iniciando el bot para buscar precio del dólar...")

    # Configuración del navegador
    options = webdriver.ChromeOptions()
    options.add_argument("--headless") # Ejecutar en modo silencioso para no molestar al usuario
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    # Evitar que el navegador se identifique como automatizado
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

    # --- CONFIGURACIÓN PARA RENDER ---
    # Ruta donde se instala Chrome mediante render-build.sh
    chrome_bin = "/opt/render/project/.render/chrome/opt/google/chrome/google-chrome"
    if os.path.exists(chrome_bin):
        options.binary_location = chrome_bin

    # Inicializa el driver automáticamente (descarga la versión correcta de Chrome)
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)

    resultado = {"status": "error", "dato_extraido": None}

    try:
        # --- LÓGICA DE EXTRACCIÓN DE PRECIO DEL DÓLAR ---
        
        # 1. Navegar a la búsqueda de Google
        url_objetivo = "https://www.google.com/search?q=dolar+a+peso+colombiano"
        driver.get(url_objetivo)
        
        # 2. Esperar a que el elemento con el precio del dólar esté presente
        wait = WebDriverWait(driver, 10) # Esperar hasta 10 segundos
        dollar_element = wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "span.DFlfde.SwHCTb"))
        )
        
        # 3. Extraer el texto y limpiarlo
        precio_texto = dollar_element.text
        precio_numerico = float(precio_texto.replace('.', '').replace(',', '.'))
        
        print(f"✅ Precio del dólar extraído: {precio_numerico}")

        resultado = {
            "status": "success",
            "mensaje": "Precio del dólar (COP) extraído",
            "dato_extraido": precio_numerico
        }
        # -------------------------------------------

    except Exception as e:
        print(f"❌ Error en el bot: {e}")
        resultado["mensaje"] = f"No se pudo obtener el precio del dólar. {e}"

    finally:
        # Cerrar el navegador al terminar
        driver.quit()
    
    return resultado

# Para probarlo solo: python bot.py
if __name__ == "__main__":
    print(ejecutar_bot_selenium())