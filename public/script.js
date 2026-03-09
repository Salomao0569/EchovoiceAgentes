// DOM Elements
const inputText = document.getElementById('inputText');
const outputText = document.getElementById('outputText');
const outputCard = document.getElementById('outputCard');
const analysisText = document.getElementById('analysisText');
const analysisCard = document.getElementById('analysisCard');
const chatCard = document.getElementById('chatCard');
const chatHistory = document.getElementById('chatHistory');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const actionButtons = document.getElementById('actionButtons');
const pendingAlert = document.getElementById('pendingAlert');
const processBtn = document.getElementById('processBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const newBtn = document.getElementById('newBtn');
const exportBtn = document.getElementById('exportBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const notification = document.getElementById('notification');
const voiceBtn = document.getElementById('voiceBtn');

// Voice recording state
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Estado global do caso atual
let currentCaseContext = {
    originalNotes: '',
    evolution: '',
    analysis: '',
    analysisStatus: 'ATENÇÃO',
    chatMessages: []
};

// Flag para controlar se há caso processado
let hasCaseProcessed = false;

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Get Firebase auth token for API calls
async function getAuthToken() {
    const user = window.currentUser || (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser);
    if (user) {
        try {
            return await user.getIdToken(true);
        } catch (e) {
            console.error('Erro ao obter token:', e);
            return null;
        }
    }
    return null;
}

// Fetch with timeout
function fetchWithTimeout(url, options, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, {
        ...options,
        signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
}

// Event Listeners
processBtn.addEventListener('click', processText);
clearBtn.addEventListener('click', clearInput);
copyBtn.addEventListener('click', copyToClipboard);
newBtn.addEventListener('click', newEvolution);
sendChatBtn.addEventListener('click', sendChatMessage);
exportBtn.addEventListener('click', exportCase);
voiceBtn.addEventListener('click', toggleVoiceRecording);

// Enter para enviar no chat (Ctrl+Enter para nova linha)
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
});

// Tab switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        switchTab(targetTab);
    });
});

// Atalhos de teclado
inputText.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        processText();
    }
});

// Função para trocar abas
function switchTab(tabName) {
    // Remover active de todos
    tabBtns.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Adicionar active ao selecionado
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Salvar preferência
    localStorage.setItem('preferredTab', tabName);
}

// Restaurar aba preferida ao carregar
window.addEventListener('load', () => {
    const preferredTab = localStorage.getItem('preferredTab') || 'quick';
    switchTab(preferredTab);
    
    // Detectar mobile para otimizações
    detectMobile();
});

// Detectar dispositivo móvel
function detectMobile() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        document.body.classList.add('is-mobile');
        
        // Otimizações específicas para mobile
        optimizeForMobile();
    }
}

// Otimizações para mobile
function optimizeForMobile() {
    // Prevenir zoom duplo-toque em iOS
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
    
    // Melhorar scroll suave em mobile
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Ajustar altura do viewport em mobile (fix para barra de endereço do navegador)
    const setVH = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', setVH);
}

// Função principal: Processar texto com IA
async function processText() {
    // Verificar qual aba está ativa
    const activeTab = document.querySelector('.tab-content.active').id;
    
    let notesText = '';
    
    if (activeTab === 'quick-tab') {
        // Modo rápido: pegar texto livre
        notesText = inputText.value.trim();
    } else {
        // Modo estruturado: coletar dados do formulário
        notesText = collectStructuredData();
    }
    
    if (!notesText) {
        showNotification('Por favor, insira as anotações da consulta.', 'error');
        return;
    }
    
    // Desabilitar botão e mostrar loading
    processBtn.disabled = true;
    loadingOverlay.style.display = 'flex';
    
    try {
        const token = await getAuthToken();
        const response = await fetchWithTimeout('/api/processMedicalNotes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'X-Firebase-Auth-Token': token })
            },
            body: JSON.stringify({ notes: notesText })
        }, 120000);
        
        if (!response.ok) {
            throw new Error('Erro ao processar com IA');
        }
        
        const data = await response.json();
        
        // Salvar contexto do caso
        currentCaseContext.originalNotes = notesText;
        currentCaseContext.evolution = data.evolution;
        currentCaseContext.analysis = data.analysis;
        currentCaseContext.analysisStatus = data.analysisStatus || 'ATENÇÃO';
        
        // Exibir evolução
        outputText.innerHTML = formatOutput(data.evolution);
        outputCard.style.display = 'block';
        
        // Exibir análise clínica com cor baseada no status
        analysisText.innerHTML = formatAnalysis(data.analysis);
        analysisCard.style.display = 'block';
        
        // Aplicar cor baseada no status
        if (data.analysisStatus === 'ADEQUADO') {
            analysisCard.className = 'card analysis-card analysis-agree';
        } else {
            analysisCard.className = 'card analysis-card analysis-attention';
        }
        
        // Exibir chat
        chatCard.style.display = 'block';
        chatHistory.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 20px;">Inicie a discussão fazendo uma pergunta sobre este caso...</p>';
        
        // Exibir botões de ação
        actionButtons.style.display = 'flex';
        
        // Mostrar alerta de dados pendentes no topo
        pendingAlert.style.display = 'flex';
        
        // Marcar que há caso processado
        hasCaseProcessed = true;
        
        // Desabilitar botão processar enquanto há caso ativo
        processBtn.disabled = true;
        processBtn.innerHTML = '<span class="btn-icon">⚠️</span> Caso em Análise';
        
        // Scroll suave para o resultado (com delay em mobile)
        setTimeout(() => {
            outputCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
        
        showNotification('✅ Caso processado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro:', error);
        if (error.name === 'AbortError') {
            showNotification('Tempo esgotado. Tente novamente.', 'error');
        } else {
            showNotification('Erro ao processar. Verifique sua conexão e tente novamente.', 'error');
        }
    } finally {
        processBtn.disabled = false;
        loadingOverlay.style.display = 'none';
    }
}

