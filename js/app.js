// Global App State Namespace
window.CAH = {
    state: {
        isHost: false,
        playerName: '',
        room: null,
        peers: [], // list of connected peers
        gameState: null
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // Check URL for room code
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    if (roomCode) {
        document.getElementById('join-room-id').value = roomCode;
        showScreen('screen-join');
    }

    // Navigation handling
    document.getElementById('btn-show-create').addEventListener('click', () => {
        showScreen('screen-create');
        // Load expansions when opening create screen
        if (!window.cardsLoaded) {
            CAHCards.loadPacks().then(packs => {
                CAHUI.renderExpansionsList(packs);
                window.cardsLoaded = true;
            });
        }
    });

    document.getElementById('btn-show-join').addEventListener('click', () => {
        showScreen('screen-join');
    });

    // Back buttons
    document.querySelectorAll('.btn-back').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.target.getAttribute('data-target');
            if (target) {
                showScreen(target);
            } else {
                showScreen('screen-home');
            }
        });
    });

    // Setup network and game logic handlers
    setupCreateRoom();
    setupJoinRoom();
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function setupCreateRoom() {
    document.getElementById('btn-create-room').addEventListener('click', () => {
        const roomName = document.getElementById('room-name').value.trim() || 'Sala dos Horrores';
        const password = document.getElementById('room-password').value.trim();
        const maxScore = parseInt(document.getElementById('max-score').value) || 7;
        const maxPlayers = parseInt(document.getElementById('max-players').value) || 10;
        const playerName = document.getElementById('host-name').value.trim() || 'Host';
        
        // Regras da casa
        const rules = {
            rando: document.getElementById('rule-rando').checked,
            embalagem: document.getElementById('rule-embalagem').checked,
            euNunca: document.getElementById('rule-eununca').checked
        };
        
        // Get selected packs
        const selectedPacks = [];
        document.querySelectorAll('.pack-checkbox:checked').forEach(cb => {
            selectedPacks.push(parseInt(cb.value));
        });

        if (selectedPacks.length === 0) {
            CAHUI.showToast("Selecione pelo menos uma expansão!", "error");
            return;
        }

        CAH.state.isHost = true;
        CAH.state.playerName = playerName;
        CAH.state.room = {
            name: roomName,
            password: password,
            maxScore: maxScore,
            maxPlayers: maxPlayers,
            selectedPacks: selectedPacks,
            rules: rules
        };

        // Initialize Peer as Host
        CAHNetwork.initHost().then(roomId => {
            document.getElementById('lobby-room-name').textContent = roomName;
            document.getElementById('lobby-room-id').textContent = roomId;
            document.getElementById('lobby-max-players').textContent = maxPlayers;
            document.getElementById('btn-start-game').style.display = 'block';
            document.getElementById('waiting-host-msg').style.display = 'none';
            
            // Gerar QR Code (com try..catch caso o CDN seja bloqueado por AdBlock)
            try {
                const joinUrl = window.location.origin + window.location.pathname + '?room=' + roomId;
                const qrContainer = document.getElementById('qrcode-container');
                if (qrContainer) {
                    qrContainer.innerHTML = '';
                    if (typeof QRCode !== 'undefined') {
                        new QRCode(qrContainer, {
                            text: joinUrl,
                            width: 150,
                            height: 150
                        });
                    }
                }
            } catch (e) {
                console.warn("Não foi possível gerar o QR Code:", e);
            }
            
            // Adicionar host no jogo oficial (vai disparar o updateLobbyPlayers internamente)
            CAHGame.addHostToGame();
            
            showScreen('screen-lobby');
            CAHUI.showToast("Sala criada com sucesso!");
        }).catch(err => {
            CAHUI.showToast("Erro ao criar sala: " + err, "error");
        });
    });
}

function setupJoinRoom() {
    document.getElementById('btn-join-room').addEventListener('click', () => {
        const playerName = document.getElementById('player-name').value.trim();
        const roomId = document.getElementById('join-room-id').value.trim().toUpperCase();
        const password = document.getElementById('join-room-password').value.trim();

        if (!playerName || !roomId) {
            CAHUI.showToast("Nome e Código da sala são obrigatórios!", "error");
            return;
        }

        CAH.state.isHost = false;
        CAH.state.playerName = playerName;

        CAHNetwork.joinRoom(roomId, playerName, password).then(() => {
            document.getElementById('btn-start-game').style.display = 'none';
            document.getElementById('waiting-host-msg').style.display = 'block';
            document.getElementById('lobby-room-id').textContent = roomId;
            showScreen('screen-lobby');
            CAHUI.showToast("Conectado à sala!");
        }).catch(err => {
            CAHUI.showToast("Erro ao conectar: " + err, "error");
        });
    });
}
