// Variáveis do jogo
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let score = 0;
let level = 1;
let health = 3; // 3 corações de vida
let gameRunning = true;
let allCoinsCollected = false; // Rastrear se todas moedas foram coletadas
let transitionActive = false; // Controlar animação de transição
let playerSteppedOnPlatform = false; // Ativa inimigos rápidos quando true
let invulnerableFrames = 0; // Frames de invulnerabilidade após mudança de fase

// Áudio
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let backgroundMusicPlaying = false;
let transitionFrame = 0; // Frame da animação de transição
const TRANSITION_DURATION = 60; // Duração da transição em frames

const GRAVITY = 0.6;
const JUMP_POWER = 15;

// Jogador - Cavaleiro Pixelado
const player = {
    x: 50,
    y: 400,
    width: 32,
    height: 48,
    vx: 0,
    vy: 0,
    speed: 5,
    jumping: false,
    onGround: false,
    facing: 1 // 1 para direita, -1 para esquerda
};

// Plataformas
let platforms = [];

// Inimigos
let enemies = [];

// Colecíveis
let collectibles = [];

// Controles
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    
    // Pausa com ESC
    if (e.key === 'Escape') {
        e.preventDefault();
        showPauseScreen();
    }
    
    // Pulo
    if ((e.key === ' ' || e.key.toLowerCase() === 'w') && player.onGround) {
        player.vy = -JUMP_POWER;
        player.onGround = false;
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// Inicializar jogo
function initGame() {
    allCoinsCollected = false;
    transitionActive = false;
    transitionFrame = 0;
    backgroundMusicPlaying = false;
    playerSteppedOnPlatform = false;
    createPlatforms();
    spawnCollectibles();
    // Posicionar jogador no início antes de spawnar inimigos
    player.x = 50;
    player.y = 400;
    player.vy = 0;
    // Dar invulnerabilidade antes de spawnar inimigos para evitar colisões instantâneas
    invulnerableFrames = Math.ceil(2 * 60); // 2s de invulnerabilidade inicial
    spawnEnemies();
    playBackgroundMusic(); // Iniciar música de fundo
    gameLoop();
}

// Criar plataformas aleatórias e progressivas com dificuldade aumentada
function createPlatforms() {
    platforms = [];
    
    // Piso principal
    platforms.push({
        x: 0,
        y: 550,
        width: canvas.width,
        height: 50,
        color: '#8b4513',
        moving: false,
        vx: 0,
        vy: 0
    });
    
    // Gerar plataformas aleatórias baseadas no nível
    // A dificuldade aumenta: mais plataformas e mais móveis
    const platformCount = 5 + Math.floor(level * 1.5);
    const minHeight = 150;
    const maxHeight = 480;
    const heightStep = (maxHeight - minHeight) / (platformCount - 1);
    
    for (let i = 0; i < platformCount - 1; i++) {
        const y = maxHeight - (i * heightStep);
        const x = Math.random() * (canvas.width - 150);
        const width = 60 + Math.random() * 120; // Variação maior de tamanhos
        
        // Plataformas móveis começam no nível 3 e aumentam em frequência
        const movingChance = level <= 2 ? 0 : level <= 4 ? 0.4 : level <= 6 ? 0.6 : 0.75;
        const isMoving = Math.random() < movingChance;
        const moveType = isMoving ? Math.random() > 0.5 ? 'horizontal' : 'vertical' : null;
        
        // Velocidade das plataformas aumenta com o nível
        const speedMultiplier = 1 + (level * 0.1);
        
        platforms.push({
            x: x,
            y: y,
            width: width,
            height: 20,
            color: isMoving ? '#a67c52' : '#8b4513',
            moving: isMoving,
            moveType: moveType,
            vx: moveType === 'horizontal' ? (Math.random() > 0.5 ? 2 : -2) * speedMultiplier : 0,
            vy: moveType === 'vertical' ? (Math.random() > 0.5 ? 1.5 : -1.5) * speedMultiplier : 0,
            minX: Math.max(0, x - 120),
            maxX: Math.min(canvas.width - width, x + 120),
            minY: Math.max(minHeight, y - 100),
            maxY: Math.min(480, y + 100),
            originalX: x,
            originalY: y
        });
    }
    
    // Plataforma especial no topo (meta)
    platforms.push({
        x: canvas.width / 2 - 50,
        y: 80,
        width: 100,
        height: 20,
        color: '#fbbf24',
        moving: false,
        vx: 0,
        vy: 0
    });
}

// Spawnar colecíveis
function spawnCollectibles() {
    // Gerar colecionáveis (moedas) sempre em plataformas alcançáveis
    collectibles = [];

    // Alcance vertical (altura máxima do pulo) e alcance horizontal aproximado
    const maxJumpHeight = (JUMP_POWER * JUMP_POWER) / (2 * GRAVITY);
    const maxJumpTime = (2 * JUMP_POWER) / GRAVITY;
    const baseHorizontalReach = Math.max(150, player.speed * maxJumpTime); // garantia mínima

    // Número de moedas controlado (aumenta com o nível, mas limitado)
    const coinCount = Math.min(3 + Math.floor(level / 2), Math.max(3, platforms.length));

    // Filtrar plataformas válidas (descartar chão muito largo com y == 550)
    let validPlatforms = platforms.filter(p => p.y < 550 && p.width > 40);
    if (validPlatforms.length === 0) return; // nada para colocar

    // Em cada tentativa relaxamos critérios até conseguir colocar todas as moedas em plataformas
    let vertFactor = Math.min(0.85 + level * 0.03, 0.98);
    let horFactor = 1.0;
    const placedPlatforms = [];

    function centerXOf(p) { return p.x + p.width / 2; }

    // Tentar colocar moedas em plataformas alcançáveis seguindo uma expansão (BFS-like)
    for (let attempt = 0; attempt < 12 && placedPlatforms.length < coinCount; attempt++) {
        // Reiniciar as plataformas colocadas a cada tentativa
        placedPlatforms.length = 0;
        const reachable = new Set();
        const queue = [];

        // Inicial: plataformas alcançáveis a partir da posição inicial do jogador
        validPlatforms.forEach((p, idx) => {
            const dx = Math.abs(centerXOf(p) - player.x);
            const dy = Math.abs((p.y - 30) - player.y);
            if (dy <= maxJumpHeight * vertFactor && dx <= baseHorizontalReach * horFactor) {
                reachable.add(idx);
                queue.push(idx);
            }
        });

        // Expandir para plataformas alcançáveis a partir de plataformas já alcançáveis
        while (queue.length > 0 && placedPlatforms.length < coinCount) {
            const idx = queue.shift();
            const p = validPlatforms[idx];
            const px = centerXOf(p);
            const py = p.y - 30;

            // Se ainda não usamos essa plataforma para moeda, adicionar
            if (!placedPlatforms.includes(idx)) placedPlatforms.push(idx);

            // Tentar descobrir novas plataformas a partir daqui
            validPlatforms.forEach((np, nidx) => {
                if (reachable.has(nidx)) return;
                const ndx = Math.abs(centerXOf(np) - px);
                const ndy = Math.abs((np.y - 30) - py);
                if (ndy <= maxJumpHeight * vertFactor && ndx <= baseHorizontalReach * horFactor) {
                    reachable.add(nidx);
                    queue.push(nidx);
                }
            });
        }

        // Se não colocou moedas suficientes, relaxar os fatores e tentar de novo
        if (placedPlatforms.length < coinCount) {
            vertFactor = Math.min(1.0, vertFactor + 0.05);
            horFactor += 0.15;
        }
    }

    // Garantir que temos plataformas suficientes; se não, usar as plataformas maiores mais próximas
    if (placedPlatforms.length < coinCount) {
        // Ordenar plataformas por largura e posição para escolher alternativas
        const sorted = validPlatforms.map((p, i) => ({ p, i })).sort((a, b) => b.p.width - a.p.width || Math.abs(centerXOf(a.p) - player.x) - Math.abs(centerXOf(b.p) - player.x));
        for (let k = 0; k < sorted.length && placedPlatforms.length < coinCount; k++) {
            if (!placedPlatforms.includes(sorted[k].i)) placedPlatforms.push(sorted[k].i);
        }
    }

    // Finalmente, criar as moedas nas plataformas selecionadas (limitando ao coinCount)
    for (let m = 0; m < Math.min(coinCount, placedPlatforms.length); m++) {
        const p = validPlatforms[placedPlatforms[m]];
        const cx = Math.max(p.x + 20, Math.min(p.x + p.width - 20, p.x + p.width / 2 + (Math.random() - 0.5) * 30));
        const cy = p.y - 30;
        collectibles.push({ x: cx, y: cy, width: 20, height: 20, collected: false, animationFrame: 0 });
    }
}

// Spawnar inimigos com três tipos diferentes e variedade por nível
function spawnEnemies() {
    enemies = [];
    // Controlar número de inimigos por faixa de nível
    let count = 5;
    if (level <= 3) count = 3;
    else if (level <= 6) count = 4;
    else count = 5;
    // garantir limite máximo
    count = Math.min(count, 5);
    
    for (let i = 0; i < count; i++) {
        // Inimigos nascem no lado direito (oposto ao jogador que nasce à esquerda)
        // Preferir spawn no final direito da tela
        const rightRegionX = canvas.width - 200; // começo da região final
        const spacing = 60; // espaçamento entre possíveis spawns
        const startX = Math.min(canvas.width - 40, rightRegionX + (i * spacing));

        // Tentar alinhar inimigo a uma plataforma próxima (evita spawn no ar/fora de alcance)
        let startY = 0;
        const nearbyPlatforms = platforms.filter(p => p.x <= startX + 50 && p.x + p.width >= startX - 50);
        if (nearbyPlatforms.length > 0) {
            startY = nearbyPlatforms[0].y - 32; // em cima da plataforma
        } else {
            // fallback: procurar qualquer plataforma mais à direita
            const rightPlatforms = platforms.filter(p => p.x > canvas.width * 0.5);
            if (rightPlatforms.length > 0) {
                const p = rightPlatforms[i % rightPlatforms.length];
                startY = p.y - 32;
            } else {
                startY = 350 + Math.random() * 100;
            }
        }
        
        // Variedade de tipos de inimigos aumenta com o nível
        let plantType = 0;
        if (level <= 2) {
            plantType = 0; // Apenas tipo normal nos primeiros níveis
        } else if (level <= 4) {
            plantType = Math.floor(Math.random() * 2); // Tipo 0 ou 1
        } else {
            plantType = Math.floor(Math.random() * 3); // Todos os tipos
        }
        
        // Velocidade base e variação por tipo
        let baseSpeed = 2 + level * 0.3;
        const speedVariation = 0.5 + Math.random() * 1;
        
        // Tipo 0 (Normal): verde, lento
        // Tipo 1 (Rápido): vermelho, mais rápido
        // Tipo 2 (Venenoso): roxo, lento, mais saúde
        
        let speed = baseSpeed + speedVariation;
        if (plantType === 1) {
            speed *= 1.4; // Tipo rápido é 40% mais rápido
        } else if (plantType === 2) {
            speed *= 0.7; // Tipo venenoso é 30% mais lento
        }
        const isFast = plantType === 1;
        enemies.push({
            x: startX,
            y: startY,
            width: 32,
            height: 32,
            vx: isFast ? 0 : speed * (Math.random() > 0.5 ? 1 : -1),
            vy: 0,
            onGround: false,
            // Percorrer toda a largura do chão
            minX: 0,
            maxX: Math.max(0, canvas.width - 32),
            facing: Math.random() > 0.5 ? 1 : -1,
            type: plantType, // 0: normal (verde), 1: rápido (vermelho), 2: venenoso (roxo)
            speed: speed,
            health: plantType === 2 ? 2 : 1, // Tipo venenoso tem 2 vidas
            poisonEffect: 0, // Efeito visual de veneno (animação)
            active: !isFast, // inimigos rápidos começam inativos
            flipCooldown: 0 // evitar flips imediatos repetidos
        });
        // Segurança: se algum inimigo estiver colidindo com o jogador ao spawnar, reposicionar para a extrema direita
        const en = enemies[enemies.length - 1];
        if (isColliding(en, player) || en.x < canvas.width * 0.6) {
            en.x = Math.max(canvas.width - 80, rightRegionX + (i * spacing));
            en.y = Math.max(en.y, 120);
        }
    }
}

// Loop principal do jogo
function gameLoop() {
    if (!gameRunning) return;
    
    // Limpar canvas
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Desenhar nuvens
    drawClouds();
    
    // Atualizar plataformas móveis
    updateMovingPlatforms();
    
    // Atualizar posição do jogador
    updatePlayer();
    
    // Atualizar inimigos (não atualizar durante transição)
    if (!transitionActive) {
        updateEnemies();
    }
    
    // Verificar colisões (não checar durante transição)
    if (!transitionActive) {
        checkCollisions();
    }
    
    // Desenhar tudo
    drawPlatforms();
    
    // Desenhar textura de relva no chão
    drawGrassTexture(0, 550, canvas.width, 50);
    
    drawCollectibles();
    drawEnemies();
    drawPlayer();
    // Desenhar escudo visual se estiver invulnerável
    if (invulnerableFrames > 0) drawPlayerShield();
    
    // Atualizar UI
    updateUI();

    // Decrementar invulnerabilidade se ativa
    if (invulnerableFrames > 0) invulnerableFrames--;
    
    // Verificar se chegou ao final da tela (lado direito) após coletar todos os coins
    if (allCoinsCollected && !transitionActive && player.x + player.width >= canvas.width - 20) {
        transitionActive = true;
        transitionFrame = 0;
    }
    
    // Desenhar transição se ativa
    if (transitionActive) {
        drawTransition();
        transitionFrame++;
        
        // Quando transição terminar
        if (transitionFrame >= TRANSITION_DURATION) {
            transitionActive = false;
            allCoinsCollected = false;
            level++;
            playerSteppedOnPlatform = false;
            createPlatforms();
            spawnCollectibles();
            // Posicionar jogador no início antes de spawnar inimigos
            player.x = 50;
            player.y = 400;
            player.vy = 0;
            // Dar invulnerabilidade antes de spawnar inimigos no novo nível
            invulnerableFrames = Math.ceil(2 * 60); // 2s de invulnerabilidade ao começar novo nível
            spawnEnemies();
        }
    }
    
    // Verificar se caiu (não aplicar durante transição)
    if (!transitionActive && player.y > canvas.height + 50) {
        health -= 1; // Perde 1 coração
        if (health <= 0) {
            endGame();
        } else {
            player.x = 50;
            player.y = 400;
            player.vy = 0;
        }
    }
    
    requestAnimationFrame(gameLoop);
}

// Desenhar nuvens
function drawClouds() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(100, 50, 80, 40);
    ctx.fillRect(500, 100, 80, 40);
    ctx.fillRect(900, 80, 80, 40);
}

