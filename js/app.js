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
    container.innerHTML = ''; // Nettoyage
    
    // Récupération du joueur
    const me = gameData.players.find(p => p.id === currentUser.id);
    
    // Cas d'erreur : Joueur supprimé
    if (!me) {
        container.innerHTML = `
            <div style="text-align:center; padding-top:50px; color:white;">
                <h1>☠️</h1>
                <p>Ce personnage n'existe plus.</p>
                <a href="index.html" class="btn btn-secondary">Retour</a>
            </div>
        `;
        return;
    }

    // On supprime les anciennes lignes qui mettaient à jour le header inexistant
    // document.getElementById('player-name-display').innerText = ... (SUPPRIMÉ)
    // document.getElementById('player-resources').innerHTML = ... (SUPPRIMÉ)

    // Routing des onglets
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

// 2. PLAYERS & PNJ (Avec bouton Deck Manager)
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

        // Zone input ressources (Joueur uniquement)
        const resourcesHtml = type === 'player' ? `
            <div style="margin-top:5px;">
                <span style="font-size:0.8rem">💰</span> 
                <input type="number" class="res-input" data-id="${char.id}" data-type="gold" style="width:50px; padding:2px;" value="${char.gold}">
                <span style="font-size:0.8rem; margin-left:5px">💧</span> 
                <input type="number" class="res-input" data-id="${char.id}" data-type="elixir" style="width:50px; padding:2px;" value="${char.elixir}">
            </div>
        ` : '';

        row.innerHTML = `
            <img src="${char.avatar}" onerror="this.onerror=null;this.src='https://cdn-icons-png.flaticon.com/512/847/847969.png'" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid #333">
            <div style="flex:1">
                <strong>${char.name}</strong> <small>(${type === 'npc' ? 'PNJ' : 'Joueur'})</small>
                ${resourcesHtml}
                <small style="opacity:0.7; display:block; font-size:0.8rem">${char.desc || ''}</small>
            </div>
            <div style="display:flex; flex-direction:column; gap:5px">
                <div style="display:flex; gap:5px">
                    <button class="btn" style="padding:5px 10px; font-size:0.8rem; background:#7c4dff; margin:0" id="deck-${char.id}" title="Gérer les cartes">🎴</button>
                    <button class="btn" style="padding:5px 10px; font-size:0.8rem; background:orange; margin:0" id="edit-${char.id}">✏️</button>
                </div>
                <button class="btn" style="padding:5px 10px; font-size:0.8rem; background:red; margin:0" id="del-${char.id}">🗑️</button>
            </div>
        `;

        // Listeners Ressources
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

        // 1. GESTION DECK (NOUVEAU)
        row.querySelector(`#deck-${char.id}`).onclick = () => openDeckManager(char);

        // 2. EDITION
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

        // 3. SUPPRESSION
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

