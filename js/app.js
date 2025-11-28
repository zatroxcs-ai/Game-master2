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
function renderRelationsModule(c) { c.innerHTML = '<p>Matrice des relations (TODO)</p>'; }
function renderQuestsModule(c) { c.innerHTML = '<p>Gestion des quêtes (TODO)</p>'; }
function renderPlayerQuests(c, p) { c.innerHTML = '<p>Aucune quête active.</p>'; }