// Desenhar texturas de relva
function drawGrassTexture(x, y, width, height) {
    ctx.fillStyle = 'rgba(34, 139, 34, 0.2)';
    for (let i = 0; i < width; i += 5) {
        for (let j = 0; j < height; j += 5) {
            if (Math.random() > 0.5) {
                ctx.fillRect(x + i, y + j, 3, 3);
            }
        }
    }
}

// Animar transição de fase com terra caindo
function drawTransition() {
    // Cobrir a tela com um overlay gradualmente mais opaco
    ctx.fillStyle = 'rgba(101, 67, 33, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Altura progressiva de terra que cai
    const earthHeight = (transitionFrame / TRANSITION_DURATION) * canvas.height;
    
    // Desenhar terra caindo de cima
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(0, 0, canvas.width, earthHeight);
    
    // Adicionar textura à terra que está caindo
    ctx.fillStyle = 'rgba(139, 69, 19, 0.4)';
    for (let x = 0; x < canvas.width; x += 15) {
        for (let y = 0; y < earthHeight; y += 15) {
            if ((x / 15 + y / 15) % 2 === 0) {
                ctx.fillRect(x, y, 12, 12);
            }
        }
    }
    
    // Adicionar particulados de terra voando (efeito de poeira)
    ctx.fillStyle = 'rgba(160, 90, 40, 0.5)';
    for (let i = 0; i < 20; i++) {
        // Gerar posições pseudo-aleatórias baseadas no transitionFrame
        const seed = (i * 73) % 360;
        const x = (canvas.width / 2) + Math.cos((transitionFrame + seed) * 0.1) * 200 + Math.sin(seed * 0.05) * 100;
        const y = Math.sin((transitionFrame + seed) * 0.08) * 150 + (transitionFrame / TRANSITION_DURATION) * canvas.height;
        
        const particleSize = 2 + Math.sin(transitionFrame * 0.1 + seed) * 2;
        if (y < canvas.height && y > -20) {
            ctx.fillRect(x, y, particleSize, particleSize);
        }
    }
    
    // Texto de "Próximo Nível"
    if (transitionFrame > TRANSITION_DURATION * 0.3) {
        ctx.fillStyle = 'rgba(255, 255, 255, ' + Math.min(1, (transitionFrame - TRANSITION_DURATION * 0.3) / 20) + ')';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 4;
        ctx.strokeText('Nível ' + (level + 1), canvas.width / 2, canvas.height / 2);
        ctx.fillText('Nível ' + (level + 1), canvas.width / 2, canvas.height / 2);
    }
}

