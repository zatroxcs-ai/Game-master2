import { initialGameData, generateId, formatTime } from './data.js';
import { joinSession, createSession, syncGameData } from './cloud.js';

// --- STATE LOCAL ---
let gameData = JSON.parse(JSON.stringify(initialGameData));
let currentUser = { role: 'guest', id: null }; // role: 'dm' ou 'player'
let currentTab = 'map'; // Onglet actif
let prevDeckSize = 0; // Pour détecter les nouvelles cartes

// --- DOM ELEMENTS ---
const screens = {
    login: document.getElementById('login-screen'),
    dm: document.getElementById('dm-screen'),
    player: document.getElementById('player-screen')
};

// --- INIT ---
window.addEventListener('DOMContentLoaded', init);

async function init() {
    // Vérifier les paramètres URL
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    const roleParam = params.get('role');
    const playerIdParam = params.get('id');

    if (sessionParam) {
        document.getElementById('session-input').value = sessionParam;
        
        // Auto-login si les params sont là
        if (roleParam === 'player' && playerIdParam) {
            currentUser = { role: 'player', id: playerIdParam };
            await connectToSession(sessionParam);
        } else if (roleParam === 'dm') {
            currentUser = { role: 'dm', id: 'dm' };
            await connectToSession(sessionParam);
        }
    }

    setupEventListeners();
}

function setupEventListeners() {
    // Login
    document.getElementById('btn-create-dm').addEventListener('click', async () => {
        const sid = document.getElementById('session-input').value;
        if(!sid) return alert('Entrez un nom de session');
        
        gameData = JSON.parse(JSON.stringify(initialGameData));
        const success = await createSession(sid, gameData);
        if(success) {
            currentUser = { role: 'dm', id: 'dm' };
            enterGame(sid);
        } else {
            alert('Session existe déjà ou erreur DB');
        }
    });

    document.getElementById('btn-join-dm').addEventListener('click', async () => {
        const sid = document.getElementById('session-input').value;
        if(!sid) return alert('Entrez un nom de session');
        currentUser = { role: 'dm', id: 'dm' };
        await connectToSession(sid);
    });

    // Navigation MJ
    document.querySelectorAll('#dm-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(e.target.dataset.tab, 'dm');
        });
    });

    // Navigation Joueur
    document.querySelectorAll('#player-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(e.target.dataset.tab, 'player');
        });
    });

    // Modale QR
    document.getElementById('btn-show-qr').addEventListener('click', showQRCode);
    document.querySelector('.close-modal').addEventListener('click', () => {
        document.getElementById('modal-qr').style.display = 'none';
    });
}

// --- LOGIC ---

async function connectToSession(sid) {
    const exists = await joinSession(sid, (newData) => {
        // Callback appelé quand les données changent depuis Supabase
        updateLocalData(newData);
    });

    if (exists) {
        enterGame(sid);
    } else {
        alert("Session introuvable");
    }
}

function enterGame(sid) {
    screens.login.classList.remove('active');
    
    if (currentUser.role === 'dm') {
        screens.dm.classList.add('active');
        document.getElementById('session-display').innerText = `(${sid})`;
    } else {
        screens.player.classList.add('active');
        // Initialiser la taille du deck pour l'anim
        const me = gameData.players.find(p => p.id === currentUser.id);
        if(me) prevDeckSize = me.deck.length;
    }
    
    render();
}

function updateLocalData(newData) {
    // Détection changement Deck pour animation (Joueur uniquement)
    if (currentUser.role === 'player') {
        const meNew = newData.players.find(p => p.id === currentUser.id);
        if (meNew && meNew.deck.length > prevDeckSize) {
            triggerChestAnimation(meNew.deck[meNew.deck.length - 1]);
        }
        if (meNew) prevDeckSize = meNew.deck.length;
    }

    gameData = newData;
    render();
}

function saveData(actionLog = null) {
    if (actionLog) {
        gameData.logs.unshift({ text: actionLog, timestamp: new Date().toISOString() });
    }
    syncGameData(gameData);
    render(); // Optimistic render
}

