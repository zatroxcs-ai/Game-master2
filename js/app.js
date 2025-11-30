import { initialGameData, generateId, formatTime } from './data.js';
// L'import crucial pour la sauvegarde
import { joinSession, createSession, syncGameData } from './cloud.js';

// --- STATE LOCAL ---
let gameData = JSON.parse(JSON.stringify(initialGameData));
let currentUser = { role: 'guest', id: null };
let currentTab = 'map';
let prevDeckSize = 0;
let selectedEntityId = null;
let selectedRelCharId = null;
let currentFormCallback = null;
let isFirstLoad = true; // Pour éviter l'anim au démarrage

// --- DOM ELEMENTS ---
const screens = {
    login: document.getElementById('login-screen'),
    dm: document.getElementById('dm-screen'),
    player: document.getElementById('player-screen')
};

// --- HELPER UNIVERSEL ---
function findEntityById(id) {
    return gameData.players.find(p => p.id === id) || gameData.npcs.find(n => n.id === id);
}

// --- INIT ---
window.addEventListener('DOMContentLoaded', init);

async function init() {
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    const roleParam = params.get('role');
    const playerIdParam = params.get('id');

    if (sessionParam) {
        document.getElementById('session-input').value = sessionParam;
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
        // Init des ressources par défaut
        if (!gameData.resourceTypes) {
            gameData.resourceTypes = [
                { id: 'gold', name: 'Or', icon: '💰', color: '#ffbd2e' },
                { id: 'elixir', name: 'Élixir', icon: '💧', color: '#d6308e' }
            ];
        }

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

    // Navigation (Fix Mobile)
    document.querySelectorAll('#dm-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab, 'dm'));
    });
    document.querySelectorAll('#player-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(e.currentTarget.dataset.tab, 'player');
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
        const me = gameData.players.find(p => p.id === currentUser.id);
        if(me) prevDeckSize = me.deck.length;
    }
    render();
}