// Desenhar plataformas com textura de tijolos
function drawPlatforms() {
    platforms.forEach(platform => {
        // Cor base
        ctx.fillStyle = platform.color;
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
        
        // Textura de tijolos
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = 1;
        
        // Desenhar linhas de tijolos verticais
        for (let x = platform.x; x < platform.x + platform.width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, platform.y);
            ctx.lineTo(x, platform.y + platform.height);
            ctx.stroke();
        }
        
        // Linhas horizontais
        for (let y = platform.y; y < platform.y + platform.height; y += 20) {
            ctx.beginPath();
            ctx.moveTo(platform.x, y);
            ctx.lineTo(platform.x + platform.width, y);
            ctx.stroke();
        }
        
        // Sombra superior para dar profundidade
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(platform.x, platform.y, platform.width, 3);
        
        // Sombra inferior
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(platform.x, platform.y + platform.height - 3, platform.width, 3);
    });
}

// Atualizar plataformas móveis
function updateMovingPlatforms() {
    platforms.forEach(platform => {
        if (platform.moving) {
            if (platform.moveType === 'horizontal') {
                platform.x += platform.vx;
                if (platform.x <= platform.minX || platform.x >= platform.maxX) {
                    platform.vx *= -1;
                }
            } else if (platform.moveType === 'vertical') {
                platform.y += platform.vy;
                if (platform.y <= platform.minY || platform.y >= platform.maxY) {
                    platform.vy *= -1;
                }
            }
        }
    });
}