// Coletar dados do formulário estruturado
function collectStructuredData() {
    const formData = {
        pa_d: document.getElementById('pa_d').value,
        pa_e: document.getElementById('pa_e').value,
        fc: document.getElementById('fc').value,
        temp: document.getElementById('temp').value,
        queixa: document.getElementById('queixa').value,
        hda: document.getElementById('hda').value,
        antecedentes: document.getElementById('antecedentes').value,
        habitos_vida: document.getElementById('habitos_vida').value,
        habitos_sociais: document.getElementById('habitos_sociais').value,
        antecedentes_fam: document.getElementById('antecedentes_fam').value,
        alimentacao_sono: document.getElementById('alimentacao_sono').value,
        medicamentos: document.getElementById('medicamentos').value,
        exame_fisico: document.getElementById('exame_fisico').value,
        ecg: document.getElementById('ecg').value,
        exames: document.getElementById('exames').value,
        conduta: document.getElementById('conduta').value
    };
    
    // Verificar se pelo menos um campo foi preenchido
    const hasData = Object.values(formData).some(value => value.trim() !== '');
    if (!hasData) {
        return '';
    }
    
    // Montar texto estruturado
    let text = '';
    
    if (formData.pa_d || formData.pa_e || formData.fc || formData.temp) {
        text += 'SINAIS VITAIS:\n';
        if (formData.pa_d) text += `PA D: ${formData.pa_d}\n`;
        if (formData.pa_e) text += `PA E: ${formData.pa_e}\n`;
        if (formData.fc) text += `FC: ${formData.fc} bpm\n`;
        if (formData.temp) text += `Temperatura: ${formData.temp}°C\n`;
        text += '\n';
    }
    
    if (formData.queixa) {
        text += `QUEIXA PRINCIPAL:\n${formData.queixa}\n\n`;
    }
    
    if (formData.hda) {
        text += `HISTÓRIA DA DOENÇA ATUAL (HDA):\n${formData.hda}\n\n`;
    }
    
    if (formData.antecedentes) {
        text += `ANTECEDENTES PATOLÓGICOS:\n${formData.antecedentes}\n\n`;
    }
    
    if (formData.habitos_vida) {
        text += `HÁBITOS DE VIDA:\n${formData.habitos_vida}\n\n`;
    }
    
    if (formData.habitos_sociais) {
        text += `HÁBITOS SOCIAIS:\n${formData.habitos_sociais}\n\n`;
    }
    
    if (formData.antecedentes_fam) {
        text += `ANTECEDENTES FAMILIARES:\n${formData.antecedentes_fam}\n\n`;
    }
    
    if (formData.alimentacao_sono) {
        text += `ALIMENTAÇÃO E SONO:\n${formData.alimentacao_sono}\n\n`;
    }
    
    if (formData.medicamentos) {
        text += `MEDICAMENTOS EM USO:\n${formData.medicamentos}\n\n`;
    }
    
    if (formData.exame_fisico) {
        text += `EXAME FÍSICO:\n${formData.exame_fisico}\n\n`;
    }
    
    if (formData.ecg) {
        text += `ELETROCARDIOGRAMA:\n${formData.ecg}\n\n`;
    }
    
    if (formData.exames) {
        text += `EXAMES REALIZADOS:\n${formData.exames}\n\n`;
    }
    
    if (formData.conduta) {
        text += `CONDUTA:\n${formData.conduta}\n\n`;
    }
    
    return text.trim();
}

