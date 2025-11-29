import { initialGameData, generateId, formatTime } from './data.js';
import { joinSession, createSession, syncGameData } from './cloud.js';

// --- STATE LOCAL ---
let gameData = JSON.parse(JSON.stringify(initialGameData));
let currentUser = { role: 'guest', id: null };
let currentTab = 'map';
let prevDeckSize = 0;
let selectedEntityId = null;
let currentFormCallback = null;

// --- DOM ELEMENTS ---
const screens = {
    login: document.getElementById('login-screen'),
    dm: document.getElementById('dm-screen'),
    player: document.getElementById('player-screen')
};

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

    // Navigation
    document.querySelectorAll('#dm-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab, 'dm'));
    });
    document.querySelectorAll('#player-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab, 'player'));
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
    render();
}

function switchTab(tabName, role) {
    currentTab = tabName;
    const navId = role === 'dm' ? '#dm-nav' : '#player-nav';
    document.querySelectorAll(`${navId} button`).forEach(b => b.classList.remove('active'));
    document.querySelector(`${navId} button[data-tab="${tabName}"]`).classList.add('active');
    render();
}

// --- SYSTEME DE MODALE DYNAMIQUE (FIXED) ---
function openFormModal(title, fields, onSave) {
    const modal = document.getElementById('modal-form');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');

    // FIX: Toujours réafficher le bouton par défaut
    saveBtn.style.display = 'inline-block';
    saveBtn.innerText = 'Sauvegarder';
    
    document.getElementById('form-title').innerText = title;
    container.innerHTML = '';

    fields.forEach(f => {
        const div = document.createElement('div');
        div.className = 'form-group';
        
        const label = document.createElement('label');
        label.innerText = f.label;
        div.appendChild(label);

        let input;
        if (f.type === 'select') {
            input = document.createElement('select');
            f.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.innerText = opt.label;
                if(opt.value === f.value) option.selected = true;
                input.appendChild(option);
            });
        } else if (f.type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 3;
            input.value = (f.value !== null && f.value !== undefined) ? f.value : '';
        } else {
            input = document.createElement('input');
            input.type = f.type || 'text';
            input.value = (f.value !== null && f.value !== undefined) ? f.value : '';
        }
        
        input.id = `field-${f.name}`;
        div.appendChild(input);
        container.appendChild(div);
    });

    currentFormCallback = onSave;
    modal.style.display = 'flex';

    modal.querySelector('.close-form').onclick = () => modal.style.display = 'none';
    
    // Nettoyage et assignation event
    saveBtn.onclick = null;
    saveBtn.onclick = () => {
        const result = {};
        fields.forEach(f => {
            const el = document.getElementById(`field-${f.name}`);
            result[f.name] = el.value;
        });
        currentFormCallback(result);
        modal.style.display = 'none';
    };
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
    if (!me) return container.innerHTML = '<p>Votre personnage a été supprimé.</p>';

    document.getElementById('player-name-display').innerText = me.name;
    document.getElementById('player-resources').innerHTML = `
        <span style="color:gold">💰 ${me.gold}</span>
        <span style="color:#d0006f">💧 ${me.elixir}</span>
    `;

    if (currentTab === 'p-stats') renderPlayerStats(container, me);
    else if (currentTab === 'p-map') renderMapModule(container, false);
    else if (currentTab === 'p-chat') renderChatModule(container);
    else if (currentTab === 'p-quests') renderPlayerQuests(container, me);
    else if (currentTab === 'p-journal') renderJournalModule(container);
}

// --- MODULES ---

