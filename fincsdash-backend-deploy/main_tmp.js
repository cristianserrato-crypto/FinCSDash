let currentStep = 1;
let profileData = { name: '', personality: '', tone: '', interests: '' };
let activeProfileId = null;
let isListening = false;
let isSpeaking = false;
let recognition = null;
let synth = window.speechSynthesis;
let selectedVoice = null;
let currentTranscript = ''; // Guarda lo hablado si el usuario corta manualmente

// --- DOM ---
const screens = {
    welcome: document.getElementById('welcome-screen'),
    setup: document.getElementById('setup-screen'),
    call: document.getElementById('call-screen')
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    loadProfiles();
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
            
            const txtElem = document.getElementById('transcript-text');
            txtElem.textContent = transcript;
            txtElem.classList.add('active');

            if (event.results[event.results.length - 1].isFinal) {
                const textToSend = currentTranscript;
                currentTranscript = ''; // Evitar duplicados
                stopListening(false); // Falso = no enviar desde stopListening, lo enviamos nosotros aquí
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
    document.getElementById('btn-start-setup').addEventListener('click', () => showScreen('setup'));

    document.getElementById('btn-step1-next').addEventListener('click', () => {
        const name = document.getElementById('input-name').value.trim();
        if (name) { profileData.name = name; goToStep(2); }
    });
    document.getElementById('input-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-step1-next').click();
    });

    document.querySelectorAll('#personality-options .option-card').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#personality-options .option-card').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            profileData.personality = btn.dataset.value;
            setTimeout(() => goToStep(3), 400);
        });
    });

    document.querySelectorAll('#tone-options .option-card').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#tone-options .option-card').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            profileData.tone = btn.dataset.value;
            setTimeout(() => goToStep(4), 400);
        });
    });

    document.getElementById('btn-create-profile').addEventListener('click', createProfile);
    document.getElementById('input-interests').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createProfile();
    });

    document.getElementById('btn-mic').addEventListener('click', toggleMic);
    document.getElementById('btn-end-call').addEventListener('click', endCall);
    document.getElementById('btn-back').addEventListener('click', endCall);
}

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    if (name === 'welcome') loadProfiles();
}

function goToStep(step) {
    currentStep = step;
    document.querySelectorAll('.setup-step').forEach(s => s.classList.remove('active'));
    document.getElementById('step-' + step).classList.add('active');
    document.getElementById('progress-fill').style.width = (step * 25) + '%';
    document.getElementById('step-label').textContent = 'Paso ' + step + ' de 4';
}

async function loadProfiles() {
    try {
        const res = await fetch('/api/profiles');
        const profiles = await res.json();
        const container = document.getElementById('profiles-list');
        const section = document.getElementById('existing-profiles');

        if (profiles.length > 0) {
            section.style.display = 'block';
            container.innerHTML = profiles.map(p => `
                <button class="profile-chip" onclick="selectProfile(${p.id}, '${p.name.replace(/'/g, "\\'")}')">
                    <div class="chip-avatar">${p.name.charAt(0).toUpperCase()}</div>
                    <span class="chip-name">${p.name}</span>
                </button>
            `).join('');
        } else {
            section.style.display = 'none';
        }
    } catch (e) {
        console.error('Error loading profiles:', e);
    }
}

function selectProfile(id, name) {
    activeProfileId = id;
    document.getElementById('call-friend-name').textContent = 'AmigoIA de ' + name;
    showScreen('call');
    setCallStatus('Toca el micrófono para hablar', '');
    document.getElementById('transcript-text').textContent = '🎙️ Toca el botón del micrófono y empieza a hablar';

    setTimeout(() => {
        speakText('¡Hola de nuevo, ' + name + '! ¿De qué quieres hablar hoy?');
    }, 600);
}

async function createProfile() {
    const interests = document.getElementById('input-interests').value.trim() || 'variados';
    profileData.interests = interests;

    const btn = document.getElementById('btn-create-profile');
    btn.disabled = true;
    btn.textContent = 'Creando...';

    try {
        const res = await fetch('/api/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData)
        });
        const data = await res.json();

        if (data.profile_id) {
            activeProfileId = data.profile_id;
            document.getElementById('call-friend-name').textContent = 'AmigoIA de ' + profileData.name;
            showScreen('call');

            setTimeout(() => {
                speakText('¡Hola ' + profileData.name + '! Soy tu nuevo amigo. He configurado mi personalidad según tus preferencias. ¡Háblame de lo que quieras!');
            }, 600);
        }
    } catch (e) {
        console.error('Error creating profile:', e);
        btn.textContent = '🚀 Crear mi AmigoIA';
        btn.disabled = false;
    }
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
        stopListening(true); // true = El usuario abortó, procesemos lo que ya tenemos
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
    document.getElementById('transcript-text').textContent = '...';
    document.getElementById('transcript-text').classList.add('active');

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

    // Si el usuario presionó el botón para cerrar el micrófono en el celular
    if (processPending && currentTranscript.trim().length > 0) {
        const textToSend = currentTranscript;
        currentTranscript = '';
        sendVoiceMessage(textToSend);
    } else if (processPending) {
        setCallStatus('Toca el micrófono para hablar', '');
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

    // Clean markdown formatting for speech
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

    // Show the response text
    document.getElementById('transcript-text').textContent = text;
    document.getElementById('transcript-text').classList.add('active');
    setCallStatus('🔊 Hablando...', 'speaking');
    setPulse('speaking');

    utterance.onend = () => {
        isSpeaking = false;
        setCallStatus('Toca el micrófono para hablar', '');
        setPulse('');
    };

    utterance.onerror = () => {
        isSpeaking = false;
        setCallStatus('Toca el micrófono para hablar', '');
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