function updateLocalData(newData) {
    if (isFirstLoad) {
        gameData = newData;
        if (currentUser.role === 'player') {
            const me = newData.players.find(p => p.id === currentUser.id);
            if (me) prevDeckSize = me.deck.length;
        }
        isFirstLoad = false;
        render();
        return;
    }

    if (currentUser.role === 'player') {
        const meNew = newData.players.find(p => p.id === currentUser.id);
        if (typeof prevDeckSize === 'undefined') prevDeckSize = 0;

        if (meNew && meNew.deck.length > prevDeckSize) {
            const newCardId = meNew.deck[meNew.deck.length - 1];
            if(newCardId) triggerChestAnimation(newCardId);
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
    render();
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
    // Init types ressources si absent
    if (!gameData.resourceTypes) {
        gameData.resourceTypes = [
            { id: 'gold', name: 'Or', icon: '💰', color: '#ffbd2e' },
            { id: 'elixir', name: 'Élixir', icon: '💧', color: '#d6308e' }
        ];
        syncGameData(gameData);
    }

    const header = document.querySelector('#dm-screen header');
    header.querySelector('#dm-nav').innerHTML = `
        <button data-tab="map" class="${currentTab === 'map' ? 'active' : ''}">Carte</button>
        <button data-tab="players" class="${currentTab === 'players' ? 'active' : ''}">Joueurs</button>
        <button data-tab="chat" class="${currentTab === 'chat' ? 'active' : ''}">Chat</button>
        <button data-tab="cards" class="${currentTab === 'cards' ? 'active' : ''}">Cartes</button>
        <button data-tab="relations" class="${currentTab === 'relations' ? 'active' : ''}">Relations</button>
        <button data-tab="quests" class="${currentTab === 'quests' ? 'active' : ''}">Quêtes</button>
        <button data-tab="journal" class="${currentTab === 'journal' ? 'active' : ''}">Journal</button>
        <button data-tab="system" class="${currentTab === 'system' ? 'active' : ''}" style="color:#ff5e5e">💾 Système</button>
    `;
    header.querySelectorAll('#dm-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab, 'dm'));
    });

    const container = document.getElementById('dm-content');
    container.innerHTML = '';

    if (currentTab === 'map') renderMapModule(container, true);
    else if (currentTab === 'players') renderPlayersModule(container);
    else if (currentTab === 'chat') renderChatModule(container);
    else if (currentTab === 'cards') renderCardsModule(container);
    else if (currentTab === 'relations') renderRelationsModule(container);
    else if (currentTab === 'quests') renderQuestsModule(container);
    else if (currentTab === 'journal') renderJournalModule(container);
    else if (currentTab === 'system') renderSystemModule(container);
}

function renderPlayer() {
    const container = document.getElementById('player-content');
    container.innerHTML = '';
    
    const me = gameData.players.find(p => p.id === currentUser.id);
    if (!me) return container.innerHTML = '<div style="text-align:center;color:white;margin-top:50px">☠️ Personnage supprimé</div>';

    if (currentTab === 'p-stats') renderPlayerStats(container, me);
    else if (currentTab === 'p-map') renderMapModule(container, false);
    else if (currentTab === 'p-chat') renderChatModule(container);
    else if (currentTab === 'p-quests') renderPlayerQuests(container, me);
    else if (currentTab === 'p-journal') renderJournalModule(container);
}

// ================= MODULES =================

// 1. MAP (AVEC PRÉSENCE)
function renderMapModule(container, isEditable) {
    if (!gameData.maps) {
        gameData.maps = [{ id: 'default', name: 'Carte Principale', url: './assets/map.png', desc: 'Défaut' }];
        gameData.activeMapId = 'default';
        syncGameData(gameData);
    }

    let currentMap = gameData.maps.find(m => m.id === gameData.activeMapId) || gameData.maps[0];
    if(!currentMap || !currentMap.url) currentMap = { url: './assets/map.png', name: 'Défaut', id: 'default' };

    const wrapper = document.createElement('div');
    wrapper.className = 'map-container';
    wrapper.style.backgroundColor = '#222';
    
    const img = document.createElement('img');
    img.src = currentMap.url;
    img.className = 'map-img';
    img.onerror = function() { this.style.display = 'none'; };
    wrapper.appendChild(img);

    // ROSTER PANEL (MJ)
    if (isEditable) {
        const rosterPanel = document.createElement('div');
        rosterPanel.style.cssText = 'position:absolute; top:10px; right:10px; width:160px; background:rgba(0,0,0,0.8); padding:10px; border-radius:8px; color:white; z-index:200; max-height:80%; overflow-y:auto;';
        rosterPanel.innerHTML = '<h5 style="margin:0 0 10px 0; border-bottom:1px solid #555; padding-bottom:5px;">Présence Ici</h5>';

        [...gameData.players, ...gameData.npcs].forEach(entity => {
            if (!entity.mapId) entity.mapId = 'default';
            const isOnMap = entity.mapId === currentMap.id;
            
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; margin-bottom:5px; cursor:pointer; font-size:0.8rem;';
            row.innerHTML = `
                <div style="width:10px; height:10px; border-radius:50%; background:${isOnMap ? '#4caf50' : '#555'}; margin-right:8px; border:1px solid white;"></div>
                <img src="${entity.avatar}" style="width:20px; height:20px; border-radius:50%; margin-right:5px; opacity:${isOnMap ? 1 : 0.5}">
                <span style="opacity:${isOnMap ? 1 : 0.5}">${entity.name}</span>
            `;
            row.onclick = (e) => {
                e.stopPropagation();
                if (!isOnMap) {
                    if(confirm(`Déplacer ${entity.name} ici ?`)) {
                        entity.mapId = currentMap.id;
                        entity.x = 50; entity.y = 50;
                        syncGameData(gameData); render();
                    }
                } else {
                    selectedEntityId = entity.id; render();
                }
            };
            rosterPanel.appendChild(row);
        });
        wrapper.appendChild(rosterPanel);

        const btnManage = document.createElement('button');
        btnManage.className = 'btn btn-secondary';
        btnManage.innerHTML = '🗺️ Atlas';
        btnManage.style.cssText = 'position:absolute; top:10px; left:10px; z-index:50;';
        btnManage.onclick = () => openMapManager();
        wrapper.appendChild(btnManage);
    }

    if(isEditable) {
        wrapper.addEventListener('click', (e) => {
            if(e.target.tagName === 'BUTTON') return;
            if (selectedEntityId) {
                let entity = findEntityById(selectedEntityId);
                if (entity && entity.mapId === currentMap.id) {
                    const rect = wrapper.getBoundingClientRect();
                    entity.x = ((e.clientX - rect.left) / rect.width) * 100;
                    entity.y = ((e.clientY - rect.top) / rect.height) * 100;
                    syncGameData(gameData); render(); 
                } else if (entity) {
                    alert(`${entity.name} n'est pas sur cette carte !`);
                }
            }
        });
    }

    // PIONS
    [...gameData.players, ...gameData.npcs].forEach(entity => {
        if (entity.mapId !== currentMap.id) return;
        const p = document.createElement('div');
        p.className = 'pawn';
        p.style.left = entity.x + '%';
        p.style.top = entity.y + '%';
        p.style.backgroundImage = `url(${entity.avatar})`;
        if (selectedEntityId === entity.id) {
            p.style.borderColor = 'var(--cr-gold)';
            p.style.boxShadow = '0 0 15px var(--cr-gold)';
            p.style.zIndex = 100;
        }
        if (isEditable) {
            p.onclick = (e) => {
                e.stopPropagation();
                selectedEntityId = entity.id;
                render(); 
            };
        }
        const label = document.createElement('div');
        label.className = 'pawn-label';
        label.innerText = entity.name;
        p.appendChild(label);
        wrapper.appendChild(p);
    });
    container.appendChild(wrapper);
}

// 2. PLAYERS (RESSOURCES DYNAMIQUES)
function renderPlayersModule(container) {
    container.innerHTML = `
        <div style="margin-bottom:15px; display:flex; gap:10px;">
            <button id="btn-add-p" class="btn btn-primary" style="flex:1">+ Nouveau Personnage</button>
            <button id="btn-manage-res" class="btn btn-secondary">💎 Gérer Ressources</button>
        </div>
    `;
    document.getElementById('btn-manage-res').onclick = () => openResourceManager();
    document.getElementById('btn-add-p').onclick = () => {
        openFormModal('Créer Personnage', [
            { name: 'name', label: 'Nom', value: '' },
            { name: 'type', label: 'Type', type: 'select', options: [{value:'player', label:'Joueur'}, {value:'npc', label:'PNJ'}], value: 'player' },
            { name: 'avatar', label: 'URL Avatar', value: 'https://cdn-icons-png.flaticon.com/512/147/147144.png' },
            { name: 'desc', label: 'Description', type: 'textarea', value: '' }
        ], (data) => {
            const newChar = { id: generateId(), name: data.name, avatar: data.avatar, desc: data.desc, deck: [], inventory: '', x: 50, y: 50 };
            if(data.type === 'player') gameData.players.push(newChar); else gameData.npcs.push(newChar);
            saveData(`Création de ${data.name}`);
        });
    };

    const list = document.createElement('div');
    const renderRow = (char, type) => {
        const row = document.createElement('div');
        row.className = 'panel';
        row.style.marginBottom = '10px';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '10px';
        row.style.textAlign = 'left';

        let resourcesHtml = '';
        if (type === 'player' && gameData.resourceTypes) {
            resourcesHtml = '<div style="margin-top:5px; display:flex; flex-wrap:wrap; gap:5px;">';
            gameData.resourceTypes.forEach(res => {
                const val = char[res.id] !== undefined ? char[res.id] : 0;
                resourcesHtml += `
                    <div style="display:flex; align-items:center; background:#eee; padding:2px 5px; border-radius:4px;">
                        <span style="font-size:0.8rem; margin-right:2px;" title="${res.name}">${res.icon}</span> 
                        <input type="number" class="res-input" data-id="${char.id}" data-type="${res.id}" style="width:50px; padding:2px; border:1px solid #ccc;" value="${val}">
                    </div>`;
            });
            resourcesHtml += '</div>';
        }

        row.innerHTML = `
            <img src="${char.avatar}" onerror="this.onerror=null;this.src='https://cdn-icons-png.flaticon.com/512/847/847969.png'" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid #333">
            <div style="flex:1">
                <strong>${char.name}</strong> <small>(${type === 'npc' ? 'PNJ' : 'Joueur'})</small>
                ${resourcesHtml}
                <small style="opacity:0.7; display:block; font-size:0.8rem">${char.desc || ''}</small>
            </div>
            <div style="display:flex; flex-direction:column; gap:5px">
                <div style="display:flex; gap:5px">
                    <button class="btn" style="padding:5px 10px; font-size:0.8rem; background:#7c4dff; margin:0" id="deck-${char.id}">🎴</button>
                    <button class="btn" style="padding:5px 10px; font-size:0.8rem; background:orange; margin:0" id="edit-${char.id}">✏️</button>
                </div>
                <button class="btn" style="padding:5px 10px; font-size:0.8rem; background:red; margin:0" id="del-${char.id}">🗑️</button>
            </div>
        `;

        row.querySelectorAll('.res-input').forEach(input => {
            input.onchange = (e) => {
                const val = parseInt(e.target.value) || 0;
                const fieldType = e.target.dataset.type;
                const pid = e.target.dataset.id;
                const targetP = findEntityById(pid);
                if(targetP) { targetP[fieldType] = val; syncGameData(gameData); }
            };
        });

        row.querySelector(`#deck-${char.id}`).onclick = () => openDeckManager(char);
        row.querySelector(`#edit-${char.id}`).onclick = () => {
            openFormModal(`Éditer ${char.name}`, [
                { name: 'name', label: 'Nom', value: char.name },
                { name: 'avatar', label: 'URL Avatar', value: char.avatar },
                { name: 'desc', label: 'Description', type: 'textarea', value: char.desc || '' },
                { name: 'inventory', label: 'Inventaire', type: 'textarea', value: char.inventory || '' }
            ], (data) => {
                char.name = data.name; char.avatar = data.avatar;
                char.desc = data.desc; char.inventory = data.inventory;
                saveData(`Modification de ${char.name}`);
            });
        };
        row.querySelector(`#del-${char.id}`).onclick = () => {
            if(confirm(`Supprimer ${char.name} ?`)) {
                if(type === 'player') gameData.players = gameData.players.filter(p => p.id !== char.id);
                else gameData.npcs = gameData.npcs.filter(p => p.id !== char.id);
                saveData(`Suppression de ${char.name}`);
            }
        };
        list.appendChild(row);
    };
    gameData.players.forEach(p => renderRow(p, 'player'));
    if(gameData.npcs.length > 0) {
        const sep = document.createElement('h3'); sep.innerText = 'PNJ'; sep.style.marginTop = '20px';
        list.appendChild(sep); gameData.npcs.forEach(n => renderRow(n, 'npc'));
    }
    container.appendChild(list);
}

// 3. CHAT
function renderChatModule(container) {
    const wrapper = document.createElement('div'); wrapper.className = 'chat-window';
    const messages = document.createElement('div'); messages.className = 'chat-messages';
    
    gameData.chat.forEach(msg => {
        const targetId = msg.target || 'global';
        const myId = currentUser.role === 'dm' ? 'dm' : currentUser.id;
        const senderId = msg.senderId || 'inconnu';
        if (!((targetId === 'global') || (senderId === myId) || (targetId === myId))) return;

        const isSelf = senderId === myId;
        const isWhisper = targetId !== 'global';
        const isDice = msg.text.startsWith('🎲');
        const div = document.createElement('div');
        div.className = `message ${isSelf ? 'self' : ''}`;
        
        let bubbleStyle = ''; let prefix = '';
        if (isWhisper) {
            bubbleStyle = 'background:#e0c3fc; color:#4a148c; border:1px solid #7c4dff;';
            let targetName = 'MJ';
            if(targetId !== 'dm') { const t = gameData.players.find(p => p.id === targetId); if(t) targetName = t.name; }
            prefix = isSelf ? `<small style="display:block; font-weight:bold; color:#4a148c">🔒 À ${targetName}</small>` : `<small style="display:block; font-weight:bold; color:#4a148c">🔒 De ${msg.sender}</small>`;
        }
        if (isDice) bubbleStyle = 'background:var(--cr-gold); color:black; font-weight:bold; border:2px solid black';

        div.innerHTML = `<small>${isSelf ? 'Moi' : msg.sender} - ${formatTime(msg.timestamp)}</small><div class="bubble" style="${bubbleStyle}">${prefix}${msg.text}</div>`;
        messages.appendChild(div);
    });
    
    const controls = document.createElement('div');
    controls.style.cssText = 'padding:10px; background:#ddd; border-top:2px solid white;';
    const diceBar = document.createElement('div');
    diceBar.style.cssText = 'margin-bottom:5px; display:flex; gap:5px;';
    ['d6', 'd20', 'd100'].forEach(type => {
        const btn = document.createElement('button');
        btn.className = 'btn'; btn.style.cssText = 'padding:2px 8px; font-size:0.7rem; background:white; color:#333; border-bottom:2px solid #999;';
        btn.innerText = type;
        btn.onclick = () => {
            const max = parseInt(type.substring(1));
            sendMessage(`🎲 ${type} : ${Math.floor(Math.random() * max) + 1}`, true);
        };
        diceBar.appendChild(btn);
    });

    const inputRow = document.createElement('div'); inputRow.style.cssText = 'display:flex; gap:5px;';
    const select = document.createElement('select'); select.id = 'chat-target'; select.style.cssText = 'max-width:100px; border-radius:5px;';
    select.innerHTML = '<option value="global">📢 Global</option>';
    if(currentUser.role !== 'dm') select.innerHTML += '<option value="dm">👑 MJ</option>';
    gameData.players.forEach(p => { if(p.id !== currentUser.id) select.innerHTML += `<option value="${p.id}">${p.name}</option>`; });

    const input = document.createElement('input'); input.type = 'text'; input.id = 'chat-input';
    input.style.cssText = 'flex:1; padding:10px; border-radius:5px; border:1px solid #ccc;'; input.placeholder = 'Message...';
    input.onkeydown = (e) => { if(e.key === 'Enter') confirmSend(); };
    const btnSend = document.createElement('button'); btnSend.className = 'btn btn-primary'; btnSend.innerText = 'Envoyer';
    btnSend.onclick = () => confirmSend();

    inputRow.appendChild(select); inputRow.appendChild(input); inputRow.appendChild(btnSend);
    controls.appendChild(diceBar); controls.appendChild(inputRow);
    wrapper.appendChild(messages); wrapper.appendChild(controls); container.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;

    function confirmSend() { const txt = input.value; if(txt) { sendMessage(txt, false); input.value = ''; } }
    function sendMessage(text, isDice) {
        const target = select.value;
        const myId = currentUser.role === 'dm' ? 'dm' : currentUser.id;
        const senderName = currentUser.role === 'dm' ? 'MJ' : gameData.players.find(p => p.id === currentUser.id)?.name || 'Inconnu';
        gameData.chat.push({ id: generateId(), sender: senderName, senderId: myId, text: text, target: target, timestamp: new Date().toISOString() });
        saveData();
    }
}

// 4. CARTES
function renderCardsModule(container) {
    container.innerHTML = '<div style="margin-bottom:15px"><button id="btn-create-card" class="btn btn-secondary">+ Créer une Carte</button></div>';
    document.getElementById('btn-create-card').onclick = () => {
        openFormModal('Nouvelle Carte', [
            { name: 'name', label: 'Nom', value: '' }, { name: 'cost', label: 'Coût', type: 'number', value: '3' },
            { name: 'img', label: 'Image URL', value: 'https://statsroyale.com/images/cards/full/mirror.png' }, { name: 'desc', label: 'Effet', type: 'textarea', value: '' }
        ], (data) => {
            gameData.cards.push({ id: generateId(), name: data.name, cost: parseInt(data.cost), img: data.img, desc: data.desc });
            saveData(`Carte créée : ${data.name}`);
        });
    };
    const grid = document.createElement('div'); grid.className = 'card-grid';
    gameData.cards.forEach(c => {
        const el = document.createElement('div'); el.className = 'clash-card'; el.style.cursor = 'pointer';
        el.innerHTML = `<div class="cost">${c.cost}</div><img src="${c.img}" onerror="this.onerror=null;this.src='https://placehold.co/100x120?text=?'"><h4>${c.name}</h4>`;
        el.onclick = () => {
            openFormModal(`Modifier ${c.name}`, [
                { name: 'name', label: 'Nom', value: c.name }, { name: 'cost', label: 'Coût', type: 'number', value: c.cost },
                { name: 'img', label: 'Image URL', value: c.img }, { name: 'desc', label: 'Description', type: 'textarea', value: c.desc || '' }
            ], (data) => {
                c.name = data.name; c.cost = parseInt(data.cost); c.img = data.img; c.desc = data.desc;
                saveData(`Carte modifiée : ${c.name}`);
            });
        };
        grid.appendChild(el);
    });
    container.appendChild(grid);
}

// 5. RELATIONS V2
function renderRelationsModule(container) {
    if (!gameData.relations) gameData.relations = [];
    const entities = [...gameData.players, ...gameData.npcs];
    if(entities.length < 2) return container.innerHTML = '<div class="panel">Il faut au moins 2 personnages.</div>';
    
    if (!selectedRelCharId || !entities.find(e => e.id === selectedRelCharId)) selectedRelCharId = entities[0].id;
    const selectedEntity = entities.find(e => e.id === selectedRelCharId);

    container.innerHTML = `
        <h2 style="color:var(--cr-blue-dark); text-align:center; margin-bottom:5px;">Réseau d'Influence</h2>
        <div id="rel-name-display" style="height:30px; line-height:30px; text-align:center; font-weight:900; color:var(--cr-blue); font-size:1.2rem; text-transform:uppercase; margin-bottom:5px;">${selectedEntity ? selectedEntity.name : ''}</div>
    `;

    const selector = document.createElement('div'); selector.className = 'rel-selector';
    entities.forEach(e => {
        const img = document.createElement('img'); img.src = e.avatar; img.className = `rel-avatar-select ${e.id === selectedRelCharId ? 'active' : ''}`;
        img.onerror = function() { this.src='https://placehold.co/60'; };
        img.onmouseenter = () => { document.getElementById('rel-name-display').innerText = e.name; };
        img.onmouseleave = () => { document.getElementById('rel-name-display').innerText = entities.find(x => x.id === selectedRelCharId)?.name || ''; };
        img.onclick = () => { selectedRelCharId = e.id; renderRelationsModule(container); };
        selector.appendChild(img);
    });
    container.appendChild(selector);

    const board = document.createElement('div'); board.className = 'rel-board';
    const cols = { friendly: { title: '💚 Alliés / Amis', color: '#28a745', list: [] }, neutral:  { title: '😐 Neutres / Inconnus', color: '#6c757d', list: [] }, hostile:  { title: '❤️ Hostiles / Ennemis', color: '#dc3545', list: [] } };

    entities.forEach(target => {
        if (target.id === selectedRelCharId) return; 
        const rel = gameData.relations.find(r => r.source === selectedRelCharId && r.target === target.id);
        let status = rel ? rel.status : 'neutral';
        let displayCat = status === 'ally' ? 'friendly' : status;
        cols[displayCat].list.push({ ...target, realStatus: status });
    });

    Object.keys(cols).forEach(key => {
        const colData = cols[key];
        const colDiv = document.createElement('div'); colDiv.className = 'rel-column'; colDiv.style.borderTop = `4px solid ${colData.color}`;
        colDiv.innerHTML = `<h3 style="color:${colData.color}; margin-top:5px;">${colData.title}</h3>`;
        if (colData.list.length === 0) colDiv.innerHTML += '<p style="opacity:0.5; font-size:0.8rem; text-align:center">- Vide -</p>';
        else {
            colData.list.forEach(char => {
                const card = document.createElement('div'); card.className = 'rel-card'; card.style.borderLeftColor = colData.color;
                let icon = '😐'; if(char.realStatus === 'friendly') icon = '🙂'; if(char.realStatus === 'ally') icon = '🛡️'; if(char.realStatus === 'hostile') icon = '😡';
                card.innerHTML = `<img src="${char.avatar}" onerror="this.src='https://placehold.co/40'"><div style="flex:1; color:#333;"><strong>${char.name}</strong></div><div style="font-size:1.2rem">${icon}</div>`;
                if(currentUser.role === 'dm') card.onclick = () => {
                    const states = ['neutral', 'friendly', 'hostile', 'ally'];
                    const nextStatus = states[(states.indexOf(char.realStatus) + 1) % states.length];
                    const existingIndex = gameData.relations.findIndex(r => r.source === selectedRelCharId && r.target === char.id);
                    if (existingIndex >= 0) gameData.relations[existingIndex].status = nextStatus;
                    else gameData.relations.push({ source: selectedRelCharId, target: char.id, status: nextStatus });
                    saveData();
                };
                colDiv.appendChild(card);
            });
        }
        board.appendChild(colDiv);
    });
    container.appendChild(board);
}

// 6. QUÊTES
function renderQuestsModule(container) {
    container.innerHTML = '<div style="margin-bottom:20px; text-align:center"><button id="btn-new-quest" class="btn btn-secondary" style="width:100%">+ Nouvelle Quête</button></div>';
    document.getElementById('btn-new-quest').onclick = () => {
        let npcOptions = [{value: 'board', label: '📢 Panneau (Aucun)'}];
        gameData.npcs.forEach(n => { npcOptions.push({ value: n.id, label: `👤 ${n.name}` }); });
        let playerOptions = []; gameData.players.forEach(p => { playerOptions.push({ value: p.id, label: `🎮 ${p.name}` }); });
        if(playerOptions.length === 0) return alert("Il faut créer des joueurs !");

        openFormModal('Nouvelle Quête', [
            { name: 'title', label: 'Titre', value: '' }, { name: 'desc', label: 'Description', type: 'textarea', value: '' },
            { name: 'reward', label: 'Récompense', value: '100 Or' }, { name: 'giver', label: 'Commanditaire', type: 'select', options: npcOptions, value: 'board' },
            { name: 'assigned', label: 'Pour', type: 'select', options: playerOptions, value: playerOptions[0].value }
        ], (data) => {
            gameData.quests.push({ id: generateId(), title: data.title, desc: data.desc, reward: data.reward, giverId: data.giver, assignedTo: data.assigned, status: 'active' });
            saveData(`Nouvelle quête : ${data.title}`);
        });
    };

    const list = document.createElement('div');
    if (gameData.quests.length === 0) list.innerHTML = '<p style="opacity:0.5; text-align:center">Aucune quête active.</p>';
    else {
        gameData.quests.forEach((q, index) => {
            const assignedP = gameData.players.find(p => p.id === q.assignedTo);
            let giverImg = 'https://cdn-icons-png.flaticon.com/512/3209/3209995.png';
            if (q.giverId !== 'board') { const npc = gameData.npcs.find(n => n.id === q.giverId); if (npc) giverImg = npc.avatar; }
            const card = document.createElement('div'); card.className = 'quest-card';
            card.innerHTML = `<img src="${giverImg}" class="quest-giver"><div class="quest-info"><div style="float:right"><button class="btn" style="background:red; font-size:0.7rem; padding:4px 8px;" onclick="window.deleteQuest(${index})">X</button></div><h4 class="quest-title">${q.title}</h4><p class="quest-desc">${q.desc || ''}</p><div style="display:flex; justify-content:space-between; margin-top:5px;"><span class="quest-reward">🎁 ${q.reward}</span><small style="color:var(--cr-blue)">Pour : ${assignedP ? assignedP.name : '?'}</small></div></div>`;
            list.appendChild(card);
        });
    }
    container.appendChild(list);
}
window.deleteQuest = (index) => { if(confirm('Supprimer ?')) { gameData.quests.splice(index, 1); saveData(); } };

// 7. JOURNAL (MODALE LARGE)
function renderJournalModule(container) {
    if (!gameData.journal) gameData.journal = [];
    if (currentUser.role === 'dm') {
        container.innerHTML = '<div style="margin-bottom:20px; text-align:center"><button id="btn-new-entry" class="btn btn-primary" style="width:100%">+ Nouveau Résumé</button></div>';
        document.getElementById('btn-new-entry').onclick = () => {
            openJournalModal('Nouveau Résumé', { title: '', date: new Date().toISOString().split('T')[0], content: '', participants: [] }, (data) => {
                gameData.journal.unshift({ id: generateId(), ...data }); saveData(`Journal : ${data.title}`);
            });
        };
    } else container.innerHTML = '<h2 style="margin-bottom:20px;">Chroniques</h2>';

    const list = document.createElement('div');
    if (gameData.journal.length === 0) list.innerHTML = '<p style="text-align:center; opacity:0.6">Vide...</p>';
    gameData.journal.forEach((entry, index) => {
        const entryDiv = document.createElement('div'); entryDiv.className = 'journal-entry';
        let avatarsHtml = '';
        if (entry.participants) entry.participants.forEach(pid => { const p = gameData.players.find(x => x.id === pid); if(p) avatarsHtml += `<img src="${p.avatar}" class="participant-badge" title="${p.name}">`; });
        entryDiv.innerHTML = `<div class="journal-header"><div style="display:flex; justify-content:space-between;"><span class="journal-date">📅 ${entry.date}</span><div class="journal-participants">${avatarsHtml}</div></div><h3 class="journal-title">${entry.title}</h3></div><div class="journal-content">${entry.content}</div>`;
        if (currentUser.role === 'dm') {
            const actions = document.createElement('div'); actions.style.cssText = 'margin-top:15px; text-align:right; border-top:1px solid #eee; padding-top:10px;';
            actions.innerHTML = `<button class="btn" style="background:orange; font-size:0.7rem; padding:5px;" id="edit-j-${entry.id}">✏️</button> <button class="btn" style="background:red; font-size:0.7rem; padding:5px;" id="del-j-${entry.id}">🗑️</button>`;
            entryDiv.appendChild(actions);
            actions.querySelector(`#del-j-${entry.id}`).onclick = () => { if(confirm('Supprimer ?')) { gameData.journal.splice(index, 1); saveData(); } };
            actions.querySelector(`#edit-j-${entry.id}`).onclick = () => { openJournalModal('Modifier', entry, (d) => { Object.assign(entry, d); saveData(); }); };
        }
        list.appendChild(entryDiv);
    });
    container.appendChild(list);
}

// 8. SYSTÈME
function renderSystemModule(container) {
    container.innerHTML = `<h2>Gestion</h2>`;
    const exportBox = document.createElement('div'); exportBox.className = 'system-box';
    exportBox.innerHTML = `<h3 style="color:var(--cr-blue)">💾 Sauvegarder</h3><button id="btn-backup" class="btn btn-primary">Télécharger JSON</button>`;
    exportBox.querySelector('#btn-backup').onclick = () => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(gameData, null, 2)], { type: "application/json" }));
        a.download = `backup-${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    container.appendChild(exportBox);

    const importBox = document.createElement('div'); importBox.className = 'system-box'; importBox.style.border = '2px dashed #fcc22d';
    importBox.innerHTML = `<h3 style="color:#d35400">⚠️ Restaurer</h3><div class="file-upload-wrapper"><button class="btn btn-secondary">Choisir JSON</button><input type="file" id="file-input" accept=".json"></div>`;
    importBox.querySelector('#file-input').onchange = (e) => {
        if(e.target.files[0] && confirm("Écraser la partie actuelle ?")) {
            const r = new FileReader(); r.onload = (ev) => { try { gameData = JSON.parse(ev.target.result); saveData("Restoration système"); alert("Succès !"); } catch(err){alert("Erreur fichier");} }; r.readAsText(e.target.files[0]);
        }
    };
    container.appendChild(importBox);
}

// --- PLAYER MOBILE MODULES ---
function renderPlayerStats(container, p) {
    let pillsHtml = '';
    if (gameData.resourceTypes) {
        gameData.resourceTypes.forEach(res => {
            const val = p[res.id] !== undefined ? p[res.id] : 0;
            pillsHtml += `<div class="res-pill"><div class="res-icon" style="background:${res.color}; color:white">${res.icon}</div><span style="color:${res.color}; filter:brightness(1.5)">${val}</span></div>`;
        });
    }
    const header = document.createElement('div'); header.className = 'profile-header';
    header.innerHTML = `<img src="${p.avatar}" class="profile-avatar"><div class="profile-name">${p.name}</div><div class="resource-row" style="flex-wrap:wrap">${pillsHtml}</div><div style="margin-top:10px; font-size:0.8rem; font-style:italic; opacity:0.8">${p.desc || ''}</div>`;
    container.appendChild(header);

    const dashboard = document.createElement('div'); dashboard.className = 'player-dashboard';
    dashboard.innerHTML += `<h3 style="color:var(--cr-wood); margin-top:20px;">🎒 Inventaire</h3>`;
    const invInput = document.createElement('textarea'); invInput.className = 'inventory-box';
    invInput.value = p.inventory || 'Votre sac est vide.'; invInput.readOnly = true; invInput.style.cssText = 'background:#e6e6e6; color:#555; cursor:default; outline:none;';
    dashboard.appendChild(invInput);

    dashboard.innerHTML += `<h3 style="color:var(--cr-blue); margin-top:10px;">⚔️ Deck</h3><p class="play-hint">Clique pour jouer !</p>`;
    const deckGrid = document.createElement('div'); deckGrid.className = 'card-grid player-deck';
    if(p.deck.length === 0) deckGrid.innerHTML = '<p style="opacity:0.5; width:100%">Vide.</p>';
    else {
        p.deck.forEach(cardId => {
            const c = gameData.cards.find(x => x.id === cardId);
            if(c) {
                const el = document.createElement('div'); el.className = 'clash-card';
                el.innerHTML = `<div class="cost">${c.cost}</div><img src="${c.img}"><h4>${c.name}</h4>`;
                el.onclick = () => { if(confirm(`Jouer "${c.name}" ?`)) playCardAction(p.name, c); };
                deckGrid.appendChild(el);
            }
        });
    }
    dashboard.appendChild(deckGrid);
    container.appendChild(dashboard);
}

function renderPlayerQuests(container, player) {
    const myQuests = gameData.quests.filter(q => q.assignedTo === player.id);
    container.innerHTML = '<h2>Mes Quêtes</h2>';
    if (myQuests.length === 0) return container.innerHTML += '<div style="text-align:center; opacity:0.6; margin-top:40px;"><p>Aucune mission.</p></div>';
    myQuests.forEach(q => {
        let giverImg = 'https://cdn-icons-png.flaticon.com/512/3209/3209995.png';
        if (q.giverId && q.giverId !== 'board') { const npc = gameData.npcs.find(n => n.id === q.giverId); if (npc) giverImg = npc.avatar; }
        const card = document.createElement('div'); card.className = 'quest-card'; card.style.borderLeftColor = 'var(--cr-blue)';
        card.innerHTML = `<img src="${giverImg}" class="quest-giver"><div class="quest-info"><h4 class="quest-title">${q.title}</h4><p class="quest-desc">${q.desc || ''}</p><span class="quest-reward">💰 ${q.reward}</span></div>`;
        container.appendChild(card);
    });
}

// --- GLOBALS HELPERS ---
function openFormModal(title, fields, onSave) {
    const modal = document.getElementById('modal-form');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');
    saveBtn.style.display = 'inline-block'; saveBtn.innerText = 'Sauvegarder';
    document.getElementById('form-title').innerText = title; container.innerHTML = '';

    fields.forEach(f => {
        const div = document.createElement('div'); div.className = 'form-group';
        div.innerHTML = `<label>${f.label}</label>`;
        let input;
        if (f.type === 'select') {
            input = document.createElement('select');
            f.options.forEach(opt => { const o = document.createElement('option'); o.value = opt.value; o.innerText = opt.label; if(opt.value === f.value) o.selected = true; input.appendChild(o); });
        } else if (f.type === 'textarea') {
            input = document.createElement('textarea'); input.rows = 3; input.value = (f.value != null) ? f.value : '';
        } else {
            input = document.createElement('input'); input.type = f.type || 'text'; input.value = (f.value != null) ? f.value : '';
        }
        input.id = `field-${f.name}`; div.appendChild(input); container.appendChild(div);
    });

    currentFormCallback = onSave;
    modal.style.display = 'flex';
    modal.querySelector('.close-form').onclick = () => modal.style.display = 'none';
    saveBtn.onclick = () => {
        const result = {}; fields.forEach(f => { result[f.name] = document.getElementById(`field-${f.name}`).value; });
        currentFormCallback(result); modal.style.display = 'none';
    };
}

function openJournalModal(title, initialData, onSave) {
    const modal = document.getElementById('modal-form'); const container = document.getElementById('form-fields'); const saveBtn = document.getElementById('btn-form-save');
    modal.querySelector('.modal-content').classList.add('modal-large');
    document.getElementById('form-title').innerText = title; container.innerHTML = ''; saveBtn.style.display = 'inline-block';
    
    let checksHtml = '<div class="checkbox-group">';
    gameData.players.forEach(p => { const isChecked = initialData.participants.includes(p.id) ? 'checked' : ''; checksHtml += `<label class="checkbox-item"><input type="checkbox" class="j-part-check" value="${p.id}" ${isChecked}>${p.name}</label>`; });
    checksHtml += '</div>';

    container.innerHTML = `<div style="display:flex; gap:10px;"><div class="form-group" style="flex:2"><label>Titre</label><input type="text" id="j-title" value="${initialData.title}"></div><div class="form-group" style="flex:1"><label>Date</label><input type="date" id="j-date" value="${initialData.date}"></div></div><div class="form-group"><label>Participants</label>${checksHtml}</div><div class="form-group" style="height:100%; display:flex; flex-direction:column;"><label>Récit</label><textarea id="j-content" style="flex:1; resize:none; padding:15px; font-family:'Georgia', serif;">${initialData.content}</textarea></div>`;
    modal.style.display = 'flex';
    const close = () => { modal.querySelector('.modal-content').classList.remove('modal-large'); modal.style.display = 'none'; };
    modal.querySelector('.close-form').onclick = close;
    saveBtn.onclick = () => {
        const parts = []; document.querySelectorAll('.j-part-check:checked').forEach(b => parts.push(b.value));
        if(document.getElementById('j-title').value) { onSave({ title: document.getElementById('j-title').value, date: document.getElementById('j-date').value, content: document.getElementById('j-content').value, participants: parts }); close(); }
    };
}

function openDeckManager(entityArg) {
    const modal = document.getElementById('modal-form'); const container = document.getElementById('form-fields'); const saveBtn = document.getElementById('btn-form-save');
    const targetId = entityArg.id; saveBtn.style.display = 'none'; modal.style.display = 'flex'; document.getElementById('form-title').innerText = "Deck Manager";

    const renderManager = () => {
        const freshEntity = findEntityById(targetId);
        if (!freshEntity) return modal.style.display = 'none';
        container.innerHTML = '';
        
        const sec1 = document.createElement('div'); sec1.innerHTML = '<h4 style="color:var(--cr-blue)">Possédé</h4>';
        const list1 = document.createElement('div'); list1.className = 'deck-manager-section mini-card-grid';
        if(!freshEntity.deck) freshEntity.deck = [];
        freshEntity.deck.forEach((cardId, index) => {
            const card = gameData.cards.find(c => c.id === cardId);
            if(card) {
                const el = document.createElement('div'); el.className = 'mini-card'; el.style.borderColor = 'red';
                el.innerHTML = `<img src="${card.img}"><div>${card.name}</div><div class="action-overlay">✖</div>`;
                el.onclick = () => { freshEntity.deck.splice(index, 1); renderManager(); syncGameData(gameData); };
                list1.appendChild(el);
            }
        });
        sec1.appendChild(list1); container.appendChild(sec1);

        const sec2 = document.createElement('div'); sec2.innerHTML = '<h4 style="color:green">Bibliothèque</h4>';
        const list2 = document.createElement('div'); list2.className = 'deck-manager-section mini-card-grid';
        gameData.cards.forEach(card => {
            const el = document.createElement('div'); el.className = 'mini-card'; el.style.borderColor = 'green';
            el.innerHTML = `<img src="${card.img}"><div>${card.name}</div><div class="action-overlay">➕</div>`;
            el.onclick = () => { freshEntity.deck.push(card.id); renderManager(); syncGameData(gameData); };
            list2.appendChild(el);
        });
        sec2.appendChild(list2); container.appendChild(sec2);
    };
    renderManager();
    modal.querySelector('.close-form').onclick = () => { saveBtn.style.display = 'inline-block'; modal.style.display = 'none'; render(); };
}

function openResourceManager() {
    const modal = document.getElementById('modal-form'); const container = document.getElementById('form-fields');
    document.getElementById('form-title').innerText = 'Ressources'; document.getElementById('btn-form-save').style.display = 'none'; modal.style.display = 'flex';
    const refresh = () => {
        container.innerHTML = '<button id="btn-new-res" class="btn btn-primary" style="margin-bottom:10px">+ Ressource</button>';
        container.querySelector('#btn-new-res').onclick = () => {
            modal.style.display = 'none'; openFormModal('Nouveau', [{name:'name', label:'Nom'}, {name:'icon', label:'Icone'}, {name:'color', label:'Couleur'}, {name:'id', label:'ID (minuscule)'}], (d) => {
                if(!gameData.resourceTypes.find(r=>r.id===d.id)) { gameData.resourceTypes.push(d); saveData(); setTimeout(openResourceManager, 100); }
            });
        };
        gameData.resourceTypes.forEach((res, i) => {
            const d = document.createElement('div'); d.className = 'panel'; d.style.marginBottom='5px'; d.style.display='flex'; d.style.justifyContent='space-between';
            d.innerHTML = `<span>${res.icon} ${res.name}</span><button class="btn" style="background:red;padding:5px;" id="del-res-${i}">🗑️</button>`;
            d.querySelector('button').onclick = () => { gameData.resourceTypes.splice(i, 1); saveData(); refresh(); };
            container.appendChild(d);
        });
    };
    refresh();
    modal.querySelector('.close-form').onclick = () => { document.getElementById('btn-form-save').style.display = 'inline-block'; modal.style.display = 'none'; render(); };
}

function openMapManager() {
    const modal = document.getElementById('modal-form'); const container = document.getElementById('form-fields');
    document.getElementById('form-title').innerText = 'Atlas'; document.getElementById('btn-form-save').style.display = 'none'; modal.style.display = 'flex';
    const refresh = () => {
        container.innerHTML = '<button id="btn-new-map" class="btn btn-primary" style="margin-bottom:10px">+ Carte</button>';
        container.querySelector('#btn-new-map').onclick = () => {
            modal.style.display = 'none'; openFormModal('Nouvelle Carte', [{name:'name', label:'Nom'}, {name:'url', label:'URL'}, {name:'desc', label:'Desc', type:'textarea'}], (d) => {
                gameData.maps.push({id:generateId(), name:d.name, url:d.url||'./assets/map.png', desc:d.desc}); saveData(); setTimeout(openMapManager, 100);
            });
        };
        const list = document.createElement('div'); list.style.maxHeight='300px'; list.style.overflowY='auto';
        gameData.maps.forEach(m => {
            const row = document.createElement('div'); row.className = 'panel'; row.style.marginBottom='10px'; row.style.background = m.id===gameData.activeMapId?'#e3f2fd':'white';
            row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong>${m.name}</strong><img src="${m.url}" style="width:40px;height:30px;object-fit:cover;background:#eee" onerror="this.style.display='none'"></div><div style="text-align:right;margin-top:5px;"><button class="btn btn-primary" style="padding:5px" onclick="loadMap('${m.id}')">Charger</button> <button class="btn" style="padding:5px;background:red" onclick="delMap('${m.id}')">🗑️</button></div>`;
            list.appendChild(row);
        });
        container.appendChild(list);
    };
    window.loadMap = (id) => { gameData.activeMapId = id; gameData.config.mapUrl = gameData.maps.find(m=>m.id===id).url; saveData(); modal.style.display='none'; };
    window.delMap = (id) => { if(gameData.maps.length>1 && confirm('Supprimer ?')) { gameData.maps = gameData.maps.filter(x=>x.id!==id); saveData(); refresh(); }};
    refresh();
    modal.querySelector('.close-form').onclick = () => { document.getElementById('btn-form-save').style.display = 'inline-block'; modal.style.display = 'none'; };
}