// 3. CHAT (MESSAGERIE PRIVÉE + DÉS)
function renderChatModule(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-window';
    
    // --- 1. ZONE D'AFFICHAGE DES MESSAGES ---
    const messages = document.createElement('div');
    messages.className = 'chat-messages';
    
    gameData.chat.forEach(msg => {
        // LOGIQUE DE FILTRAGE (Qui voit quoi ?)
        const targetId = msg.target || 'global'; // Par défaut 'global' pour les vieux messages
        const myId = currentUser.role === 'dm' ? 'dm' : currentUser.id;
        const senderId = msg.senderId || 'inconnu'; // On devra stocker l'ID maintenant

        // On affiche SI : Global OU C'est moi qui envoie OU C'est pour moi
        const shouldShow = (targetId === 'global') || (senderId === myId) || (targetId === myId);

        if (!shouldShow) return; // On saute ce message, il ne nous concerne pas

        // STYLING
        const isSelf = senderId === myId;
        const isWhisper = targetId !== 'global';
        const isDice = msg.text.startsWith('🎲');
        
        const div = document.createElement('div');
        div.className = `message ${isSelf ? 'self' : ''}`;
        
        let bubbleStyle = '';
        let prefix = '';

        if (isWhisper) {
            bubbleStyle = 'background:#e0c3fc; color:#4a148c; border:1px solid #7c4dff;'; // Violet style
            // On affiche "À X" ou "De X"
            if(isSelf) {
                // Je cherche le nom du destinataire pour l'afficher
                let targetName = 'MJ';
                if(targetId !== 'dm') {
                    const t = gameData.players.find(p => p.id === targetId);
                    if(t) targetName = t.name;
                }
                prefix = `<small style="display:block; font-weight:bold; color:#4a148c">🔒 À ${targetName}</small>`;
            } else {
                prefix = `<small style="display:block; font-weight:bold; color:#4a148c">🔒 De ${msg.sender}</small>`;
            }
        }
        
        if (isDice) {
            bubbleStyle = 'background:var(--cr-gold); color:black; font-weight:bold; border:2px solid black';
        }

        div.innerHTML = `
            <small>${isSelf ? 'Moi' : msg.sender} - ${formatTime(msg.timestamp)}</small>
            <div class="bubble" style="${bubbleStyle}">
                ${prefix}
                ${msg.text}
            </div>
        `;
        messages.appendChild(div);
    });
    
    // --- 2. ZONE DE CONTRÔLE (BAS) ---
    const controls = document.createElement('div');
    controls.style.padding = '10px';
    controls.style.background = '#ddd';
    controls.style.borderTop = '2px solid white';

    // A. BARRE DE DÉS
    const diceBar = document.createElement('div');
    diceBar.style.marginBottom = '5px';
    diceBar.style.display = 'flex';
    diceBar.style.gap = '5px';
    
    ['d6', 'd20', 'd100'].forEach(type => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.padding = '2px 8px';
        btn.style.fontSize = '0.7rem';
        btn.style.background = 'white';
        btn.style.color = '#333';
        btn.style.borderBottom = '2px solid #999';
        btn.innerText = type;
        
        btn.onclick = () => {
            const max = parseInt(type.substring(1));
            const result = Math.floor(Math.random() * max) + 1;
            sendMessage(`🎲 ${type} : ${result}`, true); // true = c'est un dé
        };
        diceBar.appendChild(btn);
    });

    // B. INPUTS (Sélecteur + Texte + Bouton)
    const inputRow = document.createElement('div');
    inputRow.style.display = 'flex';
    inputRow.style.gap = '5px';

    // Sélecteur de destinataire
    const select = document.createElement('select');
    select.id = 'chat-target';
    select.style.maxWidth = '100px';
    select.style.borderRadius = '5px';
    
    // Option Global
    select.innerHTML = '<option value="global">📢 Global</option>';
    
    // Option MJ (si je suis joueur)
    if(currentUser.role !== 'dm') {
        select.innerHTML += '<option value="dm">👑 MJ</option>';
    }
    
    // Options Joueurs (si je suis MJ ou pour parler entre joueurs)
    gameData.players.forEach(p => {
        // Je ne m'affiche pas moi-même dans la liste
        if(p.id !== currentUser.id) {
            select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        }
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'chat-input';
    input.style.flex = '1';
    input.style.padding = '10px';
    input.style.borderRadius = '5px';
    input.style.border = '1px solid #ccc';
    input.placeholder = 'Message...';

    // Gestion de la touche "Entrée"
    input.onkeydown = (e) => { if(e.key === 'Enter') confirmSend(); };

    const btnSend = document.createElement('button');
    btnSend.className = 'btn btn-primary';
    btnSend.innerText = 'Envoyer';
    btnSend.onclick = () => confirmSend();

    inputRow.appendChild(select);
    inputRow.appendChild(input);
    inputRow.appendChild(btnSend);

    controls.appendChild(diceBar);
    controls.appendChild(inputRow);

    wrapper.appendChild(messages);
    wrapper.appendChild(controls);
    container.appendChild(wrapper);

    // Scroll en bas auto
    messages.scrollTop = messages.scrollHeight;

    // --- FONCTIONS INTERNES D'ENVOI ---

    function confirmSend() {
        const txt = input.value;
        if(txt) {
            sendMessage(txt, false);
            input.value = ''; // Reset input
        }
    }

    function sendMessage(text, isDice) {
        const target = select.value;
        const myId = currentUser.role === 'dm' ? 'dm' : currentUser.id;
        const senderName = currentUser.role === 'dm' ? 'MJ' : gameData.players.find(p => p.id === currentUser.id)?.name || 'Inconnu';

        gameData.chat.push({
            id: generateId(),
            sender: senderName,      // Nom affiché
            senderId: myId,          // ID technique pour le filtrage
            text: text,
            target: target,          // 'global', 'dm', ou ID joueur
            timestamp: new Date().toISOString()
        });
        saveData();
    }
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

// 5. RELATIONS (MATRICE INTERACTIVE)
function renderRelationsModule(container) {
    // 1. Initialisation de sécurité
    if (!gameData.relations) gameData.relations = [];

    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h2>Matrice des Relations</h2>
            <small style="color:#666">Cliquez sur une case pour changer l'état</small>
        </div>
    `;
    
    // On combine Joueurs et PNJ
    const entities = [...gameData.players, ...gameData.npcs];
    
    if(entities.length < 2) {
        return container.innerHTML += '<div class="panel">Il faut au moins 2 personnages (Joueurs ou PNJ) pour définir des relations.</div>';
    }

    // 2. Légende
    const legend = document.createElement('div');
    legend.style.display = 'flex';
    legend.style.gap = '10px';
    legend.style.marginBottom = '15px';
    legend.style.justifyContent = 'center';
    legend.innerHTML = `
        <span class="rel-cell rel-neutral">😐 Neutre</span>
        <span class="rel-cell rel-friendly">🙂 Ami</span>
        <span class="rel-cell rel-hostile">😡 Hostile</span>
        <span class="rel-cell rel-ally">🛡️ Allié</span>
    `;
    container.appendChild(legend);

    // 3. Construction de la Grille
    const matrix = document.createElement('div');
    matrix.className = 'relation-matrix';
    // CSS Grid dynamique : 1 colonne pour les noms + 1 colonne par entité
    matrix.style.display = 'grid';
    matrix.style.gridTemplateColumns = `100px repeat(${entities.length}, 1fr)`;
    matrix.style.gap = '2px';
    matrix.style.overflowX = 'auto'; // Scroll si trop de persos

    // A. Coin haut-gauche (vide)
    const corner = document.createElement('div');
    corner.className = 'rel-cell rel-header';
    corner.style.background = '#333';
    corner.innerText = 'QUI \\ A';
    matrix.appendChild(corner);

    // B. En-têtes Colonnes (Cibles)
    entities.forEach(e => {
        const header = document.createElement('div');
        header.className = 'rel-cell rel-header';
        header.style.writingMode = 'vertical-rl'; // Texte vertical pour gagner de la place
        header.style.transform = 'rotate(180deg)';
        header.style.height = '80px';
        header.style.padding = '5px';
        header.innerText = e.name;
        matrix.appendChild(header);
    });

    // C. Lignes (Sources)
    entities.forEach(source => {
        // En-tête Ligne (Celui qui ressent l'émotion)
        const rowHead = document.createElement('div');
        rowHead.className = 'rel-cell rel-header';
        rowHead.innerText = source.name;
        rowHead.style.display = 'flex';
        rowHead.style.alignItems = 'center';
        rowHead.style.justifyContent = 'center';
        rowHead.style.fontWeight = 'bold';
        matrix.appendChild(rowHead);

        // Cellules
        entities.forEach(target => {
            const cell = document.createElement('div');
            cell.className = 'rel-cell';
            cell.style.height = '40px';
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            cell.style.fontSize = '1.2rem';
            
            // Auto-relation (Diagonale) -> Grisé
            if (source.id === target.id) {
                cell.style.background = '#ddd';
                cell.innerText = '—';
            } else {
                // Trouver la relation existante
                const rel = gameData.relations.find(r => r.source === source.id && r.target === target.id);
                const status = rel ? rel.status : 'neutral';
                
                // Styling
                cell.className = `rel-cell rel-${status}`; // rel-friendly, rel-hostile...
                cell.innerText = getRelIcon(status);
                cell.style.cursor = 'pointer';
                cell.title = `${source.name} est ${status} envers ${target.name}`;

                // INTERACTION
                // On utilise currentUser.role pour empêcher les joueurs de tout modifier si on veut (ici ouvert à tous pour simplicité)
                if(currentUser.role === 'dm') {
                    cell.onclick = () => cycleRelation(source.id, target.id, status);
                } else {
                    cell.style.cursor = 'default'; // Les joueurs voient mais ne touchent pas
                }
            }
            matrix.appendChild(cell);
        });
    });

    container.appendChild(matrix);
}

// Helpers internes (nécessaires pour le fonctionnement)

function getRelIcon(status) {
    switch(status) {
        case 'friendly': return '🙂';
        case 'hostile': return '😡';
        case 'ally': return '🛡️';
        default: return '😐';
    }
}

function cycleRelation(sId, tId, currentStatus) {
    const states = ['neutral', 'friendly', 'hostile', 'ally'];
    const nextIndex = (states.indexOf(currentStatus) + 1) % states.length;
    const nextStatus = states[nextIndex];

    // Mise à jour des données
    const existingIndex = gameData.relations.findIndex(r => r.source === sId && r.target === tId);
    
    if (existingIndex >= 0) {
        gameData.relations[existingIndex].status = nextStatus;
    } else {
        gameData.relations.push({ source: sId, target: tId, status: nextStatus });
    }
    
    // Sauvegarde et Rafraîchissement immédiat
    saveData(); 
    // Note: render() est appelé automatiquement par saveData(), donc l'affichage se mettra à jour
}

// 6. QUÊTES (VERSION AMÉLIORÉE)
function renderQuestsModule(container) {
    // Bouton de création centré
    container.innerHTML = '<div style="margin-bottom:20px; text-align:center"><button id="btn-new-quest" class="btn btn-secondary" style="width:100%">+ Nouvelle Quête</button></div>';

    // LOGIQUE DE CRÉATION
    document.getElementById('btn-new-quest').onclick = () => {
        // 1. Préparer la liste des PNJ (Commanditaires)
        let npcOptions = [{value: 'board', label: '📢 Panneau d\'affichage (Aucun)'}];
        gameData.npcs.forEach(n => {
            npcOptions.push({ value: n.id, label: `👤 ${n.name}` });
        });

        // 2. Préparer la liste des Joueurs (Cibles)
        let playerOptions = [];
        gameData.players.forEach(p => {
            playerOptions.push({ value: p.id, label: `🎮 ${p.name}` });
        });

        if(playerOptions.length === 0) return alert("Il faut créer des joueurs avant de donner des quêtes !");

        // 3. Ouvrir la modale
        openFormModal('Nouvelle Quête', [
            { name: 'title', label: 'Titre de la quête', value: '' },
            { name: 'desc', label: 'Description / Instructions', type: 'textarea', value: '' },
            { name: 'reward', label: 'Récompense (ex: 500 Or)', value: '100 Or' },
            { name: 'giver', label: 'Commanditaire (PNJ)', type: 'select', options: npcOptions, value: 'board' },
            { name: 'assigned', label: 'Assigner au joueur', type: 'select', options: playerOptions, value: playerOptions[0].value }
        ], (data) => {
            gameData.quests.push({
                id: generateId(),
                title: data.title,
                desc: data.desc,
                reward: data.reward,
                giverId: data.giver,
                assignedTo: data.assigned,
                status: 'active'
            });
            saveData(`Nouvelle quête : ${data.title}`);
        });
    };

    // LISTE DES QUÊTES
    const list = document.createElement('div');
    
    if (gameData.quests.length === 0) {
        list.innerHTML = '<p style="opacity:0.5; text-align:center">Aucune quête active.</p>';
    } else {
        gameData.quests.forEach((q, index) => {
            // Trouver les infos
            const assignedP = gameData.players.find(p => p.id === q.assignedTo);
            const pName = assignedP ? assignedP.name : 'Inconnu';
            
            // Trouver l'image du commanditaire
            let giverImg = 'https://cdn-icons-png.flaticon.com/512/3209/3209995.png'; // Image par défaut (Panneau)
            if (q.giverId !== 'board') {
                const npc = gameData.npcs.find(n => n.id === q.giverId);
                if (npc) giverImg = npc.avatar;
            }

            const card = document.createElement('div');
            card.className = 'quest-card';
            card.innerHTML = `
                <img src="${giverImg}" class="quest-giver" onerror="this.src='https://via.placeholder.com/60'">
                <div class="quest-info">
                    <div style="float:right">
                         <button class="btn" style="background:red; font-size:0.7rem; padding:4px 8px;" onclick="deleteQuest(${index})">X</button>
                    </div>
                    <h4 class="quest-title">${q.title}</h4>
                    <p class="quest-desc">${q.desc || 'Aucune description.'}</p>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                        <span class="quest-reward">🎁 ${q.reward}</span>
                        <small style="color:var(--cr-blue); font-weight:bold">Pour : ${pName}</small>
                    </div>
                </div>
            `;
            list.appendChild(card);
        });
    }
    
    container.appendChild(list);
}

// Fonction de suppression globale
window.deleteQuest = (index) => {
    if(confirm('Supprimer cette quête ? (Cela l\'effacera aussi chez le joueur)')) {
        gameData.quests.splice(index, 1);
        saveData();
    }
};

function renderPlayerQuests(container, player) {
    const myQuests = gameData.quests.filter(q => q.assignedTo === player.id);
    
    container.innerHTML = '<h2>Mes Quêtes</h2>';
    
    if (myQuests.length === 0) {
        container.innerHTML += `
            <div style="text-align:center; opacity:0.6; margin-top:40px;">
                <img src="https://cdn-icons-png.flaticon.com/512/7486/7486747.png" width="64"><br>
                <p>Aucune mission pour le moment.<br>Profite de la taverne !</p>
            </div>`;
        return;
    }

    myQuests.forEach(q => {
        // Trouver l'image du commanditaire
        let giverImg = 'https://cdn-icons-png.flaticon.com/512/3209/3209995.png';
        let giverName = 'Panneau d\'affichage';
        
        if (q.giverId && q.giverId !== 'board') {
            const npc = gameData.npcs.find(n => n.id === q.giverId);
            if (npc) {
                giverImg = npc.avatar;
                giverName = npc.name;
            }
        }

        const card = document.createElement('div');
        card.className = 'quest-card';
        // Bordure bleue pour le joueur pour différencier
        card.style.borderLeftColor = 'var(--cr-blue)'; 
        
        card.innerHTML = `
            <img src="${giverImg}" class="quest-giver" onerror="this.src='https://via.placeholder.com/60'">
            <div class="quest-info">
                <small style="text-transform:uppercase; font-size:0.6rem; color:#888;">Commanditaire : ${giverName}</small>
                <h4 class="quest-title">${q.title}</h4>
                <p class="quest-desc">${q.desc || ''}</p>
                <span class="quest-reward">💰 ${q.reward}</span>
            </div>
        `;
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

// MODULE JOUEUR: PROFIL & STATS (INVENTAIRE VERROUILLÉ)
function renderPlayerStats(container, p) {
    // 1. En-tête "Juicy" (Avatar + Ressources)
    const header = document.createElement('div');
    header.className = 'profile-header';
    header.innerHTML = `
        <img src="${p.avatar}" class="profile-avatar" onerror="this.onerror=null;this.src='https://cdn-icons-png.flaticon.com/512/147/147144.png'">
        <div class="profile-name">${p.name}</div>
        <div class="resource-row">
            <div class="res-pill">
                <div class="res-icon" style="background:#ffbd2e; color:#5c4300">💰</div>
                <span style="color:#ffbd2e">${p.gold}</span>
            </div>
            <div class="res-pill">
                <div class="res-icon" style="background:#d6308e; color:white">💧</div>
                <span style="color:#ff8dc7">${p.elixir}</span>
            </div>
        </div>
        <div style="margin-top:10px; font-size:0.8rem; font-style:italic; opacity:0.8">
            ${p.desc || 'Un héros sans histoire...'}
        </div>
    `;
    container.appendChild(header);

    // 2. Corps du tableau de bord
    const dashboard = document.createElement('div');
    dashboard.className = 'player-dashboard';
    
    // --- INVENTAIRE (LECTURE SEULE) ---
    dashboard.innerHTML += `<h3 style="color:var(--cr-wood); margin-top:20px;">🎒 Inventaire</h3>`;
    
    const invInput = document.createElement('textarea');
    invInput.className = 'inventory-box';
    // On met un message par défaut si vide
    invInput.value = p.inventory || 'Votre sac est vide.';
    
    // --- CHANGEMENTS ICI ---
    invInput.readOnly = true; // Bloque l'écriture
    // Style visuel pour montrer que c'est verrouillé
    invInput.style.backgroundColor = '#e6e6e6'; 
    invInput.style.color = '#555';
    invInput.style.cursor = 'default';
    invInput.style.outline = 'none';
    // -----------------------
    
    dashboard.appendChild(invInput);

    // --- DECK INTERACTIF (Reste inchangé) ---
    dashboard.innerHTML += `
        <h3 style="color:var(--cr-blue); margin-top:10px;">⚔️ Deck de Combat</h3>
        <p class="play-hint">Clique sur une carte pour la jouer dans le chat !</p>
    `;

    const deckGrid = document.createElement('div');
    deckGrid.className = 'card-grid player-deck';
    
    if(p.deck.length === 0) {
        deckGrid.innerHTML = '<p style="opacity:0.5; width:100%">Deck vide. Demande au MJ !</p>';
    } else {
        p.deck.forEach(cardId => {
            const c = gameData.cards.find(x => x.id === cardId);
            if(c) {
                const el = document.createElement('div');
                el.className = 'clash-card';
                el.innerHTML = `
                    <div class="cost">${c.cost}</div>
                    <img src="${c.img}" onerror="this.onerror=null;this.src='https://placehold.co/100x120?text=?'">
                    <h4>${c.name}</h4>
                `;
                
                // Interaction: Jouer la carte
                el.onclick = () => {
                    if(confirm(`Utiliser la carte "${c.name}" ?\nCela l'affichera dans le chat.`)) {
                        playCardAction(p.name, c);
                    }
                };
                
                deckGrid.appendChild(el);
            }
        });
    }
    dashboard.appendChild(deckGrid);
    
    container.appendChild(dashboard);
}