function switchTab(tabName, role) {
    currentTab = tabName;
    const navId = role === 'dm' ? '#dm-nav' : '#player-nav';
    document.querySelectorAll(`${navId} button`).forEach(b => b.classList.remove('active'));
    document.querySelector(`${navId} button[data-tab="${tabName}"]`).classList.add('active');
    render();
}

// --- RENDERING ENGINE ---

function render() {
    if (currentUser.role === 'dm') renderDM();
    else renderPlayer();
}

function renderDM() {
    const container = document.getElementById('dm-content');
    container.innerHTML = '';

    if (currentTab === 'map') renderMapModule(container, true);
    else if (currentTab === 'players') renderPlayersModule(container);
    else if (currentTab === 'chat') renderChatModule(container);
    else if (currentTab === 'cards') renderCardsModule(container);
    else if (currentTab === 'relations') renderRelationsModule(container);
    else if (currentTab === 'quests') renderQuestsModule(container);
    else if (currentTab === 'journal') renderJournalModule(container);
}

function renderPlayer() {
    const container = document.getElementById('player-content');
    container.innerHTML = '';
    
    const me = gameData.players.find(p => p.id === currentUser.id);
    if (!me) return container.innerHTML = '<p>Votre personnage a été supprimé ou n\'existe pas.</p>';

    document.getElementById('player-name-display').innerText = me.name;
    document.getElementById('player-resources').innerHTML = `
        <span style="color:gold">💰 ${me.gold}</span>
        <span style="color:#d0006f">💧 ${me.elixir}</span>
    `;

    if (currentTab === 'p-stats') renderPlayerStats(container, me);
    else if (currentTab === 'p-map') renderMapModule(container, false); // False = non éditable
    else if (currentTab === 'p-chat') renderChatModule(container);
    else if (currentTab === 'p-quests') renderPlayerQuests(container, me);
    else if (currentTab === 'p-journal') renderJournalModule(container);
}

// --- MODULES DE RENDU ---

// 1. MAP
function renderMapModule(container, isEditable) {
    const wrapper = document.createElement('div');
    wrapper.className = 'map-container';
    
    const img = document.createElement('img');
    img.src = gameData.config.mapUrl;
    img.className = 'map-img';
    
    if(isEditable) {
        img.addEventListener('click', (e) => {
            // Logique simple: déplacer le dernier joueur sélectionné (simplifié ici pour démo : déplace Arthur par défaut ou premier joueur)
            if(gameData.players.length > 0) {
                const rect = wrapper.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                // Exemple : on déplace le premier joueur pour la démo
                gameData.players[0].x = x;
                gameData.players[0].y = y;
                saveData();
            }
        });
    }

    wrapper.appendChild(img);

    // Rendu des pions
    [...gameData.players, ...gameData.npcs].forEach(entity => {
        const p = document.createElement('div');
        p.className = 'pawn';
        p.style.left = entity.x + '%';
        p.style.top = entity.y + '%';
        p.style.backgroundImage = `url(${entity.avatar})`;
        
        const label = document.createElement('div');
        label.className = 'pawn-label';
        label.innerText = entity.name;
        p.appendChild(label);
        
        wrapper.appendChild(p);
    });

    container.appendChild(wrapper);
}

// 2. PLAYERS (CRUD MJ)
function renderPlayersModule(container) {
    const btnAdd = document.createElement('button');
    btnAdd.className = 'btn btn-primary';
    btnAdd.innerText = '+ Créer Joueur';
    btnAdd.onclick = () => {
        const name = prompt("Nom du joueur ?");
        if(name) {
            gameData.players.push({
                id: generateId(), name, avatar: 'https://via.placeholder.com/50', 
                gold: 0, elixir: 0, deck: [], x: 50, y: 50, inventory: ''
            });
            saveData(`Création du joueur ${name}`);
        }
    };
    container.appendChild(btnAdd);

    const list = document.createElement('div');
    list.style.marginTop = '20px';
    
    gameData.players.forEach(p => {
        const row = document.createElement('div');
        row.style.background = 'white'; row.style.padding = '10px'; row.style.marginBottom = '5px';
        row.innerHTML = `<b>${p.name}</b> - Or: <input type="number" style="width:50px" value="${p.gold}" onchange="updateResource('${p.id}', 'gold', this.value)">`;
        
        // Bouton ajout carte (Demo)
        const btnCard = document.createElement('button');
        btnCard.innerText = '+ Carte';
        btnCard.onclick = () => {
            const cardId = gameData.cards[0].id; // Ajoute toujours Chevalier pour démo
            p.deck.push(cardId);
            saveData(`Carte donnée à ${p.name}`);
        };
        row.appendChild(btnCard);
        
        list.appendChild(row);
    });
    container.appendChild(list);
}