// Atualizar jogador com colisões ajustadas para os pés
function updatePlayer() {
    // Não mover durante a transição
    if (transitionActive) {
        // Apenas aplicar gravidade durante a transição
        player.vy += GRAVITY;
        if (player.vy > 20) player.vy = 20;
        player.y += player.vy;
        return;
    }
    
    // Movimento horizontal
    player.vx = 0;
    
    if (keys['arrowleft'] || keys['a']) {
        player.vx = -player.speed;
        player.facing = -1;
    }
    if (keys['arrowright'] || keys['d']) {
        player.vx = player.speed;
        player.facing = 1;
    }
    
    // Aplicar gravidade
    player.vy += GRAVITY;
    
    // Limitar velocidade de queda
    if (player.vy > 20) {
        player.vy = 20;
    }
    
    // Atualizar posição horizontal
    player.x += player.vx;
    
    // Limites horizontais (antes de colisão lateral)
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
    
    // Atualizar posição vertical
    player.y += player.vy;
    
    // Verificar colisão com plataformas
    player.onGround = false;
    
    platforms.forEach(platform => {
        // Colisão por cima (jogador fica em pé com os pés encostando)
        // Verificar se está caindo E dentro dos limites horizontais da plataforma
        if (player.vy >= 0 &&
            player.y + player.height >= platform.y &&
            player.y + player.height <= platform.y + 15 &&
            player.x + player.width > platform.x + 5 &&
            player.x < platform.x + platform.width - 5) {
            
            // Colocar o jogador exatamente em pé sobre a plataforma
            player.y = platform.y - player.height;
            player.vy = 0;
            player.onGround = true;
                // Registrar que o jogador pisou em uma plataforma pela primeira vez
                if (!playerSteppedOnPlatform) {
                    playerSteppedOnPlatform = true;
                    // Ativar inimigos rápidos quando o jogador pisar em qualquer plataforma
                    enemies.forEach(e => {
                        if (e.type === 1 && !e.active) {
                            e.active = true;
                            e.vx = e.speed * (Math.random() > 0.5 ? 1 : -1);
                        }
                    });
                }
        }
        
        // Colisão lateral direita (se movendo para esquerda)
        if (player.vx < 0 &&
            player.y + player.height > platform.y + 2 &&
            player.y < platform.y + platform.height - 2 &&
            player.x < platform.x + platform.width &&
            player.x + player.width > platform.x + platform.width - 5) {
            player.x = platform.x + platform.width;
        }
        
        // Colisão lateral esquerda (se movendo para direita)
        if (player.vx > 0 &&
            player.y + player.height > platform.y + 2 &&
            player.y < platform.y + platform.height - 2 &&
            player.x + player.width > platform.x &&
            player.x < platform.x + 5) {
            player.x = platform.x - player.width;
        }
    });
}

// Atualizar inimigos com comportamento baseado no tipo
function updateEnemies() {
    enemies.forEach((enemy, index) => {
        // Movimento: se inimigo rápido e inativo, não se move
        if (enemy.type === 1 && !enemy.active) {
            // ainda aplicar gravidade para posicionamento correto
        } else {
            enemy.x += enemy.vx;
        }
        
        // Reverter direção nos limites (apenas se estiver movendo)
        if (enemy.flipCooldown > 0) {
            enemy.flipCooldown--;
        }
        if ((enemy.type !== 1 || enemy.active) && enemy.flipCooldown === 0 && (enemy.x < enemy.minX || enemy.x + enemy.width > enemy.maxX)) {
            // Colocar dentro dos limites para evitar ficar preso
            enemy.x = Math.max(enemy.minX, Math.min(enemy.x, enemy.maxX - enemy.width));
            // Inverter velocidade assegurando magnitude baseada em speed
            const sign = enemy.vx >= 0 ? -1 : 1;
            enemy.vx = sign * Math.max(Math.abs(enemy.vx), enemy.speed * 0.6);
            enemy.facing *= -1;
            enemy.flipCooldown = 6; // evitar flip repetido por alguns frames
        }
        
        // Aplicar gravidade
        enemy.vy += GRAVITY;
        if (enemy.vy > 20) enemy.vy = 20;
        enemy.y += enemy.vy;
        
        // Atualizar efeito visual do veneno para tipo 2
        if (enemy.type === 2) {
            enemy.poisonEffect = (enemy.poisonEffect + 1) % 30;
        }
        
        // Colisão com plataformas
        enemy.onGround = false;
        platforms.forEach(platform => {
            if (enemy.vy >= 0 &&
                enemy.y + enemy.height <= platform.y + 10 &&
                enemy.y + enemy.height + enemy.vy >= platform.y &&
                enemy.x + enemy.width > platform.x &&
                enemy.x < platform.x + platform.width) {
                enemy.y = platform.y - enemy.height;
                enemy.vy = 0;
                enemy.onGround = true;
            }
        });
    });
}

