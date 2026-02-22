// Armazenar configurações
let gameSettings = {
    fps: 60,
    language: 'pt',
    volume: 80
};

// Carregar configurações do localStorage se existirem
window.addEventListener('DOMContentLoaded', function() {
    const saved = localStorage.getItem('gameSettings');
    if (saved) {
        gameSettings = JSON.parse(saved);
        document.getElementById('fpsSelect').value = gameSettings.fps;
        document.getElementById('languageSelect').value = gameSettings.language;
        document.getElementById('volumeSlider').value = gameSettings.volume;
        document.getElementById('volumeValue').textContent = gameSettings.volume + '%';
    }
    
    // Atualizar valor do volume em tempo real
    document.getElementById('volumeSlider').addEventListener('input', function() {
        document.getElementById('volumeValue').textContent = this.value + '%';
    });
    
    // Áudio do menu: hover e click
    try {
        const menuAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

        function playMenuHover() {
            if (menuAudioCtx.state === 'suspended') return;
            const now = menuAudioCtx.currentTime;
            const osc = menuAudioCtx.createOscillator();
            const gain = menuAudioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 600 + Math.random() * 80;
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.connect(gain);
            gain.connect(menuAudioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.12);
        }

        function playMenuClick() {
            if (menuAudioCtx.state === 'suspended') return;
            const now = menuAudioCtx.currentTime;
            const osc = menuAudioCtx.createOscillator();
            const gain = menuAudioCtx.createGain();
            osc.type = 'square';
            osc.frequency.value = 900;
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.connect(gain);
            gain.connect(menuAudioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.18);
        }

        // Anexar eventos a todos os botões do menu
        const buttons = document.querySelectorAll('.menu-button');
        buttons.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                playMenuHover();
            });
            btn.addEventListener('click', () => {
                playMenuClick();
            });
        });
    } catch (e) {
        // Falha no áudio do menu — ignorar
        console.warn('Menu audio init failed', e);
    }
});

function startGame() {
    window.location.href = 'game.html';
}

function openOptions() {
    document.getElementById('mainScreen').style.display = 'none';
    document.getElementById('optionsScreen').style.display = 'flex';
}

function backToMenu() {
    document.getElementById('optionsScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'flex';
}

function saveOptions() {
    gameSettings.fps = document.getElementById('fpsSelect').value;
    gameSettings.language = document.getElementById('languageSelect').value;
    gameSettings.volume = document.getElementById('volumeSlider').value;
    
    // Salvar no localStorage
    localStorage.setItem('gameSettings', JSON.stringify(gameSettings));
    
    // Mostrar confirmação
    alert('Configurações salvas com sucesso!\nFPS: ' + gameSettings.fps + '\nIdioma: ' + gameSettings.language + '\nVolume: ' + gameSettings.volume + '%');
    
    // Voltar para o menu
    backToMenu();
}

function quitGame() {
    if (confirm('Tem certeza que deseja sair?')) {
        alert('Obrigado por jogar Lost Nature!');
        // Em um contexto web, você pode fechar a janela (se permitido pelo navegador)
        window.close();
    }
}