// Sanitize HTML to prevent XSS from API responses
function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Formatar output para exibição
function formatOutput(text) {
    // Sanitize first to prevent XSS
    let sanitized = sanitizeHTML(text);
    // Then apply formatting (bold, line breaks)
    return sanitized
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Negrito
}

// Formatar análise clínica
function formatAnalysis(text) {
    // Sanitize first to prevent XSS
    let formatted = sanitizeHTML(text);
    // Converter markdown básico em HTML
    formatted = formatted
        .replace(/### (.*?)$/gm, '<h3>$1</h3>')
        .replace(/## (.*?)$/gm, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/- (.*?)$/gm, '<li>$1</li>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(?!<[h3|li])(.+)$/gm, '<p>$1</p>');

    // Envolver listas
    formatted = formatted.replace(/(<li>.*?<\/li>\s*)+/gs, '<ul>$&</ul>');

    return formatted;
}

// Limpar entrada (apenas os campos de entrada, não os resultados)
function clearInput() {
    if (hasCaseProcessed) {
        // Se há caso processado, avisar que deve usar "Nova Consulta"
        showNotification('⚠️ Você tem um caso processado. Use "Limpar e Nova Consulta" abaixo para começar do zero.', 'error');
        
        // Scroll para os botões de ação
        actionButtons.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Destacar botão Nova Consulta
        newBtn.style.animation = 'pulse 0.5s ease-in-out 3';
        setTimeout(() => {
            newBtn.style.animation = '';
        }, 1500);
        
        return;
    }
    
    const activeTab = document.querySelector('.tab-content.active').id;
    
    if (activeTab === 'quick-tab') {
        // Limpar textarea do modo rápido
        inputText.value = '';
        inputText.focus();
    } else {
        // Limpar todos os campos do formulário estruturado
        document.getElementById('structuredForm').reset();
    }
    
    showNotification('Campos limpos!', 'success');
}

// Copiar para área de transferência
async function copyToClipboard() {
    const textToCopy = outputText.innerText;
    
    try {
        await navigator.clipboard.writeText(textToCopy);
        showNotification('✅ Texto copiado para área de transferência!', 'success');
        
        // Feedback visual no botão
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<span class="btn-icon">✅</span> Copiado!';
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
        }, 2000);
        
    } catch (error) {
        console.error('Erro ao copiar:', error);
        showNotification('Erro ao copiar. Tente selecionar e copiar manualmente.', 'error');
    }
}

// Nova evolução (Limpar tudo e começar do zero)
function newEvolution() {
    // Confirmação se há chat ativo
    if (currentCaseContext.chatMessages.length > 0) {
        const confirm = window.confirm('⚠️ Você tem uma discussão em andamento. Deseja realmente iniciar nova consulta? Os dados não salvos serão perdidos.');
        if (!confirm) return;
    }
    
    // Esconder todos os cards de resultado
    outputCard.style.display = 'none';
    analysisCard.style.display = 'none';
    chatCard.style.display = 'none';
    actionButtons.style.display = 'none';
    pendingAlert.style.display = 'none';
    
    // Limpar ambos os modos
    inputText.value = '';
    document.getElementById('structuredForm').reset();
    
    // Limpar rascunhos salvos
    localStorage.removeItem('quickDraft');
    localStorage.removeItem('structuredDraft');
    
    // Limpar contexto
    currentCaseContext = {
        originalNotes: '',
        evolution: '',
        analysis: '',
        analysisStatus: 'ATENÇÃO',
        chatMessages: []
    };
    
    // Resetar flag
    hasCaseProcessed = false;
    
    // Reabilitar botão processar
    processBtn.disabled = false;
    processBtn.innerHTML = '<span class="btn-icon">✨</span> Processar com IA';
    
    // Scroll para o topo
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Focar no campo ativo
    const activeTab = document.querySelector('.tab-content.active').id;
    if (activeTab === 'quick-tab') {
        setTimeout(() => inputText.focus(), 500);
    }
    
    showNotification('✅ Sistema limpo! Pronto para nova consulta.', 'success');
}