// Verificar colisões com inimigos e itens
function checkCollisions() {
    // Colisão com colecíveis
    collectibles = collectibles.filter(collectible => {
        if (!collectible.collected && isColliding(player, collectible)) {
            score += 10;
            collectible.collected = true;
            playCoinSound(); // Tocar som de moeda
            return true;
        }
        return !collectible.collected;
    });
    
    // Verificar se coletou todos
    const remainingCollectibles = collectibles.filter(c => !c.collected);
    if (remainingCollectibles.length === 0 && collectibles.length > 0) {
        allCoinsCollected = true;
        // Matar todos os inimigos
        enemies = [];
        score += 50; // Bônus ao completar o nível
    }
    
    // Colisão com inimigos
    enemies.forEach((enemy, index) => {
        if (isColliding(player, enemy)) {
            // Se o jogador pula em cima do inimigo (com margem de tolerância)
            if (player.vy > 0 && player.y + player.height / 2 < enemy.y + enemy.height / 2) {
                // Verificar saúde do inimigo
                enemy.health -= 1;
                
                if (enemy.health <= 0) {
                    // Inimigo derrotado
                    let points = 50; // Pontos base
                    
                    // Bônus baseado no tipo
                    if (enemy.type === 1) {
                        points = 75; // Tipo rápido vale mais
                    } else if (enemy.type === 2) {
                        points = 100; // Tipo venenoso vale muito mais
                    }
                    
                    score += points;
                    enemies.splice(index, 1);
                } else {
                    // Inimigo ainda tem vida, só dar knockback
                    player.vy = -8;
                }
                player.vy = -10; // Pulo ao derrotar inimigo
            } else {
                // Colisão lateral ou normal - tomar dano (respeitar invulnerabilidade)
                if (invulnerableFrames > 0) {
                    // apenas aplicar knockback visual, sem dano
                    player.vy = -6;
                } else {
                    health -= 1;
                    player.vy = -10; // Knockback
                    if (health <= 0) {
                        endGame();
                    }
                }
            }
        }
    });
}

