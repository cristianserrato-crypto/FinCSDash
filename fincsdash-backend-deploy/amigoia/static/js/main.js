let activeProfileId = 1; // Jarbis siempre es el perfil 1
let isListening = false;
let isSpeaking = false;
let recognition = null;
let synth = window.speechSynthesis;
let selectedVoice = null;
let currentTranscript = '';

// --- DOM ---
const screens = {
    welcome: document.getElementById('welcome-screen'),
    call: document.getElementById('call-screen')
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initSpeech();
});

function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            currentTranscript = transcript;
            
            // Ya no actualizamos el DOM con el texto para mayor velocidad

            if (event.results[event.results.length - 1].isFinal) {
                const textToSend = currentTranscript;
                currentTranscript = ''; 
                stopListening(false);
                if (textToSend.trim().length > 0) {
                    sendVoiceMessage(textToSend);
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech error:', event.error);
            if (event.error === 'no-speech') {
                setCallStatus('No escuché nada. Toca el micrófono para hablar.', '');
            }
            stopListening(true);
        };

        recognition.onend = () => {
            if (isListening) {
                try { recognition.start(); } catch(e) {}
            }
        };
    }

    if (synth) {
        synth.onvoiceschanged = () => {
            const voices = synth.getVoices();
            selectedVoice = voices.find(v => v.lang.startsWith('es') && v.name.includes('Google')) 
                || voices.find(v => v.lang.startsWith('es'))
                || voices[0];
        };
        synth.getVoices();
    }
}

function setupEventListeners() {
    document.getElementById('btn-start-jarbis').addEventListener('click', startJarbisSession);
    document.getElementById('btn-mic').addEventListener('click', toggleMic);
    document.getElementById('btn-end-call').addEventListener('click', endCall);
}

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

function startJarbisSession() {
    showScreen('call');
    setCallStatus('Iniciando sesión...', 'thinking');
    
    setTimeout(() => {
        const intro = "Hola, soy Jarbis. Soy una inteligencia artificial en etapa de aprendizaje y este es un proyecto educativo de Cristian. Me gustaría tener una conversación normal contigo para seguir aprendiendo. Ten en cuenta que todo lo que hablemos aquí es personal y privado. ¿De qué te gustaría hablar hoy?";
        speakText(intro);
    }, 800);
}

function toggleMic() {
    if (isSpeaking) {
        synth.cancel();
        isSpeaking = false;
        setPulse('');
    }

    if (synth) {
        const warmUp = new SpeechSynthesisUtterance('');
        warmUp.volume = 0;
        synth.speak(warmUp);
    }

    if (isListening) {
        stopListening(true);
    } else {
        startListening();
    }
}

function startListening() {
    if (!recognition) {
        alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome.');
        return;
    }

    currentTranscript = '';
    isListening = true;
    document.getElementById('btn-mic').classList.add('active');
    document.getElementById('mic-icon').style.display = 'none';
    document.getElementById('mic-off-icon').style.display = 'block';
    setCallStatus('🎙️ Escuchando...', 'listening');
    setPulse('listening');

    try {
        recognition.start();
    } catch(e) {}
}

function stopListening(processPending = false) {
    isListening = false;
    document.getElementById('btn-mic').classList.remove('active');
    document.getElementById('mic-icon').style.display = 'block';
    document.getElementById('mic-off-icon').style.display = 'none';

    try { recognition.stop(); } catch(e) {}

    if (processPending && currentTranscript.trim().length > 0) {
        const textToSend = currentTranscript;
        currentTranscript = '';
        sendVoiceMessage(textToSend);
    } else if (processPending) {
        setCallStatus('Toca para hablar', '');
        setPulse('');
    }
}

function setCallStatus(text, className) {
    const el = document.getElementById('call-status');
    el.textContent = text;
    el.className = 'call-status ' + (className || '');
}

function setPulse(mode) {
    const ring = document.getElementById('pulse-ring');
    ring.className = 'pulse-ring ' + mode;
}

async function sendVoiceMessage(text) {
    if (!text.trim() || !activeProfileId) return;

    setCallStatus('🤔 Pensando...', 'thinking');
    setPulse('');

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile_id: activeProfileId, message: text })
        });
        const data = await res.json();
        const response = data.response || 'No recibí respuesta.';

        speakText(response);
    } catch (e) {
        console.error('Error sending message:', e);
        speakText('Hubo un error de conexión. Intenta de nuevo.');
    }
}

function speakText(text) {
    if (!synth) return;

    synth.cancel();
    isSpeaking = true;

    const cleanText = text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/[#_~`]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-ES';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    // Ya no mostramos el texto en pantalla por petición del usuario
    setCallStatus('🔊 Hablando...', 'speaking');
    setPulse('speaking');

    utterance.onend = () => {
        isSpeaking = false;
        setCallStatus('Toca para hablar', '');
        setPulse('');
    };

    utterance.onerror = () => {
        isSpeaking = false;
        setCallStatus('Toca para hablar', '');
        setPulse('');
    };

    synth.speak(utterance);
}

function endCall() {
    synth.cancel();
    stopListening();
    isSpeaking = false;
    showScreen('welcome');
}