// 1. MAP & ATLAS
function renderMapModule(container, isEditable) {
    // Migration data
    if (!gameData.maps) {
        gameData.maps = [{ id: 'default', name: 'Carte Principale', url: gameData.config.mapUrl || './assets/map.png', desc: 'Défaut' }];
        gameData.activeMapId = 'default';
        syncGameData(gameData);
    }

    let currentMap = gameData.maps.find(m => m.id === gameData.activeMapId) || gameData.maps[0];
    if(!currentMap) currentMap = { url: './assets/map.png', name: 'Défaut' };

    const wrapper = document.createElement('div');
    wrapper.className = 'map-container';
    
    const img = document.createElement('img');
    img.src = currentMap.url;
    img.className = 'map-img';
    img.onerror = function() { this.src = '.assets/map.png'; };
    
    if(isEditable) {
        img.addEventListener('click', (e) => {
            if (selectedEntityId) {
                let entity = gameData.players.find(p => p.id === selectedEntityId);
                if (!entity) entity = gameData.npcs.find(n => n.id === selectedEntityId);

                if (entity) {
                    const rect = wrapper.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    entity.x = x; entity.y = y;
                    saveData(); 
                    render(); 
                }
            } else {
                alert("Sélectionnez un pion d'abord !");
            }
        });

        const btnManage = document.createElement('button');
        btnManage.className = 'btn btn-secondary';
        btnManage.innerHTML = '🗺️ Atlas';
        btnManage.style.position = 'absolute';
        btnManage.style.top = '10px';
        btnManage.style.left = '10px';
        btnManage.style.zIndex = '50';
        btnManage.onclick = () => openMapManager();
        wrapper.appendChild(btnManage);
    }

    wrapper.appendChild(img);

    [...gameData.players, ...gameData.npcs].forEach(entity => {
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

function openMapManager() {
    const modal = document.getElementById('modal-form');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');
    
    document.getElementById('form-title').innerText = 'Atlas des Cartes';
    container.innerHTML = '<div style="margin-bottom:15px"><button id="btn-new-map" class="btn btn-primary">+ Nouvelle Carte</button></div>';

    container.querySelector('#btn-new-map').onclick = () => {
        modal.style.display = 'none'; 
        openFormModal('Nouvelle Carte', [
            { name: 'name', label: 'Nom du lieu', value: '' },
            { name: 'url', label: 'URL Image', value: './assets/map.png' },
            { name: 'desc', label: 'Description', type: 'textarea', value: '' }
        ], (data) => {
            gameData.maps.push({ id: generateId(), name: data.name, url: data.url, desc: data.desc });
            saveData(`Carte créée : ${data.name}`);
            setTimeout(() => openMapManager(), 100); 
        });
    };

    const list = document.createElement('div');
    list.style.maxHeight = '300px'; list.style.overflowY = 'auto';

    gameData.maps.forEach(m => {
        const isActive = m.id === gameData.activeMapId;
        const row = document.createElement('div');
        row.className = 'panel';
        row.style.marginBottom = '10px';
        row.style.background = isActive ? '#e3f2fd' : 'white';
        row.style.border = isActive ? '2px solid var(--cr-blue)' : '1px solid #ccc';
        row.style.textAlign = 'left';
        
        row.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center">
                <div>
                    <strong>${m.name}</strong> ${isActive ? '✅' : ''}<br>
                    <small style="opacity:0.7">${m.desc || ''}</small>
                </div>
                <img src="${m.url}" onerror="this.src='https://via.placeholder.com/50'" style="width:50px; height:30px; object-fit:cover; border:1px solid #ccc; margin:0 10px;">
            </div>
            <div style="margin-top:10px; display:flex; gap:5px; justify-content:flex-end">
                ${!isActive ? `<button class="btn btn-primary" style="font-size:0.7rem; padding:5px" id="load-${m.id}">Charger</button>` : ''}
                <button class="btn" style="font-size:0.7rem; padding:5px; background:orange" id="edit-${m.id}">✏️</button>
                <button class="btn" style="font-size:0.7rem; padding:5px; background:red" id="del-${m.id}">🗑️</button>
            </div>
        `;

        if(!isActive) {
            row.querySelector(`#load-${m.id}`).onclick = () => {
                gameData.activeMapId = m.id;
                gameData.config.mapUrl = m.url;
                saveData(`Changement de carte : ${m.name}`);
                modal.style.display = 'none';
            };
        }

        row.querySelector(`#edit-${m.id}`).onclick = () => {
            modal.style.display = 'none';
            openFormModal(`Modifier ${m.name}`, [
                { name: 'name', label: 'Nom', value: m.name },
                { name: 'url', label: 'URL', value: m.url },
                { name: 'desc', label: 'Description', type: 'textarea', value: m.desc || '' }
            ], (data) => {
                m.name = data.name; m.url = data.url; m.desc = data.desc;
                saveData();
                setTimeout(() => openMapManager(), 100);
            });
        };

        row.querySelector(`#del-${m.id}`).onclick = () => {
            if(gameData.maps.length <= 1) return alert("Impossible de supprimer la dernière carte !");
            if(confirm('Supprimer ?')) {
                gameData.maps = gameData.maps.filter(x => x.id !== m.id);
                if(isActive) {
                    gameData.activeMapId = gameData.maps[0].id;
                    gameData.config.mapUrl = gameData.maps[0].url;
                }
                saveData();
                openMapManager(); 
            }
        };
        list.appendChild(row);
    });

    container.appendChild(list);
    saveBtn.style.display = 'none';
    modal.style.display = 'flex';
    modal.querySelector('.close-form').onclick = () => {
        saveBtn.style.display = 'inline-block'; 
        modal.style.display = 'none';
    };
}

// 2. PLAYERS & PNJ
function renderPlayersModule(container) {
    container.innerHTML = '<div style="margin-bottom:15px"><button id="btn-add-p" class="btn btn-primary">+ Nouveau Personnage</button></div>';
    
    document.getElementById('btn-add-p').onclick = () => {
        openFormModal('Créer Personnage', [
            { name: 'name', label: 'Nom', value: '' },
            { name: 'type', label: 'Type', type: 'select', options: [{value:'player', label:'Joueur'}, {value:'npc', label:'PNJ'}], value: 'player' },
            { name: 'avatar', label: 'URL Avatar', value: 'https://cdn-icons-png.flaticon.com/512/147/147144.png' },
            { name: 'desc', label: 'Description', type: 'textarea', value: '' }
        ], (data) => {
            const newChar = {
                id: generateId(), name: data.name, avatar: data.avatar, desc: data.desc,
                gold: 0, elixir: 0, deck: [], inventory: '', x: 50, y: 50
            };
            if(data.type === 'player') gameData.players.push(newChar);
            else gameData.npcs.push(newChar);
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

        const resourcesHtml = type === 'player' ? `
            <div style="margin-top:5px;">
                <span style="font-size:0.8rem">💰</span> 
                <input type="number" class="res-input" data-id="${char.id}" data-type="gold" style="width:50px; padding:2px;" value="${char.gold}">
                <span style="font-size:0.8rem; margin-left:5px">💧</span> 
                <input type="number" class="res-input" data-id="${char.id}" data-type="elixir" style="width:50px; padding:2px;" value="${char.elixir}">
            </div>
        ` : '';

        row.innerHTML = `
            <img src="${char.avatar}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/847/847969.png'" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid #333">
            <div style="flex:1">
                <strong>${char.name}</strong> <small>(${type === 'npc' ? 'PNJ' : 'Joueur'})</small>
                ${resourcesHtml}
                <small style="opacity:0.7; display:block; font-size:0.8rem">${char.desc || ''}</small>
            </div>
            <div style="display:flex; flex-direction:column; gap:5px">
                <button class="btn" style="padding:5px 10px; font-size:0.8rem; background:orange; margin:0" id="edit-${char.id}">✏️</button>
                <button class="btn" style="padding:5px 10px; font-size:0.8rem; background:red; margin:0" id="del-${char.id}">🗑️</button>
            </div>
        `;

        row.querySelectorAll('.res-input').forEach(input => {
            input.onchange = (e) => {
                const val = parseInt(e.target.value) || 0;
                const fieldType = e.target.dataset.type;
                const pid = e.target.dataset.id;
                const targetP = gameData.players.find(x => x.id === pid);
                if(targetP) {
                    targetP[fieldType] = val;
                    syncGameData(gameData);
                }
            };
        });

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
        list.appendChild(sep);
        gameData.npcs.forEach(n => renderRow(n, 'npc'));
    }
    container.appendChild(list);
}

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
    messages.scrollTop = messages.scrollHeight;

    wrapper.querySelector('#chat-send').onclick = () => {
        const txt = wrapper.querySelector('#chat-input').value;
        if(txt) {
            const senderName = currentUser.role === 'dm' ? 'MJ' : gameData.players.find(p => p.id === currentUser.id)?.name || 'Inconnu';
            gameData.chat.push({ id: generateId(), sender: senderName, text: txt, timestamp: new Date().toISOString() });
            saveData();
        }
    };
}

// 4. CARTES (ITEMS)
function renderCardsModule(container) {
    container.innerHTML = '<div style="margin-bottom:15px"><button id="btn-create-card" class="btn btn-secondary">+ Créer une Carte</button></div>';

    document.getElementById('btn-create-card').onclick = () => {
        openFormModal('Nouvelle Carte', [
            { name: 'name', label: 'Nom', value: '' },
            { name: 'cost', label: 'Coût', type: 'number', value: '3' },
            { name: 'img', label: 'Image URL', value: 'https://statsroyale.com/images/cards/full/mirror.png' },
            { name: 'desc', label: 'Effet', type: 'textarea', value: '' }
        ], (data) => {
            gameData.cards.push({ id: generateId(), name: data.name, cost: parseInt(data.cost), img: data.img, desc: data.desc });
            saveData(`Carte créée : ${data.name}`);
        });
    };

    const grid = document.createElement('div');
    grid.className = 'card-grid';
    
    gameData.cards.forEach(c => {
        const el = document.createElement('div');
        el.className = 'clash-card';
        el.style.cursor = 'pointer';
        el.innerHTML = `<div class="cost">${c.cost}</div><img src="${c.img}"><h4>${c.name}</h4>`;
        
        el.onclick = () => {
            openFormModal(`Modifier ${c.name}`, [
                { name: 'name', label: 'Nom', value: c.name },
                { name: 'cost', label: 'Coût', type: 'number', value: c.cost },
                { name: 'img', label: 'Image URL', value: c.img },
                { name: 'desc', label: 'Description', type: 'textarea', value: c.desc || '' }
            ], (data) => {
                c.name = data.name; c.cost = parseInt(data.cost); c.img = data.img; c.desc = data.desc;
                saveData(`Carte modifiée : ${c.name}`);
            });
        };
        grid.appendChild(el);
    });
    container.appendChild(grid);
}

// 5. RELATIONS
function renderRelationsModule(container) {
    container.innerHTML = '<h2>Matrice des Relations</h2><p class="hint">Cliquez sur une case pour changer la relation.</p>';
    
    const entities = [...gameData.players, ...gameData.npcs];
    if(entities.length === 0) return container.innerHTML += '<p>Aucune entité créée.</p>';

    const matrix = document.createElement('div');
    matrix.className = 'relation-matrix';
    matrix.style.gridTemplateColumns = `repeat(${entities.length + 1}, 1fr)`;

    const corner = document.createElement('div');
    corner.className = 'rel-cell rel-header';
    corner.innerText = 'X';
    matrix.appendChild(corner);

    entities.forEach(e => {
        const header = document.createElement('div');
        header.className = 'rel-cell rel-header';
        header.innerText = e.name.substring(0, 3).toUpperCase();
        header.title = e.name;
        matrix.appendChild(header);
    });

    entities.forEach(source => {
        const rowHead = document.createElement('div');
        rowHead.className = 'rel-cell rel-header';
        rowHead.innerText = source.name;
        matrix.appendChild(rowHead);

        entities.forEach(target => {
            const cell = document.createElement('div');
            cell.className = 'rel-cell';
            
            if (source.id === target.id) {
                cell.style.background = '#ccc';
            } else {
                const rel = gameData.relations.find(r => r.source === source.id && r.target === target.id);
                const status = rel ? rel.status : 'neutral';
                
                cell.className = `rel-cell rel-${status}`;
                cell.innerText = getRelIcon(status);
                cell.style.cursor = 'pointer';
                cell.onclick = () => cycleRelation(source.id, target.id, status);
            }
            matrix.appendChild(cell);
        });
    });

    container.appendChild(matrix);
}

function getRelIcon(status) {
    if(status === 'friendly') return '🙂';
    if(status === 'hostile') return '😡';
    if(status === 'ally') return '🛡️';
    return '😐';
}

function cycleRelation(sId, tId, currentStatus) {
    const states = ['neutral', 'friendly', 'hostile', 'ally'];
    const nextIndex = (states.indexOf(currentStatus) + 1) % states.length;
    const nextStatus = states[nextIndex];

    const existingIndex = gameData.relations.findIndex(r => r.source === sId && r.target === tId);
    if (existingIndex >= 0) gameData.relations[existingIndex].status = nextStatus;
    else gameData.relations.push({ source: sId, target: tId, status: nextStatus });
    
    saveData();
}

// 6. QUÊTES
function renderQuestsModule(container) {
    const formPanel = document.createElement('div');
    formPanel.className = 'panel';
    formPanel.innerHTML = `<h3>Nouvelle Quête</h3>`;
    
    let playerOptions = gameData.players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    
    formPanel.innerHTML += `
        <div style="display:grid; gap:10px; text-align:left">
            <input type="text" id="q-title" placeholder="Titre de la quête">
            <input type="text" id="q-reward" placeholder="Récompense (ex: 500 Or)">
            <select id="q-assign">${playerOptions}</select>
            <button id="btn-add-quest" class="btn btn-secondary">Publier</button>
        </div>
    `;
    container.appendChild(formPanel);

    const list = document.createElement('div');
    list.style.marginTop = '20px';
    list.innerHTML = '<h3>Quêtes en cours</h3>';

    gameData.quests.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = 'panel';
        item.style.marginBottom = '10px';
        item.style.textAlign = 'left';
        
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

    setTimeout(() => {
        const btn = document.getElementById('btn-add-quest');
        if(btn) btn.onclick = () => {
            const title = document.getElementById('q-title').value;
            const reward = document.getElementById('q-reward').value;
            const assignedTo = document.getElementById('q-assign').value;

            if(title && assignedTo) {
                gameData.quests.push({ id: generateId(), title, reward, assignedTo, status: 'active' });
                saveData(`Nouvelle quête : ${title}`);
            }
        };
    }, 0);
}

window.deleteQuest = (index) => {
    if(confirm('Supprimer cette quête ?')) {
        gameData.quests.splice(index, 1);
        saveData();
    }
};

function renderPlayerQuests(container, player) {
    const myQuests = gameData.quests.filter(q => q.assignedTo === player.id);
    container.innerHTML = '<h2>Mes Quêtes</h2>';
    if (myQuests.length === 0) {
        container.innerHTML += '<p style="opacity:0.6; margin-top:50px;">Aucune quête active.</p>';
        return;
    }
    myQuests.forEach(q => {
        const card = document.createElement('div');
        card.className = 'panel';
        card.style.marginBottom = '15px';
        card.style.borderLeft = '5px solid var(--cr-gold)';
        card.innerHTML = `<h3>${q.title}</h3><p>Récompense : <strong>${q.reward}</strong></p>`;
        container.appendChild(card);
    });
}

// 7. JOURNAL & EXTRAS
function renderJournalModule(container) {
    container.innerHTML = '<h3>Historique</h3>';
    gameData.logs.forEach(l => {
        const div = document.createElement('div');
        div.innerHTML = `<small>${formatTime(l.timestamp)}</small> : ${l.text}`;
        div.style.borderBottom = '1px solid #ccc';
        container.appendChild(div);
    });
}

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

function showQRCode() {
    const modal = document.getElementById('modal-qr');
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';
    modal.style.display = 'flex';

    const baseUrl = window.location.href.split('?')[0];
    const session = document.getElementById('session-input').value;
    let targetUrl = `${baseUrl}?session=${session}`;
    if(gameData.players.length > 0) targetUrl += `&role=player&id=${gameData.players[0].id}`;

    new QRCode(qrContainer, { text: targetUrl, width: 200, height: 200 });
}

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
    setTimeout(() => overlay.classList.add('hidden'), 4000);
}