// Função de colisão
function isColliding(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Desenhar jogador - CAVALEIRO PIXELADO MUITO DETALHADO com pés bem definidos
function drawPlayer() {
    const x = player.x;
    const y = player.y;
    const ps = 4; // pixel size
    
    if (player.facing === 1) {
        // Cavaleiro voltado para direita
        
        // Sombra
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(x + 2*ps, y + 14*ps, 8*ps, ps);
        
        // PÉS MUITO BEM DEFINIDOS (encostando nas plataformas)
        // Pé esquerdo
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x + 2*ps, y + 13*ps, 3*ps, 3*ps);
        ctx.fillStyle = '#333333';
        ctx.fillRect(x + 2.5*ps, y + 13.5*ps, 2*ps, 2*ps);
        
        // Pé direito
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x + 6*ps, y + 13*ps, 3*ps, 3*ps);
        ctx.fillStyle = '#333333';
        ctx.fillRect(x + 6.5*ps, y + 13.5*ps, 2*ps, 2*ps);
        
        // Tornozelos (conectam pés às pernas)
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + 2.5*ps, y + 11*ps, 2*ps, 2*ps);
        ctx.fillRect(x + 6.5*ps, y + 11*ps, 2*ps, 2*ps);
        
        // Pernas
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + 3*ps, y + 10*ps, 2*ps, 3*ps);
        ctx.fillRect(x + 6*ps, y + 10*ps, 2*ps, 3*ps);
        
        // Joelhos/Proteção
        ctx.fillStyle = '#1e90ff';
        ctx.fillRect(x + 2.5*ps, y + 10.5*ps, 3*ps, ps);
        ctx.fillRect(x + 5.5*ps, y + 10.5*ps, 3*ps, ps);
        
        // Coxas
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + 2*ps, y + 7*ps, 7*ps, 3*ps);
        
        // Corpo/Armadura
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + 2*ps, y + 4*ps, 7*ps, 6*ps);
        
        // Detalhes da armadura (divisão)
        ctx.fillStyle = '#1e90ff';
        ctx.fillRect(x + 3*ps, y + 5*ps, ps, 4*ps); // Divisão central
        ctx.fillRect(x + 7*ps, y + 5*ps, ps, 4*ps);
        
        // Ombros
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + ps, y + 4*ps, ps, 3*ps);
        ctx.fillRect(x + 9*ps, y + 4*ps, ps, 3*ps);
        
        // Braço direito (com escudo)
        ctx.fillStyle = '#dc143c'; // Vermelho
        ctx.fillRect(x - ps, y + 5*ps, 2*ps, 4*ps); // Escudo
        
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(x, y + 6*ps, ps, 2*ps); // Brasão
        
        // Braço esquerdo
        ctx.fillStyle = '#ff8c00'; // Pele
        ctx.fillRect(x + 9.5*ps, y + 5*ps, 1.5*ps, 4*ps);
        
        // Luvas
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + 9.5*ps, y + 9*ps, 1.5*ps, ps);
        ctx.fillRect(x - ps, y + 9*ps, 2*ps, ps);
        
        // Pescoço
        ctx.fillStyle = '#ff8c00';
        ctx.fillRect(x + 4.5*ps, y + 3.5*ps, ps, ps);
        
        // Cabeça
        ctx.fillStyle = '#4169e1'; // Capacete
        ctx.fillRect(x + 3*ps, y - ps, 5*ps, 4*ps);
        
        // Detalhes do capacete
        ctx.fillStyle = '#1e90ff';
        ctx.fillRect(x + 3*ps, y, 5*ps, ps); // Banda inferior
        ctx.fillRect(x + 3.5*ps, y - ps, ps, 2*ps); // Pluma esquerda
        ctx.fillRect(x + 7.5*ps, y - ps, ps, 2*ps); // Pluma direita
        
        // Viseira/Rosto
        ctx.fillStyle = '#fdbf00';
        ctx.fillRect(x + 4*ps, y + ps, 3*ps, ps);
        
        // Olhos com mais detalhe
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + 4.5*ps, y + ps, 0.5*ps, 0.5*ps);
        ctx.fillRect(x + 6*ps, y + ps, 0.5*ps, 0.5*ps);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 4.7*ps, y + 0.7*ps, 0.2*ps, 0.2*ps);
        ctx.fillRect(x + 6.2*ps, y + 0.7*ps, 0.2*ps, 0.2*ps);
        
    } else {
        // Cavaleiro voltado para esquerda (espelhado)
        
        // Sombra
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(x + 2*ps, y + 14*ps, 8*ps, ps);
        
        // PÉS MUITO BEM DEFINIDOS
        // Pé esquerdo (espelhado)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x + 6*ps, y + 13*ps, 3*ps, 3*ps);
        ctx.fillStyle = '#333333';
        ctx.fillRect(x + 6.5*ps, y + 13.5*ps, 2*ps, 2*ps);
        
        // Pé direito (espelhado)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x + 2*ps, y + 13*ps, 3*ps, 3*ps);
        ctx.fillStyle = '#333333';
        ctx.fillRect(x + 2.5*ps, y + 13.5*ps, 2*ps, 2*ps);
        
        // Tornozelos (conectam pés às pernas)
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + 5.5*ps, y + 11*ps, 2*ps, 2*ps);
        ctx.fillRect(x + 1.5*ps, y + 11*ps, 2*ps, 2*ps);
        
        // Pernas
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + 6*ps, y + 10*ps, 2*ps, 3*ps);
        ctx.fillRect(x + 3*ps, y + 10*ps, 2*ps, 3*ps);
        
        // Joelhos/Proteção
        ctx.fillStyle = '#1e90ff';
        ctx.fillRect(x + 5.5*ps, y + 10.5*ps, 3*ps, ps);
        ctx.fillRect(x + 2.5*ps, y + 10.5*ps, 3*ps, ps);
        
        // Coxas
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + 2*ps, y + 7*ps, 7*ps, 3*ps);
        
        // Corpo/Armadura
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + 2*ps, y + 4*ps, 7*ps, 6*ps);
        
        // Detalhes
        ctx.fillStyle = '#1e90ff';
        ctx.fillRect(x + 3*ps, y + 5*ps, ps, 4*ps);
        ctx.fillRect(x + 7*ps, y + 5*ps, ps, 4*ps);
        
        // Ombros
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + ps, y + 4*ps, ps, 3*ps);
        ctx.fillRect(x + 9*ps, y + 4*ps, ps, 3*ps);
        
        // Braço esquerdo (com escudo)
        ctx.fillStyle = '#dc143c';
        ctx.fillRect(x + 9*ps, y + 5*ps, 2*ps, 4*ps);
        
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(x + 10*ps, y + 6*ps, ps, 2*ps);
        
        // Braço direito
        ctx.fillStyle = '#ff8c00';
        ctx.fillRect(x - 0.5*ps, y + 5*ps, 1.5*ps, 4*ps);
        
        // Luvas
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x - 0.5*ps, y + 9*ps, 1.5*ps, ps);
        ctx.fillRect(x + 9*ps, y + 9*ps, 2*ps, ps);
        
        // Pescoço
        ctx.fillStyle = '#ff8c00';
        ctx.fillRect(x + 4.5*ps, y + 3.5*ps, ps, ps);
        
        // Cabeça
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(x + 3*ps, y - ps, 5*ps, 4*ps);
        
        // Detalhes do capacete
        ctx.fillStyle = '#1e90ff';
        ctx.fillRect(x + 3*ps, y, 5*ps, ps);
        ctx.fillRect(x + 3.5*ps, y - ps, ps, 2*ps);
        ctx.fillRect(x + 7.5*ps, y - ps, ps, 2*ps);
        
        // Viseira
        ctx.fillStyle = '#fdbf00';
        ctx.fillRect(x + 4*ps, y + ps, 3*ps, ps);
        
        // Olhos com mais detalhe
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + 4.5*ps, y + ps, 0.5*ps, 0.5*ps);
        ctx.fillRect(x + 6*ps, y + ps, 0.5*ps, 0.5*ps);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 4.7*ps, y + 0.7*ps, 0.2*ps, 0.2*ps);
        ctx.fillRect(x + 6.2*ps, y + 0.7*ps, 0.2*ps, 0.2*ps);
    }
}

