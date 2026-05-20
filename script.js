const API_URL = "http://localhost:5001"; // Cambiar a tu dominio en producción
let sessionId = localStorage.getItem("ai_friend_session") || null;

const chatWindow = document.getElementById("chat-window");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const newChatBtn = document.getElementById("new-chat-btn");

async function initSession() {
    if (!sessionId) {
        const res = await fetch(`${API_URL}/new_session`, { method: 'POST' });
        const data = await res.json();
        sessionId = data.session_id;
        localStorage.setItem("ai_friend_session", sessionId);
    }
}

function appendMessage(role, text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role}-message`;
    
    const avatar = role === 'bot' ? '🤖' : '👤';
    
    msgDiv.innerHTML = `
        <div class="avatar">${avatar}</div>
        <div class="bubble">${text}</div>
    `;
    
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return msgDiv.querySelector(".bubble");
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    userInput.value = "";
    appendMessage("user", text);

    // Crear burbuja vacía para el bot (streaming)
    const botBubble = appendMessage("bot", '<span class="typing">Pensando</span>');
    let fullResponse = "";

    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, session_id: sessionId })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        botBubble.innerHTML = ""; // Limpiar el "Pensando..."

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n\n");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.replace("data: ", "");
                    
                    if (data === "[END_STREAM]") {
                        // Fin del streaming
                        break;
                    }

                    // Si el backend nos mandó un nuevo session_id (ej. el anterior expiró)
                    if (data.length > 30 && data.includes("-")) {
                        sessionId = data;
                        localStorage.setItem("ai_friend_session", sessionId);
                        continue;
                    }

                    fullResponse += data;
                    botBubble.innerText = fullResponse;
                    chatWindow.scrollTop = chatWindow.scrollHeight;
                }
            }
        }
    } catch (error) {
        botBubble.innerText = "¡Ups! Mi cerebro hizo cortocircuito. ¿Podemos intentar de nuevo? 🔌";
        console.error("Error:", error);
    }
}

sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

newChatBtn.addEventListener("click", async () => {
    if (confirm("¿Quieres borrar esta charla y empezar una nueva?")) {
        localStorage.removeItem("ai_friend_session");
        sessionId = null;
        chatWindow.innerHTML = "";
        await initSession();
        appendMessage("bot", "¡Listo! Cuenta nueva, amistades nuevas. ¿Qué hay en tu mente? ✨");
    }
});

// Ajustar altura de textarea automáticamente
userInput.addEventListener("input", function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

initSession();