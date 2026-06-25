const CAHNetwork = (function() {
    let peer = null;
    let connections = {}; // For host: connection objects keyed by peerId
    let hostConnection = null; // For client: connection object to host
    let peerId = null;

    // We generate a short, easy to type 6-letter room ID
    function generateRoomId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function initHost() {
        return new Promise((resolve, reject) => {
            const roomId = generateRoomId();
            peer = new Peer(roomId);

            peer.on('open', (id) => {
                peerId = id;
                console.log('Host created room:', id);
                resolve(id);
            });

            peer.on('error', (err) => {
                console.error(err);
                reject(err);
            });

            peer.on('connection', (conn) => {
                conn.on('open', () => {
                    connections[conn.peer] = conn;
                    
                    conn.on('data', (data) => {
                        handleMessageFromClient(conn.peer, data);
                    });

                    conn.on('close', () => {
                        handleDisconnect(conn.peer);
                    });
                });
            });
        });
    }

    function joinRoom(hostId, playerName, password) {
        return new Promise((resolve, reject) => {
            peer = new Peer();

            peer.on('open', (id) => {
                peerId = id;
                const conn = peer.connect(hostId, {
                    metadata: { name: playerName, password: password }
                });

                conn.on('open', () => {
                    hostConnection = conn;
                    
                    conn.on('data', (data) => {
                        handleMessageFromHost(data);
                    });
                    
                    conn.on('close', () => {
                        CAHUI.showToast("Conexão com o host perdida!", "error");
                        showScreen('screen-home');
                    });

                    resolve();
                });

                conn.on('error', (err) => {
                    reject(err);
                });
            });
            
            peer.on('error', (err) => {
                reject(err);
            });
        });
    }

    // --- Message Broadcasting (Host) ---
    function broadcast(type, payload = {}) {
        if (!CAH.state.isHost) return;
        const msg = { type, payload };
        for (let id in connections) {
            connections[id].send(msg);
        }
    }

    function sendTo(targetPeerId, type, payload = {}) {
        if (!CAH.state.isHost) return;
        const msg = { type, payload };
        if (connections[targetPeerId]) {
            connections[targetPeerId].send(msg);
        }
    }

    // --- Message Sending (Client) ---
    function sendToHost(type, payload = {}) {
        if (hostConnection && hostConnection.open) {
            hostConnection.send({ type, payload });
        }
    }

    // --- Message Handlers ---
    function handleMessageFromClient(clientId, data) {
        // Called on Host
        const { type, payload } = data;
        
        switch (type) {
            case 'JOIN_LOBBY':
                // The metadata has already been handled implicitly in CAHGame when a new peer connects
                // But we can trigger specific logic if needed
                if (CAHGame.onPlayerJoin) {
                    CAHGame.onPlayerJoin(clientId, payload.name, payload.password);
                }
                break;
            case 'PLAY_CARDS':
                if (CAHGame.onPlayerSubmitCards) {
                    CAHGame.onPlayerSubmitCards(clientId, payload.cards);
                }
                break;
            case 'CZAR_PICK':
                if (CAHGame.onCzarPick) {
                    CAHGame.onCzarPick(payload.winnerId);
                }
                break;
        }
    }

    function handleMessageFromHost(data) {
        // Called on Client
        const { type, payload } = data;
        
        switch (type) {
            case 'LOBBY_UPDATE':
                CAH.state.peers = payload.players;
                CAHUI.updateLobbyPlayers(payload.players);
                document.getElementById('lobby-room-name').textContent = payload.roomName;
                document.getElementById('lobby-max-players').textContent = payload.maxPlayers;
                break;
            case 'KICK':
                hostConnection.close();
                showScreen('screen-home');
                CAHUI.showToast(payload.reason, "error");
                break;
            case 'GAME_START':
                showScreen('screen-game');
                document.getElementById('game-target-score').textContent = payload.targetScore;
                break;
            case 'GAME_STATE':
                // The main sync event
                if (CAHGame.onStateUpdate) {
                    CAHGame.onStateUpdate(payload);
                }
                break;
            case 'HAND_UPDATE':
                // Receive private cards
                if (CAHGame.onHandUpdate) {
                    CAHGame.onHandUpdate(payload.cards);
                }
                break;
            case 'ROUND_WINNER':
                if (CAHGame.onRoundWinner) {
                    CAHGame.onRoundWinner(payload.winnerName, payload.winningCards);
                }
                break;
            case 'GAME_OVER':
                if (CAHGame.onGameOver) {
                    CAHGame.onGameOver(payload.winnerName, payload.winnerScore, payload.scoreboard);
                }
                break;
        }
    }

    function handleDisconnect(clientId) {
        if (CAH.state.isHost) {
            delete connections[clientId];
            if (CAHGame.onPlayerLeave) {
                CAHGame.onPlayerLeave(clientId);
            }
        }
    }

    return {
        initHost,
        joinRoom,
        broadcast,
        sendTo,
        sendToHost,
        get peerId() { return peerId; },
        get connections() { return connections; }
    };
})();