// Desenhar um escudo visual ao redor do jogador quando invulnerável
function drawPlayerShield() {
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    const radius = Math.max(player.width, player.height);

    ctx.save();
    ctx.globalAlpha = 0.45;
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.6);
    grad.addColorStop(0, 'rgba(173,216,230,0.9)');
    grad.addColorStop(0.6, 'rgba(173,216,230,0.3)');
    grad.addColorStop(1, 'rgba(173,216,230,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Desenhar inimigos - TRÊS TIPOS DE PLANTAS COM CORES DIFERENTES
function drawEnemies() {
    enemies.forEach(enemy => {
        const x = enemy.x;
        const y = enemy.y;
        const ps = 4;
        
        // Escolher cor baseada no tipo
        let plantColor, stemColor, rootColor, leafColor;
        
        if (enemy.type === 0) {
            // Tipo 0: NORMAL (verde, lento)
            rootColor = '#654321';
            stemColor = '#228b22';  // Verde floresta
            plantColor = '#32cd32';  // Verde lima
            leafColor = '#2d5016';   // Verde escuro
        } else if (enemy.type === 1) {
            // Tipo 1: RÁPIDO (vermelho, agressivo)
            rootColor = '#8b0000';   // Vermelho escuro
            stemColor = '#cd5c5c';   // Índio
            plantColor = '#dc143c';  // Crimsomn (vermelho brilhante)
            leafColor = '#8b0000';   // Vermelho escuro
        } else {
            // Tipo 2: VENENOSO (roxo, mais saúde)
            rootColor = '#4b0082';   // Índigo
            stemColor = '#9932cc';   // Orchídea escuro
            plantColor = '#da70d6';  // Orchídea
            leafColor = '#6a0dad';   // Roxo escuro
        }
        
        // Raiz
        ctx.fillStyle = rootColor;
        ctx.fillRect(x + 3*ps, y + 10*ps, 2*ps, 4*ps);
        
        // Talo principal
        ctx.fillStyle = stemColor;
        ctx.fillRect(x + 3*ps, y + 4*ps, 2*ps, 6*ps);
        
        // Corpo/Bulbo
        ctx.fillStyle = plantColor;
        ctx.fillRect(x + 2*ps, y + 2*ps, 4*ps, 4*ps);
        
        // Folhas mortas (ressecadas)
        ctx.fillStyle = leafColor;
        
        if (enemy.facing === 1) {
            // Folha esquerda
            ctx.fillRect(x + ps, y + 2*ps, 2*ps, 2*ps);
            ctx.fillRect(x, y + 3*ps, ps, 2*ps);
            
            // Folha direita
            ctx.fillRect(x + 5*ps, y + 3*ps, 2*ps, ps);
            ctx.fillRect(x + 7*ps, y + 4*ps, ps, ps);
        } else {
            // Folha direita (espelhada)
            ctx.fillRect(x + 5*ps, y + 2*ps, 2*ps, 2*ps);
            ctx.fillRect(x + 7*ps, y + 3*ps, ps, 2*ps);
            
            // Folha esquerda
            ctx.fillRect(x + ps, y + 3*ps, 2*ps, ps);
            ctx.fillRect(x, y + 4*ps, ps, ps);
        }
        
        // Olhos mortos (X)
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + 2*ps, y + 2*ps, ps, ps);
        ctx.fillRect(x + ps, y + ps, ps, ps);
        ctx.fillRect(x + 3*ps, y + ps, ps, ps);
        
        ctx.fillRect(x + 4.5*ps, y + 2.5*ps, ps, ps);
        
        // Efeito visual especial para tipo venenoso (tipo 2)
        if (enemy.type === 2) {
            // Aura de veneno pulsante
            const poisonPulse = Math.sin(enemy.poisonEffect / 10) * 2 + 2;
            ctx.strokeStyle = `rgba(138, 43, 226, ${0.5 + Math.sin(enemy.poisonEffect / 15) * 0.3})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x + 4*ps, y + 4*ps, 5*ps + poisonPulse, 0, Math.PI * 2);
            ctx.stroke();
            
            // Gotas de veneno
            ctx.fillStyle = `rgba(138, 43, 226, ${0.6 + Math.sin(enemy.poisonEffect / 20) * 0.3})`;
            ctx.fillRect(x + ps, y + 2*ps, ps - 1, ps - 1);
            ctx.fillRect(x + 7*ps, y + 4*ps, ps - 1, ps - 1);
        }
        
        // Indicador de saúde para inimigos com mais de 1 vida
        if (enemy.health === 2) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(x + ps, y - 3*ps, 6*ps, ps);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(x + ps, y - 3*ps, 3*ps, ps);
        }
    });
}

// Desenhar colecíveis
function drawCollectibles() {
    collectibles.forEach((collectible, index) => {
        if (!collectible.collected) {
            collectible.animationFrame = (collectible.animationFrame + 1) % 20;
            const bob = Math.sin(collectible.animationFrame * Math.PI / 10) * 5;
            
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(collectible.x, collectible.y + bob, collectible.width, collectible.height);
            
            // Estrela pixelada
            ctx.fillStyle = '#ffed4e';
            ctx.fillRect(collectible.x + 4, collectible.y + 4 + bob, 4, 4);
            ctx.fillRect(collectible.x + 8, collectible.y + 4 + bob, 4, 4);
            ctx.fillRect(collectible.x + 6, collectible.y + 6 + bob, 4, 4);
        }
    });
}

// Atualizar UI
// Atualizar UI e desenhar corações
function updateUI() {
    document.getElementById('score').textContent = score;
    document.getElementById('level').textContent = level;
    
    // Desenhar corações
    const healthDisplay = document.getElementById('health');
    healthDisplay.innerHTML = '';
    for (let i = 0; i < health; i++) {
        healthDisplay.innerHTML += '❤ ';
    }
}

// Mostrar tela de pausa
function showPauseScreen() {
    gameRunning = false;
    document.getElementById('pauseScreen').style.display = 'flex';
}

// Continuar jogo
function resumeGame() {
    document.getElementById('pauseScreen').style.display = 'none';
    gameRunning = true;
    gameLoop();
}

// Abrir opções durante a pausa
function openPauseOptions() {
    alert('Opções durante pausa (implementar futuramente)');
    // Aqui você pode abrir uma tela de opções similar ao menu principal
}

// Fim do jogo
function endGame() {
    gameRunning = false;
    showGameOver();
}

// Mostrar tela de Game Over
function showGameOver() {
    document.getElementById('gameOverScreen').style.display = 'flex';
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalLevel').textContent = level;
}

// Reiniciar jogo e voltar ao menu
function restartGame() {
    // Redefine todas as variáveis do jogo
    score = 0;
    level = 1;
    health = 3;
    gameRunning = true;
    allCoinsCollected = false;
    transitionActive = false;
    transitionFrame = 0;
    
    // Reseta player
    player.x = 50;
    player.y = 400;
    player.vx = 0;
    player.vy = 0;
    player.jumping = false;
    player.onGround = false;
    
    // Limpa arrays
    platforms = [];
    enemies = [];
    collectibles = [];
    
    // Esconde tela de game over
    document.getElementById('gameOverScreen').style.display = 'none';
    
    // Volta para o menu principal
    window.location.href = 'index.html';
}

// Voltar ao menu principal
function backToMainMenu() {
    window.location.href = 'index.html';
}

// Tocar música de fundo calma
function playBackgroundMusic() {
    if (backgroundMusicPlaying || audioContext.state === 'suspended') return;
    backgroundMusicPlaying = true;

    // Notas da escala pentatônica menor (C, Eb, F, G, Bb)
    const notes = [65.41, 77.78, 87.31, 97.99, 116.54];

    // Função que agenda uma nota aleatória suave
    function scheduleRandomNote() {
        if (!backgroundMusicPlaying || audioContext.state === 'suspended' || !gameRunning) return;

        const now = audioContext.currentTime;
        const freq = notes[Math.floor(Math.random() * notes.length)];
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq * (0.95 + Math.random() * 0.1); // pequena variação

        gain.gain.setValueAtTime(0.0, now);
        gain.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.02, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6 + Math.random() * 0.6);

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.start(now);
        osc.stop(now + 1.0);

        // Agendar próxima nota em intervalo aleatório para soar natural
        const nextIn = 0.4 + Math.random() * 1.2; // entre 0.4s e 1.6s
        setTimeout(() => {
            scheduleRandomNote();
        }, nextIn * 1000);
    }

    // Iniciar várias vozes suaves para criar textura
    for (let i = 0; i < 2; i++) {
        setTimeout(scheduleRandomNote, i * 300);
    }
}

// Tocar som de moeda coletada
function playCoinSound() {
    if (audioContext.state === 'suspended') return;
    
    const now = audioContext.currentTime;
    const noteDuration = 0.1;
    
    // Sequência de duas notas altas para efeito de moeda
    const frequencies = [800, 1200]; // Notas altas para som de moeda
    
    frequencies.forEach((freq, index) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.frequency.value = freq;
        osc.type = 'square'; // Onda quadrada para tom de moeda
        
        const startTime = now + (index * noteDuration);
        
        // Envelope rápido para som de moeda
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + noteDuration);
        
        osc.start(startTime);
        osc.stop(startTime + noteDuration);
    });
}

// Teste automático de spawn para fase 3, mostra resultado na tela e corrige spawns que colidam com o jogador
function runSpawnTest() {
    try {
        const originalLevel = level;
        const originalPlatforms = platforms.slice();
        const originalEnemies = enemies.slice();
        const originalCollectibles = collectibles.slice();

        level = 3;
        createPlatforms();
        spawnCollectibles();

        // posicionar jogador no início e dar invulnerabilidade curta
        player.x = 50; player.y = 400; player.vy = 0;
        invulnerableFrames = Math.ceil(2 * 60);

        spawnEnemies();

        // Verificar colisões iniciais com inimigos
        const issues = [];
        enemies.forEach((e, i) => {
            if (isColliding(e, player) || e.x < canvas.width * 0.55) {
                issues.push({ index: i, x: e.x, y: e.y, type: e.type });
                // reposicionar para a direita
                e.x = Math.max(canvas.width - 120, canvas.width - 40 - i * 40);
            }
        });

        // Criar painel de debug e mostrar resultado
        const panel = document.createElement('div');
        panel.id = 'autoTestPanel';
        panel.style.position = 'fixed';
        panel.style.right = '12px';
        panel.style.top = '12px';
        panel.style.padding = '12px';
        panel.style.background = 'rgba(0,0,0,0.7)';
        panel.style.color = '#fff';
        panel.style.zIndex = 9999;
        panel.style.fontFamily = 'monospace';
        panel.style.fontSize = '13px';
        panel.style.borderRadius = '6px';

        if (issues.length === 0) {
            panel.innerText = 'Spawn test (fase 3): OK — nenhum inimigo colidiu com o jogador.';
        } else {
            panel.innerText = 'Spawn test (fase 3): CORRIGIDO ' + issues.length + ' issue(s) detectada(s).\nReposicionei inimigos para a direita.';
        }

        document.body.appendChild(panel);

        // Restaurar arrays originais para não afetar initGame (mas keep corrected enemies for fairness)
        // keep platforms/collectibles for level 3 setup, do not restore enemies to ensure corrected positions used
        // restore level to original
        level = originalLevel;

        // remover painel após 4 segundos
        setTimeout(() => { if (panel && panel.parentNode) panel.parentNode.removeChild(panel); }, 4000);

    } catch (e) {
        console.error('Spawn test failed', e);
    }
}

// Iniciar o jogo quando a página carregar (faz o teste antes de inicializar)
window.addEventListener('DOMContentLoaded', () => { runSpawnTest(); initGame(); });