// Helper global pour l'input HTML
window.updateResource = (pid, type, val) => {
    const p = gameData.players.find(x => x.id === pid);
    if(p) {
        p[type] = parseInt(val);
        saveData();
    }
};

// 3. CHAT
function renderChatModule(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-window';
    
    const messages = document.createElement('div');
    messages.className = 'chat-messages';
    
    gameData.chat.forEach(msg => {
        const div = document.createElement('div');
        const isSelf = msg.sender === currentUser.id || (currentUser.role === 'dm' && msg.sender === 'MJ');
        div.className = `message ${isSelf ? 'self' : ''}`;
        div.innerHTML = `
            <small>${msg.sender} - ${formatTime(msg.timestamp)}</small>
            <div class="bubble">${msg.text}</div>
        `;
        messages.appendChild(div);
    });
    
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    inputArea.innerHTML = `
        <input type="text" id="chat-input" style="flex:1; padding:10px;" placeholder="Message...">
        <button class="btn btn-primary" id="chat-send">Envoyer</button>
    `;

    wrapper.appendChild(messages);
    wrapper.appendChild(inputArea);
    container.appendChild(wrapper);

    // Scroll au bas
    messages.scrollTop = messages.scrollHeight;

    // Events
    wrapper.querySelector('#chat-send').onclick = () => {
        const txt = wrapper.querySelector('#chat-input').value;
        if(txt) {
            const senderName = currentUser.role === 'dm' ? 'MJ' : gameData.players.find(p => p.id === currentUser.id)?.name || 'Inconnu';
            gameData.chat.push({
                id: generateId(), sender: senderName, text: txt, timestamp: new Date().toISOString()
            });
            saveData();
        }
    };
}

// 4. CARTES (MJ)
function renderCardsModule(container) {
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    gameData.cards.forEach(c => {
        const el = document.createElement('div');
        el.className = 'clash-card';
        el.innerHTML = `
            <div class="cost">${c.cost}</div>
            <img src="${c.img}">
            <h4>${c.name}</h4>
        `;
        grid.appendChild(el);
    });
    container.appendChild(grid);
}

// 5. JOURNAL
function renderJournalModule(container) {
    container.innerHTML = '<h3>Historique</h3>';
    gameData.logs.forEach(l => {
        const div = document.createElement('div');
        div.innerHTML = `<small>${formatTime(l.timestamp)}</small> : ${l.text}`;
        div.style.borderBottom = '1px solid #ccc';
        container.appendChild(div);
    });
}

// 6. JOUEUR STATS
function renderPlayerStats(container, p) {
    container.innerHTML = `<h2>${p.name}</h2><p>${p.inventory || 'Inventaire vide'}</p><h3>Deck</h3>`;
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    
    p.deck.forEach(cardId => {
        const c = gameData.cards.find(x => x.id === cardId);
        if(c) {
            const el = document.createElement('div');
            el.className = 'clash-card';
            el.innerHTML = `<div class="cost">${c.cost}</div><img src="${c.img}"><h4>${c.name}</h4>`;
            grid.appendChild(el);
        }
    });
    container.appendChild(grid);
}

// 7. QR CODE
function showQRCode() {
    const modal = document.getElementById('modal-qr');
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = ''; // Clear
    modal.style.display = 'flex';

    // Générer URL pour un nouveau joueur
    // Astuce: Pour simplifier, on génère un lien générique. 
    // Idéalement, le MJ crée le joueur avant et génère un lien spécifique avec ?id=XYZ
    const baseUrl = window.location.href.split('?')[0];
    const session = document.getElementById('session-input').value;
    
    // Pour la démo, on crée un lien "Rejoindre session"
    // Le joueur devra être créé par le MJ, puis le joueur cliquera sur son nom (feature à implémenter)
    // Ici, simulons un lien pour le premier joueur de la liste s'il existe
    let targetUrl = `${baseUrl}?session=${session}`;
    if(gameData.players.length > 0) {
        targetUrl += `&role=player&id=${gameData.players[0].id}`;
    }

    new QRCode(qrContainer, {
        text: targetUrl,
        width: 200,
        height: 200
    });
}

