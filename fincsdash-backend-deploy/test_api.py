import sqlite3
import requests

try:
    c = sqlite3.connect('/var/www/ia-amigo/amigoia.db')
    row = c.execute('SELECT id FROM profiles LIMIT 1').fetchone()
    if not row:
        print("NO_PROFILES")
    else:
        pid = row[0]
        print(f"Testing Profile ID: {pid}")
        res = requests.post('http://localhost:5005/api/chat', json={"profile_id": pid, "message": "Hola pruebame 1 2 3"})
        print(f"STATUS: {res.status_code}")
        print(res.text)
except Exception as e:
    print(f"FAILED: {e}")
