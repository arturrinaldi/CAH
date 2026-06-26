const CAHGame = (function() {
    
    // --- Host State ---
    let hostState = {
        players: [], // { id, name, score, hand: [], isHost }
        deckWhite: [],
        deckBlack: [],
        discardWhite: [],
        discardBlack: [],
        currentBlackCard: null,
        czarIndex: 0,
        submissions: [], // { playerId, cards: [] }
        phase: 'lobby', // lobby, play, reveal, end
        targetScore: 7
    };

    // --- Client State ---
    let clientState = {
        players: [],
        currentBlackCard: null,
        czarId: null,
        phase: 'lobby',
        myHand: [],
        submissions: [], // received from host (hidden or revealed)
        roundWinnerInfo: null
    };

    // Helper
    function isHost() { return CAH.state.isHost; }
    function myId() { return CAHNetwork.peerId; }

    // --- HOST LOGIC ---

    // Connection Events
    // Note: Peer metadata access is handled here when connection is open
    // Since peer.js doesn't natively bubble metadata easily without conn.metadata,
    // we use a workaround in our app architecture where the connection happens first.
    // For simplicity, we assume we can read CAHNetwork.connections.
    function onPlayerJoin(clientId, name, password) {
        if (!isHost()) return;
        
        if (CAH.state.room.password && CAH.state.room.password !== password) {
            CAHNetwork.sendTo(clientId, 'KICK', { reason: 'Senha incorreta!' });
            return;
        }

        if (hostState.players.length >= CAH.state.room.maxPlayers) {
            CAHNetwork.sendTo(clientId, 'KICK', { reason: 'Sala cheia!' });
            return;
        }

        if (hostState.phase !== 'lobby') {
            CAHNetwork.sendTo(clientId, 'KICK', { reason: 'O jogo já começou!' });
            return;
        }

        hostState.players.push({
            id: clientId,
            name: name,
            score: 0,
            hand: [],
            isHost: false
        });

        broadcastLobby();
    }

    function onPlayerLeave(clientId) {
        if (!isHost()) return;
        hostState.players = hostState.players.filter(p => p.id !== clientId);
        
        if (hostState.phase === 'lobby') {
            broadcastLobby();
        } else {
            // If in game, handle gracefully (skip their turn, etc)
            broadcastGameState();
        }
    }

    function broadcastLobby() {
        const payload = {
            roomName: CAH.state.room.name,
            maxPlayers: CAH.state.room.maxPlayers,
            players: hostState.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
        };
        CAHNetwork.broadcast('LOBBY_UPDATE', payload);
        
        // Also update Host UI
        CAHUI.updateLobbyPlayers(payload.players);
        document.getElementById('lobby-players-count').textContent = payload.players.length;
    }

    // Start Game
    document.getElementById('btn-start-game').addEventListener('click', async () => {
        if (!isHost()) return;
        
        if (hostState.players.length < 3) {
            CAHUI.showToast("Precisa de pelo menos 3 jogadores!", "error");
            return;
        }

        CAHUI.showToast("Carregando cartas...");
        
        try {
            const decks = await CAHCards.getDecks(CAH.state.room.selectedPacks);
            hostState.deckWhite = decks.white;
            hostState.deckBlack = decks.black;
            hostState.targetScore = CAH.state.room.maxScore;
            
            // Deal initial 10 cards
            hostState.players.forEach(p => {
                dealCardsTo(p, 10);
            });

            hostState.czarIndex = Math.floor(Math.random() * hostState.players.length);
            
            CAHNetwork.broadcast('GAME_START', { targetScore: hostState.targetScore });
            showScreen('screen-game');
            document.getElementById('game-target-score').textContent = hostState.targetScore;
            
            startNewRound();
        } catch (err) {
            CAHUI.showToast("Erro ao carregar cartas.", "error");
            console.error(err);
        }
    });

    function dealCardsTo(player, count) {
        for (let i = 0; i < count; i++) {
            if (hostState.deckWhite.length === 0) {
                // Reshuffle discard
                hostState.deckWhite = CAHCards.shuffleArray([...hostState.discardWhite]);
                hostState.discardWhite = [];
            }
            if (hostState.deckWhite.length > 0) {
                player.hand.push(hostState.deckWhite.pop());
            }
        }
    }

    function startNewRound() {
        hostState.phase = 'play';
        hostState.submissions = [];
        
        if (hostState.deckBlack.length === 0) {
            hostState.deckBlack = CAHCards.shuffleArray([...hostState.discardBlack]);
            hostState.discardBlack = [];
        }
        hostState.currentBlackCard = hostState.deckBlack.pop();
        
        // Regra: Calor de embalagem (1 carta extra se for pick 2 ou 3)
        if (CAH.state.room.rules.embalagem && hostState.currentBlackCard.pick > 1) {
            hostState.players.forEach(p => {
                if (p.id !== hostState.players[hostState.czarIndex].id) {
                    dealCardsTo(p, 1);
                }
            });
        }
        
        // Send hands
        hostState.players.forEach(p => {
            if (p.id === myId()) {
                clientState.myHand = p.hand;
            } else {
                CAHNetwork.sendTo(p.id, 'HAND_UPDATE', { cards: p.hand });
            }
        });
        
        broadcastGameState();
    }

    function broadcastGameState() {
        const publicPlayers = hostState.players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score
        }));
        
        // Hide submission text unless in reveal phase
        const publicSubmissions = hostState.submissions.map(sub => {
            if (hostState.phase === 'reveal') {
                return { playerId: sub.playerId, cards: sub.cards };
            } else {
                return { playerId: sub.playerId, cards: sub.cards.map(c => ({ text: '???' })) }; // Hidden
            }
        });

        // Shuffle submissions if reveal phase so order isn't obvious
        if (hostState.phase === 'reveal') {
            CAHCards.shuffleArray(publicSubmissions);
        }

        const payload = {
            phase: hostState.phase,
            czarId: hostState.players[hostState.czarIndex].id,
            currentBlackCard: hostState.currentBlackCard,
            players: publicPlayers,
            submissions: publicSubmissions
        };

        CAHNetwork.broadcast('GAME_STATE', payload);
        
        // Update host UI as well
        onStateUpdate(payload);
        if (isHost()) {
            onHandUpdate(clientState.myHand); // Self hand update
        }
    }

    function onPlayerSubmitCards(playerId, cardIndices) {
        if (!isHost() || hostState.phase !== 'play') return;
        
        const player = hostState.players.find(p => p.id === playerId);
        const czar = hostState.players[hostState.czarIndex];
        
        if (!player || player.id === czar.id) return; // Czar can't play
        
        // Check if already submitted
        if (hostState.submissions.find(s => s.playerId === playerId)) return;

        // Pull cards from hand
        const submittedCards = [];
        // Need to sort indices descending so splicing doesn't mess up later indices
        cardIndices.sort((a,b) => b-a).forEach(idx => {
            const card = player.hand.splice(idx, 1)[0];
            submittedCards.push(card);
        });

        hostState.submissions.push({
            playerId: playerId,
            cards: submittedCards
        });

        // Check if everyone submitted
        const expectedSubmissions = hostState.players.length - 1; // excluding Czar
        if (hostState.submissions.length >= expectedSubmissions) {
            
            // Regra: Rando Cardrissian
            if (CAH.state.room.rules.rando) {
                const randoCards = [];
                for(let i=0; i<hostState.currentBlackCard.pick; i++) {
                    if (hostState.deckWhite.length === 0) {
                        hostState.deckWhite = CAHCards.shuffleArray([...hostState.discardWhite]);
                        hostState.discardWhite = [];
                    }
                    if (hostState.deckWhite.length > 0) {
                        randoCards.push(hostState.deckWhite.pop());
                    }
                }
                if (randoCards.length > 0) {
                    hostState.submissions.push({
                        playerId: 'RANDO',
                        cards: randoCards
                    });
                }
            }
            
            hostState.phase = 'reveal';
        }

        broadcastGameState();
    }

    function onCzarPick(winnerId) {
        if (!isHost() || hostState.phase !== 'reveal') return;
        
        const winner = hostState.players.find(p => p.id === winnerId);
        const winningSub = hostState.submissions.find(s => s.playerId === winnerId);
        
        if (winnerId === 'RANDO') {
            CAHNetwork.broadcast('SHAME_MSG', { msg: "Rando Cardrissian ganhou a rodada! Todos vão para casa com vergonha eterna." });
        } else if (winner) {
            winner.score += 1;
        }

        // Move cards to discard
        hostState.discardBlack.push(hostState.currentBlackCard);
        hostState.submissions.forEach(sub => {
            hostState.discardWhite.push(...sub.cards);
        });

        const payload = {
            winnerName: winner ? winner.name : 'Alguém',
            winningCards: winningSub ? winningSub.cards : []
        };

        CAHNetwork.broadcast('ROUND_WINNER', payload);
        onRoundWinner(payload.winnerName, payload.winningCards); // Host local UI

        // Check for game over
        if (winner && winner.score >= hostState.targetScore) {
            endGame(winner);
        } else {
            // Next round
            setTimeout(() => {
                hostState.czarIndex = (hostState.czarIndex + 1) % hostState.players.length;
                hostState.players.forEach(p => dealCardsTo(p, hostState.currentBlackCard.pick));
                startNewRound();
            }, 5000);
        }
    }

    function endGame(winner) {
        hostState.phase = 'end';
        const scoreboard = hostState.players.map(p => ({name: p.name, score: p.score})).sort((a,b) => b.score - a.score);
        
        const payload = {
            winnerName: winner.name,
            winnerScore: winner.score,
            scoreboard: scoreboard
        };
        
        CAHNetwork.broadcast('GAME_OVER', payload);
        onGameOver(payload.winnerName, payload.winnerScore, payload.scoreboard);
    }

    // The Host will explicitly push itself into players array on create room
    // and trigger its own LOBBY_UPDATE locally via addHostToGame.
    // For joining clients, they need to wait for LOBBY_UPDATE from network.js.
    
    function addHostToGame() {
        if(isHost()) {
            hostState.players.push({
                id: CAHNetwork.peerId,
                name: CAH.state.playerName,
                score: 0,
                hand: [],
                isHost: true
            });
            broadcastLobby();
        }
    }
    
    // Override standard PeerJS connection metadata hook
    const originalInitHost = CAHNetwork.initHost;
    // We already handled logic in app.js for host creation.
    // Let's hook into the connection.
    setInterval(() => {
        // Poll for new connections metadata since PeerJS doesn't expose it directly in 'connection' event cleanly without data payload
        // Actually, we pass it via connect({metadata}). PeerJS exposes conn.metadata
        if(isHost()) {
            for(let id in CAHNetwork.connections) {
                let conn = CAHNetwork.connections[id];
                if(conn.open && !hostState.players.find(p => p.id === id)) {
                    // New connection detected
                    let meta = conn.metadata || {};
                    onPlayerJoin(id, meta.name || 'Anônimo', meta.password || '');
                }
            }
        }
    }, 1000);

    function onStateUpdate(state) {
        clientState.phase = state.phase;
        clientState.czarId = state.czarId;
        clientState.currentBlackCard = state.currentBlackCard;
        clientState.players = state.players;
        clientState.submissions = state.submissions;

        const amICzar = clientState.czarId === myId();
        const playersWhoPlayed = clientState.submissions.map(s => s.playerId);

        CAHUI.updateGamePlayers(clientState.players, clientState.czarId, playersWhoPlayed);
        CAHUI.renderBlackCard(clientState.currentBlackCard);
        CAHUI.setRequiredPicks(clientState.currentBlackCard.pick);
        
        CAHUI.renderPlayedCards(clientState.submissions, clientState.phase === 'reveal', amICzar);

        // Update status text
        const statusEl = document.getElementById('game-status-text');
        const czarName = clientState.players.find(p => p.id === clientState.czarId)?.name || 'Czar';
        
        if (clientState.phase === 'play') {
            if (amICzar) {
                statusEl.textContent = "Você é o Czar! Aguarde os outros jogadores...";
                document.getElementById('hand-instructions').textContent = "Você é o Czar. Apenas observe as cartas na mesa.";
                document.getElementById('btn-eu-nunca').style.display = 'none';
            } else {
                if (playersWhoPlayed.includes(myId())) {
                    statusEl.textContent = `Aguardando outros jogadores...`;
                    document.getElementById('hand-instructions').textContent = "Cartas jogadas!";
                    document.getElementById('btn-eu-nunca').style.display = 'none';
                } else {
                    statusEl.textContent = `Sua vez! Jogue ${clientState.currentBlackCard.pick} carta(s).`;
                    // Regra: Eu Nunca
                    if (CAH.state.room && CAH.state.room.rules && CAH.state.room.rules.euNunca) {
                        document.getElementById('btn-eu-nunca').style.display = 'block';
                    }
                }
            }
        } else if (clientState.phase === 'reveal') {
            if (amICzar) {
                statusEl.textContent = "Leia as cartas e escolha a melhor!";
                CAHUI.revealCards(); // Trigger flip animation
            } else {
                statusEl.textContent = `O Czar (${czarName}) está escolhendo a melhor resposta...`;
                CAHUI.revealCards(); // Trigger flip animation
            }
        }
    }

    function onHandUpdate(cards) {
        clientState.myHand = cards;
        CAHUI.renderHand(cards);
        
        // Reset hand state
        document.getElementById('btn-play-cards').disabled = true;
    }

    function playCards(cardIndices) {
        if (isHost()) {
            onPlayerSubmitCards(myId(), cardIndices);
        } else {
            CAHNetwork.sendToHost('PLAY_CARDS', { cards: cardIndices });
        }
    }
    
    function euNuncaTrade(cardIndex) {
        if (isHost()) {
            onEuNuncaTrade(myId(), cardIndex);
        } else {
            CAHNetwork.sendToHost('EU_NUNCA', { cardIndex });
        }
    }
    
    function onEuNuncaTrade(playerId, cardIndex) {
        if (!isHost() || hostState.phase !== 'play') return;
        const player = hostState.players.find(p => p.id === playerId);
        if (!player || player.id === hostState.players[hostState.czarIndex].id) return;
        
        // Remove carta
        const discarded = player.hand.splice(cardIndex, 1)[0];
        hostState.discardWhite.push(discarded);
        
        // Dá nova
        dealCardsTo(player, 1);
        
        // Atualiza a mão do cara
        if (playerId === myId()) {
            onHandUpdate(player.hand);
        } else {
            CAHNetwork.sendTo(playerId, 'HAND_UPDATE', { cards: player.hand });
        }
        
        // Anuncia vergonha
        CAHNetwork.broadcast('SHAME_MSG', { msg: `${player.name} não entendeu uma carta e confessou sua ignorância usando o "Eu Nunca"!` });
    }

    function czarSelects(winnerId) {
        if (isHost()) {
            onCzarPick(winnerId);
        } else {
            CAHNetwork.sendToHost('CZAR_PICK', { winnerId });
        }
    }

    function onRoundWinner(winnerName, winningCards) {
        const msg = `${winnerName} venceu a rodada com: "${winningCards.map(c => c.text).join(' | ')}"`;
        CAHUI.showToast(msg, "success");
        document.getElementById('game-status-text').textContent = msg;
    }

    function onGameOver(winnerName, winnerScore, scoreboard) {
        showScreen('screen-results');
        document.getElementById('winner-name').textContent = winnerName;
        document.getElementById('winner-score').textContent = winnerScore;
        
        const list = document.getElementById('final-scoreboard');
        list.innerHTML = '';
        scoreboard.forEach((p, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>#${index+1} ${p.name}</span><span>${p.score} pts</span>`;
            list.appendChild(li);
        });
        
        CAHUI.shootConfetti();
    }

    document.getElementById('btn-back-to-lobby').addEventListener('click', () => {
        if (isHost()) {
            hostState.phase = 'lobby';
            hostState.players.forEach(p => { p.score = 0; p.hand = []; });
            broadcastLobby();
            showScreen('screen-lobby');
            document.getElementById('btn-start-game').style.display = 'block';
        }
    });

    document.getElementById('btn-quit-game').addEventListener('click', () => {
        location.reload(); // Hard reset
    });

    return {
        onPlayerJoin,
        onPlayerLeave,
        onPlayerSubmitCards,
        onCzarPick,
        onStateUpdate,
        onHandUpdate,
        onRoundWinner,
        onGameOver,
        addHostToGame,
        playCards,
        czarSelects,
        isCzar: () => clientState.czarId === myId(),
        hasPlayedThisRound: () => clientState.submissions.some(s => s.playerId === myId())
    };
})();
