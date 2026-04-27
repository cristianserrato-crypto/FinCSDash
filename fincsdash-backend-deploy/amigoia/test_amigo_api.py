import requests
import json

BASE_URL = "http://127.0.0.1:5005"

def test_chat():
    print("--- Probando obtención de perfiles ---")
    res_profiles = requests.get(f"{BASE_URL}/api/profiles")
    profiles = res_profiles.json()
    print(f"Perfiles encontrados: {len(profiles)}")
    
    if not profiles:
        print("No hay perfiles. Creando uno de prueba...")
        setup_data = {
            "name": "Usuario de Prueba",
            "personality": "amigable",
            "tone": "casual",
            "interests": "tecnología"
        }
        res_setup = requests.post(f"{BASE_URL}/api/setup", json=setup_data)
        profile_id = res_setup.json().get("profile_id")
    else:
        profile_id = profiles[0]["id"]
    
    print(f"Usando profile_id: {profile_id}")
    
    print("\n--- Probando chat ---")
    chat_data = {
        "profile_id": profile_id,
        "message": "Hola, ¿cómo estás hoy?"
    }
    
    try:
        res_chat = requests.post(f"{BASE_URL}/api/chat", json=chat_data, timeout=30)
        print(f"Status Code: {res_chat.status_code}")
        print(f"Respuesta Completa: {res_chat.text}")
        
        if res_chat.status_code == 200:
            data = res_chat.json()
            print(f"\nRespuesta de AmigoIA: {data.get('response')}")
        else:
            print(f"\nError en el servidor: {res_chat.status_code}")
            
    except Exception as e:
        print(f"\nExcepción durante la petición: {str(e)}")

if __name__ == "__main__":
    test_chat()