// Enviar mensagem no chat
async function sendChatMessage() {
    const message = chatInput.value.trim();
    
    if (!message) {
        showNotification('Digite uma mensagem antes de enviar.', 'error');
        return;
    }
    
    // Limpar placeholder se existir
    if (chatHistory.querySelector('p[style*="text-align: center"]')) {
        chatHistory.innerHTML = '';
    }
    
    // Adicionar mensagem do usuário
    addChatMessage('user', message);
    currentCaseContext.chatMessages.push({ role: 'user', content: message });
    
    // Limpar input
    chatInput.value = '';
    
    // Mostrar loading
    const loadingMsg = addChatMessage('assistant', 'Analisando...');
    
    try {
        const token = await getAuthToken();
        const response = await fetchWithTimeout('/api/chatCase', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'X-Firebase-Auth-Token': token })
            },
            body: JSON.stringify({
                caseContext: {
                    notes: currentCaseContext.originalNotes,
                    evolution: currentCaseContext.evolution,
                    analysis: currentCaseContext.analysis
                },
                chatHistory: currentCaseContext.chatMessages
            })
        }, 30000);
        
        if (!response.ok) {
            throw new Error('Erro ao enviar mensagem');
        }
        
        const data = await response.json();
        
        // Remover loading e adicionar resposta
        loadingMsg.remove();
        addChatMessage('assistant', data.response);
        currentCaseContext.chatMessages.push({ role: 'assistant', content: data.response });
        
    } catch (error) {
        console.error('Erro:', error);
        loadingMsg.remove();
        if (error.name === 'AbortError') {
            addChatMessage('assistant', '⏱️ Tempo esgotado. Tente novamente.');
        } else {
            addChatMessage('assistant', '❌ Erro ao processar mensagem. Tente novamente.');
        }
    }
}

// Adicionar mensagem ao chat
function addChatMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    
    const header = document.createElement('div');
    header.className = 'chat-message-header';
    header.textContent = role === 'user' ? '👨‍⚕️ Você' : '🤖 Assistente IA';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-message-content';
    contentDiv.innerHTML = formatOutput(content);
    
    messageDiv.appendChild(header);
    messageDiv.appendChild(contentDiv);
    
    chatHistory.appendChild(messageDiv);
    
    // Scroll para última mensagem (suave em mobile)
    if (document.body.classList.contains('is-mobile')) {
        setTimeout(() => {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }, 100);
    } else {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
    
    return messageDiv;
}

// Exportar caso completo
function exportCase() {
    const caseData = `
CASO CLÍNICO - ${new Date().toLocaleString('pt-BR')}
${'='.repeat(80)}

ANOTAÇÕES ORIGINAIS:
${currentCaseContext.originalNotes}

${'='.repeat(80)}

EVOLUÇÃO PARA PRODOCTOR:
${outputText.innerText}

${'='.repeat(80)}

ANÁLISE CLÍNICA EXPERT:
${analysisText.innerText}

${'='.repeat(80)}

DISCUSSÃO DO CASO:
${currentCaseContext.chatMessages.map(msg => 
    `${msg.role === 'user' ? '👨‍⚕️ VOCÊ' : '🤖 ASSISTENTE'}:\n${msg.content}\n`
).join('\n')}

${'='.repeat(80)}
Gerado pelo Assistente Cardiologia Biocardio
`;

    // Criar e baixar arquivo
    const blob = new Blob([caseData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caso_clinico_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Caso exportado com sucesso!', 'success');
}

// Mostrar notificação
function showNotification(message, type = 'success') {
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 4000);
}

// Salvar rascunho no localStorage (auto-save) - Modo Rápido
let autoSaveTimeout;
inputText.addEventListener('input', () => {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        localStorage.setItem('quickDraft', inputText.value);
    }, 1000);
});

// Auto-save para formulário estruturado
const formFields = document.querySelectorAll('.structured-form input, .structured-form textarea');
formFields.forEach(field => {
    field.addEventListener('input', () => {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(() => {
            saveStructuredDraft();
        }, 1000);
    });
});

function saveStructuredDraft() {
    const formData = {};
    formFields.forEach(field => {
        formData[field.id] = field.value;
    });
    localStorage.setItem('structuredDraft', JSON.stringify(formData));
}

function loadStructuredDraft() {
    const savedData = localStorage.getItem('structuredDraft');
    if (savedData) {
        const formData = JSON.parse(savedData);
        Object.keys(formData).forEach(key => {
            const field = document.getElementById(key);
            if (field && !field.value) {
                field.value = formData[key];
            }
        });
    }
}