function showQRCode() {
    const modal = document.getElementById('modal-qr'); modal.querySelector('.modal-content').innerHTML = `<span class="close-modal" style="position:absolute;right:15px;top:10px;cursor:pointer;font-size:24px;">&times;</span><h3>QR Code</h3><select id="qr-select" style="width:100%;padding:10px;margin-bottom:20px;"><option value="new">Nouveau</option></select><div id="qrcode" style="display:flex;justify-content:center;"></div>`;
    const sel = document.getElementById('qr-select');
    gameData.players.forEach(p => { const o = document.createElement('option'); o.value=p.id; o.innerText=p.name; sel.appendChild(o); });
    const gen = () => {
        document.getElementById('qrcode').innerHTML = '';
        let url = `${window.location.href.split('?')[0]}?session=${document.getElementById('session-input').value}`;
        if(sel.value !== 'new') url += `&role=player&id=${sel.value}`;
        new QRCode(document.getElementById('qrcode'), {text:url, width:200, height:200});
    };
    sel.onchange = gen;
    modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';
    modal.style.display = 'flex'; gen();
}

function playCardAction(playerName, card) {
    const html = `<div style="text-align:center;margin-top:5px;border:1px solid #333;border-radius:5px;overflow:hidden;background:white;"><img src="${card.img}" style="width:100%;height:100px;object-fit:cover;"><div style="padding:5px;"><strong>${card.name}</strong><br><small>${card.desc}</small></div></div>`;
    gameData.chat.push({ id: generateId(), sender: playerName, senderId: currentUser.id, text: `⚔️ Lance <b>${card.name}</b> ! ${html}`, target: 'global', timestamp: new Date().toISOString() });
    saveData(); switchTab(currentUser.role==='dm'?'chat':'p-chat', currentUser.role);
}

function triggerChestAnimation(newCardId) {
    const overlay = document.getElementById('chest-overlay'); const display = document.getElementById('new-card-display');
    const card = gameData.cards.find(c => c.id === newCardId); if(!card) return;
    display.innerHTML = `<div class="clash-card" style="transform:scale(1.1);margin:0 auto;background:white;"><div class="cost">${card.cost}</div><img src="${card.img}"><h4>${card.name}</h4></div><p style="color:#ffd700;margin-top:20px;">Vous avez obtenu : <strong>${card.name}</strong></p>`;
    overlay.classList.remove('hidden'); setTimeout(() => overlay.classList.add('hidden'), 5000); overlay.onclick = () => overlay.classList.add('hidden');
}