// 8. ANIMATION COFFRE
function triggerChestAnimation(newCardId) {
    const overlay = document.getElementById('chest-overlay');
    const display = document.getElementById('new-card-display');
    const card = gameData.cards.find(c => c.id === newCardId);
    
    if(!card) return;

    display.innerHTML = `
        <div class="clash-card" style="transform: scale(1.5)">
            <div class="cost">${card.cost}</div>
            <img src="${card.img}">
            <h4>${card.name}</h4>
        </div>
    `;
    
    overlay.classList.remove('hidden');
    
    // Cacher après 4 secondes
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 4000);
}

// Placeholders pour les fonctions non implémentées complètement (Relations, Quests)
// MODULE: RELATIONS (Matrice)
function renderRelationsModule(container) {
    container.innerHTML = '<h2>Matrice des Relations</h2><p class="hint">Cliquez sur une case pour changer la relation.</p>';
    
    // On combine Joueurs et PNJ pour la matrice
    const entities = [...gameData.players, ...gameData.npcs];
    if(entities.length === 0) return container.innerHTML += '<p>Aucune entité (Joueur ou PNJ) créée.</p>';

    // Création de la grille CSS dynamique
    const matrix = document.createElement('div');
    matrix.className = 'relation-matrix';
    // +1 pour l'entête des lignes
    matrix.style.gridTemplateColumns = `repeat(${entities.length + 1}, 1fr)`;

    // 1. Case vide (coin haut gauche)
    const corner = document.createElement('div');
    corner.className = 'rel-cell rel-header';
    corner.innerText = 'X';
    matrix.appendChild(corner);

    // 2. En-têtes (Colonnes)
    entities.forEach(e => {
        const header = document.createElement('div');
        header.className = 'rel-cell rel-header';
        header.innerText = e.name.substring(0, 3).toUpperCase(); // 3 premières lettres
        header.title = e.name;
        matrix.appendChild(header);
    });

    // 3. Lignes
    entities.forEach(source => {
        // En-tête Ligne
        const rowHead = document.createElement('div');
        rowHead.className = 'rel-cell rel-header';
        rowHead.innerText = source.name;
        matrix.appendChild(rowHead);

        // Cellules
        entities.forEach(target => {
            const cell = document.createElement('div');
            cell.className = 'rel-cell';
            
            // Auto-relation (diagonale grise)
            if (source.id === target.id) {
                cell.style.background = '#ccc';
            } else {
                // Chercher la relation existante
                const rel = gameData.relations.find(r => r.source === source.id && r.target === target.id);
                const status = rel ? rel.status : 'neutral';
                
                // Styling
                cell.className = `rel-cell rel-${status}`; // ex: rel-friendly
                cell.innerText = getRelIcon(status);
                cell.style.cursor = 'pointer';

                // Click event : Cycle des états
                cell.onclick = () => {
                    cycleRelation(source.id, target.id, status);
                };
            }
            matrix.appendChild(cell);
        });
    });

    container.appendChild(matrix);
    
    // Légende
    const legend = document.createElement('div');
    legend.style.marginTop = '10px';
    legend.innerHTML = `
        <span class="rel-cell rel-neutral">😐 Neutre</span>
        <span class="rel-cell rel-friendly">🙂 Ami</span>
        <span class="rel-cell rel-hostile">😡 Hostile</span>
        <span class="rel-cell" style="background:#cce5ff">🛡️ Allié</span>
    `;
    container.appendChild(legend);
}

// Helper pour les icônes
function getRelIcon(status) {
    if(status === 'friendly') return '🙂';
    if(status === 'hostile') return '😡';
    if(status === 'ally') return '🛡️';
    return '😐';
}