// Recuperar rascunhos ao carregar página
window.addEventListener('load', () => {
    // Rascunho modo rápido
    const quickDraft = localStorage.getItem('quickDraft');
    if (quickDraft && !inputText.value) {
        inputText.value = quickDraft;
    }
    
    // Rascunho modo estruturado
    loadStructuredDraft();
});

// Limpar rascunho quando processar com sucesso
function clearDraft() {
    localStorage.removeItem('draft');
}

// ==================== GRAVAÇÃO DE VOZ ====================

// Toggle gravação de voz
async function toggleVoiceRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

// Iniciar gravação
async function startRecording() {
    try {
        // Solicitar permissão do microfone
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 16000
            }
        });

        // Configurar MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/mp4';

        mediaRecorder = new MediaRecorder(stream, { mimeType });
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            // Parar todas as tracks do stream
            stream.getTracks().forEach(track => track.stop());

            // Processar áudio gravado
            await processRecordedAudio(mimeType);
        };

        // Iniciar gravação
        mediaRecorder.start(1000); // Chunks de 1 segundo
        isRecording = true;

        // Atualizar UI
        voiceBtn.classList.add('recording');
        voiceBtn.querySelector('.voice-icon').textContent = '⏹️';
        voiceBtn.querySelector('.voice-status').textContent = 'Gravando...';
        voiceBtn.title = 'Clique para parar';

        showNotification('🎤 Gravando... Fale suas anotações.', 'success');

    } catch (error) {
        console.error('Erro ao acessar microfone:', error);

        if (error.name === 'NotAllowedError') {
            showNotification('❌ Permissão do microfone negada. Habilite nas configurações do navegador.', 'error');
        } else if (error.name === 'NotFoundError') {
            showNotification('❌ Microfone não encontrado.', 'error');
        } else {
            showNotification('❌ Erro ao acessar microfone: ' + error.message, 'error');
        }
    }
}

// Parar gravação
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;

        // Atualizar UI - estado de processamento
        voiceBtn.classList.remove('recording');
        voiceBtn.classList.add('processing');
        voiceBtn.querySelector('.voice-icon').textContent = '⏳';
        voiceBtn.querySelector('.voice-status').textContent = 'Transcrevendo...';
    }
}

// Processar áudio gravado e enviar para transcrição
async function processRecordedAudio(mimeType) {
    if (audioChunks.length === 0) {
        resetVoiceButton();
        showNotification('❌ Nenhum áudio gravado.', 'error');
        return;
    }

    try {
        // Criar blob do áudio
        const audioBlob = new Blob(audioChunks, { type: mimeType });

        // Verificar tamanho (Whisper tem limite de 25MB)
        if (audioBlob.size > 25 * 1024 * 1024) {
            resetVoiceButton();
            showNotification('❌ Áudio muito longo. Grave trechos menores.', 'error');
            return;
        }

        // Converter para base64
        const base64Audio = await blobToBase64(audioBlob);

        // Enviar para API de transcrição
        const token = await getAuthToken();
        const response = await fetchWithTimeout('/api/transcribeAudio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'X-Firebase-Auth-Token': token })
            },
            body: JSON.stringify({
                audio: base64Audio,
                mimeType: mimeType
            })
        }, 60000);

        if (!response.ok) {
            throw new Error('Erro na transcrição');
        }

        const data = await response.json();

        if (data.text && data.text.trim()) {
            // Adicionar texto transcrito ao textarea
            const currentText = inputText.value;
            const separator = currentText && !currentText.endsWith('\n') ? '\n' : '';
            inputText.value = currentText + separator + data.text;

            // Trigger auto-save
            inputText.dispatchEvent(new Event('input'));

            showNotification('✅ Transcrição adicionada!', 'success');
        } else {
            showNotification('⚠️ Não foi possível transcrever. Tente novamente.', 'error');
        }

    } catch (error) {
        console.error('Erro na transcrição:', error);
        if (error.name === 'AbortError') {
            showNotification('Tempo esgotado na transcrição. Tente novamente.', 'error');
        } else {
            showNotification('❌ Erro ao transcrever áudio. Tente novamente.', 'error');
        }
    } finally {
        resetVoiceButton();
    }
}

// Converter Blob para Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Remover prefixo "data:audio/webm;base64,"
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Resetar botão de voz para estado inicial
function resetVoiceButton() {
    voiceBtn.classList.remove('recording', 'processing');
    voiceBtn.querySelector('.voice-icon').textContent = '🎤';
    voiceBtn.querySelector('.voice-status').textContent = '';
    voiceBtn.title = 'Gravar áudio (clique para iniciar)';
}

