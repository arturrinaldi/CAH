const CAHUI = (function() {

    // --- Toasts ---
    function showToast(message, type = "success") {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        if (type === "error") {
            toast.style.borderLeftColor = "#ff3b3b";
        }
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    // --- Create Room Screen ---
    function renderExpansionsList(packs) {
        const container = document.getElementById('expansions-list');
        container.innerHTML = '';
        
        packs.forEach(pack => {
            const div = document.createElement('div');
            div.className = 'pack-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'pack-checkbox';
            checkbox.value = pack.index;
            checkbox.id = 'pack-' + pack.index;
            // Select base pack by default
            if (pack.index === 0) checkbox.checked = true;
            
            checkbox.addEventListener('change', updateExpansionsCount);
            
            const label = document.createElement('label');
            label.htmlFor = 'pack-' + pack.index;
            label.textContent = `${pack.name} (${pack.whiteCount} brancas, ${pack.blackCount} pretas)`;
            label.style.marginBottom = 0;
            label.style.cursor = "pointer";
            
            div.appendChild(checkbox);
            div.appendChild(label);
            container.appendChild(div);
        });
        
        updateExpansionsCount();
        
        document.getElementById('btn-select-all').addEventListener('click', () => {
            document.querySelectorAll('.pack-checkbox').forEach(cb => cb.checked = true);
            updateExpansionsCount();
        });
        
        document.getElementById('btn-select-none').addEventListener('click', () => {
            document.querySelectorAll('.pack-checkbox').forEach(cb => cb.checked = false);
            updateExpansionsCount();
        });
    }
    
    function updateExpansionsCount() {
        const count = document.querySelectorAll('.pack-checkbox:checked').length;
        document.getElementById('selected-packs-count').textContent = `(${count} selecionada${count !== 1 ? 's' : ''})`;
    }

    // --- Lobby Screen ---
    function updateLobbyPlayers(players) {
        const list = document.getElementById('lobby-players-list');
        list.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${p.name} ${p.id === CAHNetwork.peerId ? '(Você)' : ''}</span>
                ${p.isHost ? '<span class="player-status is-host">Host</span>' : '<span class="player-status">Na sala</span>'}
            `;
            list.appendChild(li);
        });
        document.getElementById('lobby-players-count').textContent = players.length;
    }

    document.getElementById('btn-copy-code').addEventListener('click', () => {
        const code = document.getElementById('lobby-room-id').textContent;
        const joinUrl = window.location.origin + window.location.pathname + '?room=' + code;
        navigator.clipboard.writeText(joinUrl).then(() => {
            showToast("Link copiado!");
        });
    });

    // --- Game Screen ---
    function renderBlackCard(card) {
        const container = document.getElementById('current-black-card');
        container.querySelector('.card-content').innerHTML = card.text.replace(/_/g, "_______");
        container.querySelector('.pick-indicator').textContent = `ESCOLHA ${card.pick}`;
    }

    function renderHand(cards) {
        const hand = document.getElementById('player-hand');
        hand.innerHTML = '';
        
        cards.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card white-card';
            cardEl.dataset.index = index;
            cardEl.innerHTML = `
                <div class="card-content">${card.text}</div>
                <div class="card-footer">
                    <span class="cah-logo">CAH</span>
                </div>
            `;
            
            cardEl.addEventListener('click', () => handleCardSelection(cardEl));
            hand.appendChild(cardEl);
        });
    }

    let selectedHandCards = [];
    let requiredPicks = 1;

    function setRequiredPicks(picks) {
        requiredPicks = picks;
        document.getElementById('hand-instructions').textContent = `Escolha ${picks} carta${picks > 1 ? 's' : ''} para jogar`;
    }

    function handleCardSelection(cardEl) {
        if (CAHGame.isCzar() || CAHGame.hasPlayedThisRound()) return; // Czar doesn't play white cards, can't play twice
        
        const index = cardEl.dataset.index;
        
        if (cardEl.classList.contains('selected')) {
            cardEl.classList.remove('selected');
            selectedHandCards = selectedHandCards.filter(c => c.index !== index);
        } else {
            if (selectedHandCards.length < requiredPicks) {
                cardEl.classList.add('selected');
                selectedHandCards.push({ index: index, el: cardEl });
            } else if (requiredPicks === 1) {
                // If only 1 needed, auto swap
                selectedHandCards[0].el.classList.remove('selected');
                cardEl.classList.add('selected');
                selectedHandCards = [{ index: index, el: cardEl }];
            }
        }
        
        const btn = document.getElementById('btn-play-cards');
        btn.disabled = selectedHandCards.length !== requiredPicks;
    }
    
    // Wire up the Play button
    document.getElementById('btn-play-cards').addEventListener('click', () => {
        if (selectedHandCards.length === requiredPicks) {
            const indices = selectedHandCards.map(c => parseInt(c.index));
            CAHGame.playCards(indices);
            
            // Disable hand
            document.querySelectorAll('#player-hand .card').forEach(c => c.classList.add('disabled'));
            document.getElementById('btn-play-cards').disabled = true;
            document.getElementById('btn-eu-nunca').style.display = 'none';
            document.getElementById('hand-instructions').textContent = "Aguardando outros jogadores...";
        }
    });

    document.getElementById('btn-eu-nunca').addEventListener('click', () => {
        if (selectedHandCards.length === 1) {
            const index = parseInt(selectedHandCards[0].index);
            CAHGame.euNuncaTrade(index);
            selectedHandCards = [];
            document.getElementById('btn-play-cards').disabled = true;
            document.getElementById('btn-eu-nunca').style.display = 'none';
        } else {
            showToast("Selecione EXATAMENTE UMA carta para trocar!", "error");
        }
    });

    // --- Czar Picking ---
    function renderPlayedCards(submissions, isCzarPhase, amICzar) {
        const container = document.getElementById('played-cards-container');
        container.innerHTML = '';
        
        submissions.forEach((sub, subIndex) => {
            const group = document.createElement('div');
            group.className = 'card-group';
            if (amICzar && isCzarPhase) {
                group.classList.add('selectable');
                group.addEventListener('click', () => {
                    document.querySelectorAll('.card-group').forEach(g => g.classList.remove('selected'));
                    group.classList.add('selected');
                    document.getElementById('btn-confirm-pick').style.display = 'block';
                    CAHUI.selectedSubmissionId = sub.playerId;
                });
            }
            
            sub.cards.forEach(card => {
                const cardEl = document.createElement('div');
                
                if (!isCzarPhase) {
                    // Render hidden/face-down cards
                    cardEl.className = 'card-wrapper';
                    cardEl.innerHTML = `
                        <div class="card-inner">
                            <div class="card-back card white-card" style="background:#ddd; border-color:#999; display:flex; align-items:center; justify-content:center;">
                                <span class="cah-logo" style="font-size: 2rem; color:#aaa;">CAH</span>
                            </div>
                            <div class="card-front card white-card">
                                <div class="card-content">${card.text}</div>
                                <div class="card-footer"><span class="cah-logo">CAH</span></div>
                            </div>
                        </div>
                    `;
                } else {
                    // Render revealed cards
                    cardEl.className = 'card white-card';
                    cardEl.innerHTML = `
                        <div class="card-content">${card.text}</div>
                        <div class="card-footer"><span class="cah-logo">CAH</span></div>
                    `;
                }
                
                group.appendChild(cardEl);
            });
            
            container.appendChild(group);
        });
    }

    function revealCards() {
        const wrappers = document.querySelectorAll('.card-wrapper');
        wrappers.forEach(w => w.classList.add('flipped'));
    }

    document.getElementById('btn-confirm-pick').addEventListener('click', () => {
        if (CAHUI.selectedSubmissionId) {
            CAHGame.czarSelects(CAHUI.selectedSubmissionId);
            document.getElementById('btn-confirm-pick').style.display = 'none';
        }
    });

    // --- Scoreboard ---
    function updateGamePlayers(players, czarId, playersWhoPlayed) {
        const list = document.getElementById('game-players-list');
        list.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            if (p.id === czarId) li.classList.add('is-czar');
            else if (playersWhoPlayed.includes(p.id)) li.classList.add('has-played');
            
            li.innerHTML = `
                <span class="player-name">${p.name} ${p.id === czarId ? '👑' : ''} ${p.id === CAHNetwork.peerId ? '(Você)' : ''}</span>
                <span class="player-score">${p.score}</span>
            `;
            list.appendChild(li);
        });
    }

    // --- Confetti ---
    function shootConfetti() {
        const colors = ['#e94560', '#fdfdfd', '#ffd700', '#00ff00', '#00ccff'];
        for (let i = 0; i < 100; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
            confetti.style.animationDelay = (Math.random() * 2) + 's';
            document.body.appendChild(confetti);
            setTimeout(() => confetti.remove(), 5000);
        }
    }

    return {
        showToast,
        renderExpansionsList,
        updateLobbyPlayers,
        renderBlackCard,
        renderHand,
        setRequiredPicks,
        renderPlayedCards,
        revealCards,
        updateGamePlayers,
        shootConfetti
    };
})();