// Fonction pour "Jouer" une carte (Envoyer dans le chat)
function playCardAction(playerName, card) {
    // On construit un message HTML spécial
    const cardHtml = `
        <div style="text-align:center; margin-top:5px; border:2px solid #333; border-radius:8px; overflow:hidden; background:white;">
            <img src="${card.img}" style="width:100%; height:100px; object-fit:cover; display:block;">
            <div style="padding:5px; background:#f0f0f0;">
                <strong style="color:var(--cr-blue-dark)">${card.name}</strong><br>
                <small>${card.desc}</small>
            </div>
        </div>
    `;

    gameData.chat.push({
        id: generateId(),
        sender: playerName,
        senderId: currentUser.id, // Important pour le styling
        text: `⚔️ Je lance <b>${card.name}</b> ! ${cardHtml}`,
        target: 'global',
        timestamp: new Date().toISOString()
    });
    saveData();
    
    // Petit feedback visuel : on bascule sur l'onglet chat
    switchTab(currentUser.role === 'dm' ? 'chat' : 'p-chat', currentUser.role);
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

// --- GESTIONNAIRE DE DECK (MJ) ---
function openDeckManager(player) {
    const modal = document.getElementById('modal-form');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');
    
    document.getElementById('form-title').innerText = `Deck de ${player.name}`;
    saveBtn.style.display = 'none'; // Pas de bouton save, c'est instantané
    modal.style.display = 'flex';

    // Fonction interne pour rafraîchir l'affichage sans fermer la modale
    const renderManager = () => {
        container.innerHTML = '';

        // 1. DECK ACTUEL (Ce que le joueur possède)
        const currentSection = document.createElement('div');
        currentSection.innerHTML = '<h4 style="margin:0 0 5px 0; color:var(--cr-blue)">Possédé (Cliquer pour retirer)</h4>';
        const currentList = document.createElement('div');
        currentList.className = 'deck-manager-section mini-card-grid';
        
        if (player.deck.length === 0) {
            currentList.innerHTML = '<p style="font-size:0.8rem; color:#888; width:100%">Inventaire vide.</p>';
        } else {
            player.deck.forEach((cardId, index) => {
                const card = gameData.cards.find(c => c.id === cardId);
                if (card) {
                    const el = document.createElement('div');
                    el.className = 'mini-card';
                    el.style.borderColor = 'red'; // Indique suppression
                    el.innerHTML = `
                        <img src="${card.img}" onerror="this.onerror=null;this.src='https://placehold.co/50'">
                        <div>${card.name}</div>
                        <div class="action-overlay" style="background:rgba(255,0,0,0.3)">✖</div>
                    `;
                    el.onclick = () => {
                        player.deck.splice(index, 1); // Retire la carte
                        saveData(); // Sauvegarde temps réel
                        renderManager(); // Rafraîchit la vue
                    };
                    currentList.appendChild(el);
                }
            });
        }
        currentSection.appendChild(currentList);
        container.appendChild(currentSection);

        // 2. BIBLIOTHÈQUE (Ce qu'on peut donner)
        const librarySection = document.createElement('div');
        librarySection.innerHTML = '<h4 style="margin:10px 0 5px 0; color:green">Ajouter (Cliquer pour donner)</h4>';
        const libraryList = document.createElement('div');
        libraryList.className = 'deck-manager-section mini-card-grid';
        
        gameData.cards.forEach(card => {
            const el = document.createElement('div');
            el.className = 'mini-card';
            el.style.borderColor = 'green';
            el.innerHTML = `
                <img src="${card.img}" onerror="this.onerror=null;this.src='https://placehold.co/50'">
                <div>${card.name}</div>
                <div class="action-overlay" style="background:rgba(0,255,0,0.3)">➕</div>
            `;
            el.onclick = () => {
                player.deck.push(card.id); // Ajoute l'ID
                saveData(); // Sauvegarde temps réel (déclenchera l'anim chez le joueur)
                renderManager(); // Rafraîchit
            };
            libraryList.appendChild(el);
        });
        
        librarySection.appendChild(libraryList);
        container.appendChild(librarySection);
    };

    renderManager(); // Premier affichage

    // Reset du bouton save à la fermeture
    modal.querySelector('.close-form').onclick = () => {
        saveBtn.style.display = 'inline-block';
        modal.style.display = 'none';
    };
}

// Remplace la fonction updateLocalData existante
function updateLocalData(newData) {
    console.log("📥 Données reçues via Realtime"); // Log pour vérifier

    // Détection pour le Joueur : Est-ce que mon deck a grandi ?
    if (currentUser.role === 'player') {
        const meNew = newData.players.find(p => p.id === currentUser.id);
        
        // Sécurité : on s'assure que prevDeckSize est initialisé
        if (typeof prevDeckSize === 'undefined') prevDeckSize = meNew ? meNew.deck.length : 0;

        if (meNew && meNew.deck.length > prevDeckSize) {
            console.log("🎁 NOUVELLE CARTE DÉTECTÉE !");
            // On récupère la dernière carte ajoutée
            const newCardId = meNew.deck[meNew.deck.length - 1];
            triggerChestAnimation(newCardId);
        }
        
        // Mise à jour de la taille de référence pour la prochaine fois
        if (meNew) prevDeckSize = meNew.deck.length;
    }

    gameData = newData;
    render(); // Met à jour l'affichage (Deck, Or, etc.)
}

// Remplace la fonction triggerChestAnimation existante
function triggerChestAnimation(newCardId) {
    const overlay = document.getElementById('chest-overlay');
    const display = document.getElementById('new-card-display');
    
    const card = gameData.cards.find(c => c.id === newCardId);
    
    if(!card) return;

    display.innerHTML = `
        <div class="clash-card" style="transform: scale(1.1); box-shadow: 0 0 30px white; margin: 0 auto; background: white;">
            <div class="cost">${card.cost}</div>
            <img src="${card.img}" onerror="this.onerror=null;this.src='https://placehold.co/100x120?text=?'">
            <h4>${card.name}</h4>
        </div>
        <p style="color:#ffd700; text-shadow:0 2px 0 black; line-height:1.4;">
            Vous avez obtenu :<br><strong style="font-size:1.2rem; text-transform:uppercase">${card.name}</strong>
        </p>
    `;
    
    overlay.classList.remove('hidden');
    
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 5000);
    
    overlay.onclick = () => overlay.classList.add('hidden');
}