// Logique de changement d'état
function cycleRelation(sId, tId, currentStatus) {
    const states = ['neutral', 'friendly', 'hostile', 'ally'];
    const nextIndex = (states.indexOf(currentStatus) + 1) % states.length;
    const nextStatus = states[nextIndex];

    // Mise à jour ou Création dans gameData
    const existingIndex = gameData.relations.findIndex(r => r.source === sId && r.target === tId);
    if (existingIndex >= 0) {
        gameData.relations[existingIndex].status = nextStatus;
    } else {
        gameData.relations.push({ source: sId, target: tId, status: nextStatus });
    }
    
    saveData(); // Sauvegarde et refresh
}
// MODULE: QUÊTES (Vue MJ)
function renderQuestsModule(container) {
    // Formulaire de création
    const formPanel = document.createElement('div');
    formPanel.className = 'panel';
    formPanel.innerHTML = `<h3>Nouvelle Quête</h3>`;
    
    // Sélecteur de joueurs
    let playerOptions = gameData.players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    
    formPanel.innerHTML += `
        <div style="display:grid; gap:10px; text-align:left">
            <input type="text" id="q-title" placeholder="Titre de la quête">
            <input type="text" id="q-reward" placeholder="Récompense (ex: 500 Or)">
            <select id="q-assign">${playerOptions}</select>
            <button id="btn-add-quest" class="btn btn-secondary">Publier la Quête</button>
        </div>
    `;
    container.appendChild(formPanel);

    // Liste des quêtes actives
    const list = document.createElement('div');
    list.style.marginTop = '20px';
    list.innerHTML = '<h3>Quêtes en cours</h3>';

    gameData.quests.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = 'panel';
        item.style.marginBottom = '10px';
        item.style.textAlign = 'left';
        
        // Trouver le nom du joueur assigné
        const assignedPlayer = gameData.players.find(p => p.id === q.assignedTo);
        const pName = assignedPlayer ? assignedPlayer.name : 'Inconnu';

        item.innerHTML = `
            <div style="display:flex; justify-content:space-between">
                <strong>${q.title}</strong>
                <span style="color:var(--cr-blue)">Pour: ${pName}</span>
            </div>
            <p>💰 ${q.reward}</p>
            <div style="text-align:right">
                <button class="btn" style="background:red; font-size:0.7rem" onclick="deleteQuest(${index})">Supprimer</button>
            </div>
        `;
        list.appendChild(item);
    });

    container.appendChild(list);

    // Event Listener pour le bouton ajouter
    // (Note: on utilise setTimeout pour s'assurer que l'élément est dans le DOM)
    setTimeout(() => {
        document.getElementById('btn-add-quest').onclick = () => {
            const title = document.getElementById('q-title').value;
            const reward = document.getElementById('q-reward').value;
            const assignedTo = document.getElementById('q-assign').value;

            if(title && assignedTo) {
                gameData.quests.push({
                    id: generateId(), title, reward, assignedTo, status: 'active'
                });
                saveData(`Nouvelle quête : ${title}`);
            }
        };
    }, 0);
}

// Helper global pour supprimer (attaché à window pour le onclick HTML)
window.deleteQuest = (index) => {
    if(confirm('Supprimer cette quête ?')) {
        gameData.quests.splice(index, 1);
        saveData();
    }
};

// MODULE: QUÊTES (Vue Joueur)
function renderPlayerQuests(container, player) {
    const myQuests = gameData.quests.filter(q => q.assignedTo === player.id);
    
    container.innerHTML = '<h2>Mes Quêtes</h2>';
    
    if (myQuests.length === 0) {
        container.innerHTML += '<p style="opacity:0.6; margin-top:50px;">Aucune quête active. Reposez-vous, aventurier.</p>';
        return;
    }

    myQuests.forEach(q => {
        const card = document.createElement('div');
        card.className = 'panel';
        card.style.marginBottom = '15px';
        card.style.borderLeft = '5px solid var(--cr-gold)';
        card.innerHTML = `
            <h3>${q.title}</h3>
            <p>Récompense : <strong>${q.reward}</strong></p>
            <p style="font-size:0.8rem; color:green">En cours...</p>
        `;
        container.appendChild(card);
    });
}
