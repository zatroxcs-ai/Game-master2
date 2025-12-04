import { initialGameData, generateId, formatTime } from './data.js';
import { joinSession, createSession, syncGameData } from './cloud.js';

// --- CONFIGURATION DES ASSETS ---
const LOCAL_ASSETS = [

    // --- TES IMAGES PERSO (Ne pas effacer) ---

    './assets/map.png',

    './assets/enfers.png',



    // --- COMMUNES (COMMONS) ---

    './assets/cards/arrows.png',

    './assets/cards/bomber.png',

    './assets/cards/archers.png',

    './assets/cards/knight.png',

    './assets/cards/goblins.png',

    './assets/cards/spear-goblins.png',

    './assets/cards/skeletons.png',

    './assets/cards/minions.png',

    './assets/cards/cannon.png',

    './assets/cards/barbarians.png',

    './assets/cards/tesla.png',

    './assets/cards/minion-horde.png',

    './assets/cards/zap.png',

    './assets/cards/mortar.png',

    './assets/cards/fire-spirit.png',

    './assets/cards/ice-spirit.png',

    './assets/cards/bats.png',

    './assets/cards/goblin-gang.png',

    './assets/cards/skeleton-barrel.png',

    './assets/cards/giant-snowball.png',

    './assets/cards/rascals.png',

    './assets/cards/royal-giant.png',

    './assets/cards/elite-barbarians.png',

    './assets/cards/royal-recruits.png',

    './assets/cards/electro-spirit.png',

    './assets/cards/firecracker.png',

    './assets/cards/royal-delivery.png',

    './assets/cards/skeleton-dragons.png',

    './assets/cards/goblin-giant.png', // Parfois Rare/Epic selon versions, check fichier



    // --- RARES ---

    './assets/cards/fireball.png',

    './assets/cards/mini-pekka.png',

    './assets/cards/musketeer.png',

    './assets/cards/giant.png',

    './assets/cards/goblin-hut.png',

    './assets/cards/valkyrie.png',

    './assets/cards/tombstone.png',

    './assets/cards/bomb-tower.png',

    './assets/cards/rocket.png',

    './assets/cards/barbarian-hut.png',

    './assets/cards/hog-rider.png',

    './assets/cards/inferno-tower.png',

    './assets/cards/wizard.png',

    './assets/cards/elixir-collector.png',

    './assets/cards/mega-minion.png',

    './assets/cards/ice-golem.png',

    './assets/cards/dart-goblin.png',

    './assets/cards/battle-ram.png',

    './assets/cards/flying-machine.png',

    './assets/cards/zappies.png',

    './assets/cards/royal-hogs.png',

    './assets/cards/earthquake.png',

    './assets/cards/elixir-golem.png',

    './assets/cards/battle-healer.png',

    './assets/cards/goblin-cage.png',

    './assets/cards/heal-spirit.png',

    './assets/cards/three-musketeers.png',



    // --- ÉPIQUES (EPICS) ---

    './assets/cards/prince.png',

    './assets/cards/baby-dragon.png',

    './assets/cards/skeleton-army.png',

    './assets/cards/witch.png',

    './assets/cards/lightning.png',

    './assets/cards/goblin-barrel.png',

    './assets/cards/giant-skeleton.png',

    './assets/cards/balloon.png',

    './assets/cards/rage.png', // Ou rage.png selon le pack

    './assets/cards/rage.png',

    './assets/cards/x-bow.png',

    './assets/cards/freeze.png',

    './assets/cards/pekka.png',

    './assets/cards/poison.png',

    './assets/cards/mirror.png',

    './assets/cards/golem.png',

    './assets/cards/the-log.png', // Souvent log.png ou the-log.png

    './assets/cards/tornado.png',

    './assets/cards/clone.png',

    './assets/cards/dark-prince.png',

    './assets/cards/guards.png',

    './assets/cards/hunter.png',

    './assets/cards/executioner.png',

    './assets/cards/cannon-cart.png',

    './assets/cards/electro-dragon.png',

    './assets/cards/wall-breakers.png',

    './assets/cards/goblin-drill.png',

    './assets/cards/electro-giant.png',

    './assets/cards/barbarian-barrel.png',

    './assets/cards/bowler.png',

    './assets/cards/void.png',



    // --- LÉGENDAIRES (LEGENDARIES) ---

    './assets/cards/ice-wizard.png',

    './assets/cards/princess.png',

    './assets/cards/miner.png',

    './assets/cards/sparky.png',

    './assets/cards/lava-hound.png',

    './assets/cards/electro-wizard.png',

    './assets/cards/inferno-dragon.png',

    './assets/cards/lumberjack.png',

    './assets/cards/graveyard.png',

    './assets/cards/bandit.png',

    './assets/cards/night-witch.png',

    './assets/cards/magic-archer.png',

    './assets/cards/mother-witch.png',

    './assets/cards/royal-ghost.png',

    './assets/cards/fisherman.png',

    './assets/cards/mega-knight.png',

    './assets/cards/ram-rider.png',

    './assets/cards/phoenix.png',



    // --- CHAMPIONS ---

    './assets/cards/golden-knight.png',

    './assets/cards/skeleton-king.png',

    './assets/cards/archer-queen.png',

    './assets/cards/mighty-miner.png',

    './assets/cards/monk.png',

    './assets/cards/little-prince.png'

];

// --- STATE LOCAL ---
let gameData = JSON.parse(JSON.stringify(initialGameData));
let currentUser = { role: 'guest', id: null };
let currentTab = 'map';
let prevDeckSize = 0;
let selectedEntityId = null;
let currentFormCallback = null;
let isFirstLoad = true;
let selectedRelCharId = null;

function findEntityById(id) {
    return gameData.players.find(p => p.id === id) || gameData.npcs.find(n => n.id === id);
}

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
    document.getElementById('btn-create-dm').addEventListener('click', async () => {
        const sid = document.getElementById('session-input').value;
        if(!sid) return alert('Entrez un nom de session');
        gameData = JSON.parse(JSON.stringify(initialGameData));
        const success = await createSession(sid, gameData);
        if(success) { currentUser = { role: 'dm', id: 'dm' }; enterGame(sid); } 
        else { alert('Session existe déjà ou erreur DB'); }
    });

    document.getElementById('btn-join-dm').addEventListener('click', async () => {
        const sid = document.getElementById('session-input').value;
        if(!sid) return alert('Entrez un nom de session');
        currentUser = { role: 'dm', id: 'dm' };
        await connectToSession(sid);
    });

    document.querySelectorAll('#dm-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab, 'dm'));
    });
    document.querySelectorAll('#player-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(e.currentTarget.dataset.tab, 'player');
        });
    });

    document.getElementById('btn-show-qr').addEventListener('click', showQRCode);
    document.querySelector('.close-modal').addEventListener('click', () => {
        document.getElementById('modal-qr').style.display = 'none';
    });
}

async function connectToSession(sid) {
    const exists = await joinSession(sid, (newData) => { updateLocalData(newData); });
    if (exists) { enterGame(sid); } else { alert("Session introuvable"); }
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
        currentTab = 'p-stats';
        document.querySelectorAll('#player-nav button').forEach(b => b.classList.remove('active'));
        const statBtn = document.querySelector('#player-nav button[data-tab="p-stats"]');
        if(statBtn) statBtn.classList.add('active');
    }
    render();
}

function saveData(actionLog = null) {
    if (actionLog) gameData.logs.unshift({ text: actionLog, timestamp: new Date().toISOString() });
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

function openFormModal(title, fields, onSave) {
    const modal = document.getElementById('modal-form');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');

    saveBtn.style.display = 'inline-block';
    saveBtn.innerText = 'Sauvegarder';
    document.getElementById('form-title').innerText = title;
    container.innerHTML = '';

    fields.forEach(f => {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `<label>${f.label}</label>`;

        if (f.type === 'select') {
            const input = document.createElement('select');
            input.id = `field-${f.name}`;
            f.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value; o.innerText = opt.label;
                if(opt.value === f.value) o.selected = true;
                input.appendChild(o);
            });
            div.appendChild(input);
        } else if (f.type === 'textarea') {
            const input = document.createElement('textarea');
            input.id = `field-${f.name}`; input.rows = 3; input.value = f.value || '';
            div.appendChild(input);
        } else if (f.type === 'image' || ['avatar', 'url', 'img', 'image'].includes(f.name)) {
            const wrapper = document.createElement('div');
            wrapper.className = 'img-input-row';
            const thumb = document.createElement('img');
            thumb.className = 'img-preview-thumb';
            thumb.src = f.value || 'https://placehold.co/40';
            thumb.onerror = function(){ this.src='https://placehold.co/40?text=?'; };
            const input = document.createElement('input');
            input.type = 'text'; input.id = `field-${f.name}`; input.value = f.value || '';
            input.style.flex = "1";
            input.oninput = () => thumb.src = input.value;
            const btnPick = document.createElement('button');
            btnPick.className = 'btn btn-secondary'; btnPick.innerText = '📂';
            btnPick.onclick = (e) => {
                e.preventDefault();
                openAssetPicker((url) => { input.value = url; thumb.src = url; });
            };
            wrapper.append(thumb, input, btnPick);
            div.appendChild(wrapper);
        } else {
            const input = document.createElement('input');
            input.id = `field-${f.name}`; input.type = f.type || 'text'; input.value = f.value || '';
            div.appendChild(input);
        }
        container.appendChild(div);
    });

    currentFormCallback = onSave;
    modal.style.display = 'flex';
    modal.querySelector('.close-form').onclick = () => modal.style.display = 'none';
    saveBtn.onclick = () => {
        const result = {};
        fields.forEach(f => { result[f.name] = document.getElementById(`field-${f.name}`).value; });
        currentFormCallback(result);
        modal.style.display = 'none';
    };
}

function openAssetPicker(onSelect) {
    const modal = document.getElementById('asset-picker');
    const grid = document.getElementById('asset-grid');
    grid.innerHTML = '';
    LOCAL_ASSETS.forEach(url => {
        const item = document.createElement('div');
        item.className = 'asset-item';
        item.innerHTML = `<img src="${url}" onerror="this.src='https://placehold.co/50'"><div class="asset-name">${url.split('/').pop()}</div>`;
        item.onclick = () => { onSelect(url); modal.style.display = 'none'; };
        grid.appendChild(item);
    });
    modal.style.display = 'flex';
}

function render() {
    if (currentUser.role === 'dm') renderDM();
    else renderPlayer();
}

function renderDM() {
    if (!gameData.resourceTypes) {
        gameData.resourceTypes = [
            { id: 'gold', name: 'Or', icon: '💰', color: '#ffbd2e', max: 999999 },
            { id: 'elixir', name: 'Élixir', icon: '💧', color: '#d6308e', max: 99 }
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
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab, 'dm'));
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
    if (!me) return container.innerHTML = '<p style="color:white;text-align:center;padding-top:50px;">Personnage introuvable.</p>';

    if (currentTab === 'p-stats') renderPlayerStats(container, me);
    else if (currentTab === 'p-map') renderMapModule(container, false);
    else if (currentTab === 'p-chat') renderChatModule(container);
    else if (currentTab === 'p-quests') renderPlayerQuests(container, me);
    else if (currentTab === 'p-journal') renderJournalModule(container);
}

// --- MODULES ---
function renderMapModule(container, isEditable) {
    if (!gameData.maps) { gameData.maps = [{ id: 'default', name: 'Principale', url: './assets/map.png', desc: 'Défaut' }]; gameData.activeMapId = 'default'; }
    let currentMap = gameData.maps.find(m => m.id === gameData.activeMapId) || gameData.maps[0];
    if(!currentMap || !currentMap.url) currentMap = { url: './assets/map.png', name: 'Défaut', id: 'default' };

    const wrapper = document.createElement('div');
    wrapper.className = 'map-container';
    wrapper.style.backgroundColor = '#222';
    
    if (currentMap.weather && currentMap.weather !== 'none') {
        const w = document.createElement('div'); w.className = `weather-layer fx-${currentMap.weather}`; wrapper.appendChild(w);
    }
    const img = document.createElement('img'); img.src = currentMap.url; img.className = 'map-img';
    wrapper.appendChild(img);

    if (isEditable) {
        const btnManage = document.createElement('button');
        btnManage.className = 'btn btn-secondary'; btnManage.innerHTML = '🗺️ Atlas';
        btnManage.style.cssText = 'position:absolute; top:10px; left:10px; z-index:50;';
        btnManage.onclick = () => openMapManager();
        wrapper.appendChild(btnManage);

        wrapper.addEventListener('click', (e) => {
            if(e.target.tagName === 'BUTTON') return;
            if (selectedEntityId) {
                let entity = findEntityById(selectedEntityId);
                if (entity && entity.mapId === currentMap.id) {
                    const rect = wrapper.getBoundingClientRect();
                    entity.x = ((e.clientX - rect.left) / rect.width) * 100;
                    entity.y = ((e.clientY - rect.top) / rect.height) * 100;
                    syncGameData(gameData); render();
                }
            }
        });
    }

    [...gameData.players, ...gameData.npcs].forEach(entity => {
        if (!entity.mapId) entity.mapId = 'default';
        if (entity.mapId !== currentMap.id) return;
        const p = document.createElement('div');
        p.className = 'pawn';
        p.style.left = entity.x + '%'; p.style.top = entity.y + '%';
        p.style.backgroundImage = `url(${entity.avatar})`;
        if (selectedEntityId === entity.id) { p.style.borderColor = 'var(--cr-gold)'; p.style.zIndex = 100; }
        if (isEditable) { p.onclick = (e) => { e.stopPropagation(); selectedEntityId = entity.id; render(); }; }
        const l = document.createElement('div'); l.className = 'pawn-label'; l.innerText = entity.name;
        p.appendChild(l); wrapper.appendChild(p);
    });
    container.appendChild(wrapper);
}

// --- ATLAS & MÉTÉO (CORRIGÉ : MULTI-MODIF) ---
function openMapManager() {
    const modal = document.getElementById('modal-form');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');
    document.getElementById('form-title').innerText = 'Atlas';
    saveBtn.style.display = 'none';

    const renderList = () => {
        container.innerHTML = '<div style="margin-bottom:15px"><button id="btn-new-map" class="btn btn-primary">+ Nouvelle Carte</button></div>';
        container.querySelector('#btn-new-map').onclick = () => {
            modal.style.display = 'none';
            openFormModal('Nouvelle Carte', [{name:'name', label:'Nom'}, {name:'url', label:'Image', type:'image'}, {name:'weather', label:'Météo', type:'select', options:[{value:'none',label:'Soleil'}]}], (d) => {
                gameData.maps.push({id:generateId(), name:d.name, url:d.url, weather:d.weather});
                saveData(); setTimeout(openMapManager, 100);
            });
        };
        const list = document.createElement('div');
        list.style.maxHeight = '400px'; list.style.overflowY = 'auto';

        gameData.maps.forEach(m => {
            const isActive = m.id === gameData.activeMapId;
            const row = document.createElement('div');
            row.className = 'panel'; row.style.display='flex'; row.style.justifyContent='space-between'; row.style.marginBottom='10px';
            if(isActive) row.style.background = '#e3f2fd';
            
            // Partie Gauche
            const leftDiv = document.createElement('div');
            leftDiv.innerHTML = `<strong>${m.name}</strong> ${isActive?'✅':''}`;
            row.appendChild(leftDiv);

            // Partie Droite
            const actions = document.createElement('div');
            actions.style.display = 'flex'; actions.style.gap = '5px';
            
            // --- FIX MULTI-MODIF : Selecteur qui ne ferme pas la modale ---
            const sel = document.createElement('select');
            sel.style.width='auto'; sel.style.padding='2px'; sel.style.fontSize='0.8rem';
            ['none','rain','snow','fog','night','sepia'].forEach(w => {
                const o = document.createElement('option'); o.value=w; o.innerText=w; if(m.weather===w) o.selected=true; sel.appendChild(o);
            });
            sel.onchange = (e) => { 
                m.weather = e.target.value; 
                saveData(); // Sauvegarde en background
                // On ne rappelle PAS openMapManager() pour ne pas perdre le focus
            };
            
            if(!isActive) {
                const loadBtn = document.createElement('button'); loadBtn.innerText = 'Charger'; loadBtn.className='btn btn-primary'; loadBtn.style.padding='2px 5px'; loadBtn.style.fontSize='0.7rem';
                loadBtn.onclick = () => { gameData.activeMapId = m.id; gameData.config.mapUrl = m.url; saveData(); renderList(); };
                actions.appendChild(loadBtn);
            }
            
            const delBtn = document.createElement('button'); delBtn.innerText = '🗑️'; delBtn.className='btn'; delBtn.style.background='red'; delBtn.style.padding='2px 5px'; delBtn.style.fontSize='0.7rem';
            delBtn.onclick = () => {
                if(gameData.maps.length<=1) return alert("Gardez une carte");
                if(confirm('Supprimer ?')) { gameData.maps = gameData.maps.filter(x=>x.id!==m.id); saveData(); renderList(); }
            };

            actions.prepend(sel); actions.appendChild(delBtn); row.appendChild(actions); list.appendChild(row);
        });
        container.appendChild(list);
    };
    renderList();
    modal.style.display = 'flex';
    modal.querySelector('.close-form').onclick = () => { modal.style.display = 'none'; saveBtn.style.display = 'inline-block'; render(); };
}

function renderPlayersModule(container) {
    container.innerHTML = `
        <div style="margin-bottom:15px; display:flex; gap:10px;">
            <button id="btn-add-p" class="btn btn-primary" style="flex:1">+ Personnage</button>
            <button id="btn-manage-res" class="btn btn-secondary">💎 Ressources</button>
        </div>
    `;
    
    document.getElementById('btn-manage-res').onclick = () => openResourceManager();
    document.getElementById('btn-add-p').onclick = () => {
        // --- FIX KING.PNG : J'ai mis knight.png par défaut ---
        openFormModal('Nouveau', [{name:'name', label:'Nom'}, {name:'type', label:'Type', type:'select', options:[{value:'player',label:'Joueur'},{value:'npc',label:'PNJ'}]}, {name:'avatar', label:'Avatar', type:'image', value:'./assets/cards/knight.png'}], (d) => {
            const nc = {id:generateId(), name:d.name, avatar:d.avatar, type:d.type, deck:[], x:50, y:50};
            if(d.type==='player') gameData.players.push(nc); else gameData.npcs.push(nc);
            saveData(`Création de ${data.name}`);
        });
    };
    
    const list = document.createElement('div');
    const sortFrench = (a, b) => (a.name||'').toLowerCase().localeCompare((b.name||'').toLowerCase(), 'fr');
    
    [...gameData.players, ...gameData.npcs].sort(sortFrench).forEach(p => {
        const row = document.createElement('div'); row.className = 'panel'; row.style.marginBottom='10px'; row.style.display='flex'; row.style.alignItems='center'; row.style.gap='10px';
        row.innerHTML = `
            <img src="${p.avatar}" onerror="this.src='./assets/cards/knight.png'" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
            <div style="flex:1; text-align:left;"><strong>${p.name}</strong></div>
            <div style="display:flex; gap:5px;">
                <button class="btn" style="padding:5px 10px; font-size:0.8rem; background:#7c4dff;" id="deck-${p.id}">🎴</button>
                <button class="btn" style="padding:5px 10px; font-size:0.8rem; background:red;" id="del-${p.id}">🗑️</button>
            </div>
        `;
        
        row.querySelector(`#deck-${p.id}`).onclick = () => openDeckManager(p);
        row.querySelector(`#del-${p.id}`).onclick = () => { if(confirm('Suppr?')) { 
            gameData.players = gameData.players.filter(x=>x.id!==p.id); 
            gameData.npcs = gameData.npcs.filter(x=>x.id!==p.id); 
            saveData(); 
        }};
        list.appendChild(row);
    });
    container.appendChild(list);
}

// 3. CHAT (VOTRE VERSION AVANCÉE INCHANGÉE)
function renderChatModule(container) {
    const wrapper = document.createElement('div'); wrapper.className = 'chat-window';
    const messages = document.createElement('div'); messages.className = 'chat-messages';
    
    gameData.chat.forEach(msg => {
        const targetId = msg.target || 'global';
        const myId = currentUser.role === 'dm' ? 'dm' : currentUser.id;
        const senderId = msg.senderId || 'inconnu';
        const shouldShow = (targetId === 'global') || (senderId === myId) || (targetId === myId);
        if (!shouldShow) return;

        const isSelf = senderId === myId;
        const isWhisper = targetId !== 'global';
        const isDice = msg.text.startsWith('🎲');
        
        const div = document.createElement('div');
        div.className = `message ${isSelf ? 'self' : ''}`;
        let bubbleStyle = '';
        let prefix = '';

        if (isWhisper) {
            bubbleStyle = 'background:#e0c3fc; color:#4a148c; border:1px solid #7c4dff;'; 
            if(isSelf) {
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
        if (isDice) bubbleStyle = 'background:#ffbd2e; color:black; font-weight:bold; border:2px solid black';

        div.innerHTML = `<small>${isSelf ? 'Moi' : msg.sender} - ${formatTime(msg.timestamp)}</small><div class="bubble" style="${bubbleStyle}">${prefix}${msg.text}</div>`;
        messages.appendChild(div);
    });
    
    const controls = document.createElement('div');
    controls.style.padding = '10px'; controls.style.background = '#ddd'; controls.style.borderTop = '2px solid white';

    const diceBar = document.createElement('div');
    diceBar.style.marginBottom = '5px'; diceBar.style.display = 'flex'; diceBar.style.gap = '5px';
    ['d6', 'd20', 'd100'].forEach(type => {
        const btn = document.createElement('button'); btn.className = 'btn';
        btn.style.padding = '2px 8px'; btn.style.fontSize = '0.7rem'; btn.style.background = 'white'; btn.style.color = '#333';
        btn.innerText = type;
        btn.onclick = () => {
            const max = parseInt(type.substring(1));
            const result = Math.floor(Math.random() * max) + 1;
            sendMessage(`🎲 ${type} : ${result}`, true);
        };
        diceBar.appendChild(btn);
    });

    const inputRow = document.createElement('div');
    inputRow.style.display = 'flex'; inputRow.style.gap = '5px';

    const select = document.createElement('select');
    select.id = 'chat-target'; select.style.maxWidth = '100px';
    select.innerHTML = '<option value="global">📢 Global</option>';
    if(currentUser.role !== 'dm') select.innerHTML += '<option value="dm">👑 MJ</option>';
    gameData.players.forEach(p => {
        if(p.id !== currentUser.id) select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });

    const input = document.createElement('input');
    input.type = 'text'; input.id = 'chat-input'; input.style.flex = '1'; input.placeholder = 'Message...';
    input.onkeydown = (e) => { if(e.key === 'Enter') confirmSend(); };

    const btnSend = document.createElement('button');
    btnSend.className = 'btn btn-primary'; btnSend.innerText = 'Envoyer';
    btnSend.onclick = () => confirmSend();

    inputRow.append(select, input, btnSend);
    controls.append(diceBar, inputRow);
    wrapper.append(messages, controls);
    container.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;

    function confirmSend() {
        const txt = input.value;
        if(txt) { sendMessage(txt, false); input.value = ''; }
    }

    function sendMessage(text, isDice) {
        const target = select.value;
        const myId = currentUser.role === 'dm' ? 'dm' : currentUser.id;
        const senderName = currentUser.role === 'dm' ? 'MJ' : gameData.players.find(p => p.id === currentUser.id)?.name || 'Inconnu';
        gameData.chat.push({
            id: generateId(),
            sender: senderName, senderId: myId,
            text: text, target: target,
            timestamp: new Date().toISOString()
        });
        saveData();
    }
}

function renderCardsModule(container) {
    container.innerHTML = '<button id="btn-add-card" class="btn btn-secondary" style="margin-bottom:15px">+ Créer Carte</button>';
    document.getElementById('btn-add-card').onclick = () => {
        openFormModal('Nouvelle Carte', [{name:'name', label:'Nom'}, {name:'cost', label:'Coût', type:'number'}, {name:'img', label:'Image', type:'image'}], (d) => {
            gameData.cards.push({id:generateId(), name:d.name, cost:d.cost, img:d.img}); saveData();
        });
    };
    const grid = document.createElement('div'); grid.className = 'card-grid';
    gameData.cards.forEach(c => {
        const el = document.createElement('div'); el.className = 'clash-card';
        el.innerHTML = `<div class="cost">${c.cost}</div><img src="${c.img}"><h4>${c.name}</h4>`;
        el.onclick = () => {
             openFormModal('Modif', [{name:'name', label:'Nom', value:c.name}, {name:'cost', label:'Coût', value:c.cost}, {name:'img', label:'Img', value:c.img, type:'image'}], (d) => {
                 c.name=d.name; c.cost=d.cost; c.img=d.img; saveData();
             });
        }
        grid.appendChild(el);
    });
    container.appendChild(grid);
}

// 5. RELATIONS (VOTRE VERSION AVANCÉE INCHANGÉE)
function renderRelationsModule(container) {
    if (!gameData.relations) gameData.relations = [];
    const players = gameData.players || [];
    const npcs = gameData.npcs || [];
    const allEntities = [...players, ...npcs];

    if(allEntities.length < 2) return container.innerHTML = '<div class="panel">Il faut au moins 2 personnages.</div>';
    if (!selectedRelCharId || !allEntities.find(e => e.id === selectedRelCharId)) selectedRelCharId = allEntities[0].id;
    const selectedEntity = allEntities.find(e => e.id === selectedRelCharId);

    container.innerHTML = `<h2 style="color:var(--cr-blue-dark); text-align:center;">Réseau d'Influence</h2><div style="text-align:center; font-weight:bold; margin-bottom:10px; color:#3498db">${selectedEntity.name}</div>`;

    const createAvatar = (e) => {
        const img = document.createElement('img');
        img.src = e.avatar;
        img.className = `rel-avatar-select ${e.id === selectedRelCharId ? 'active' : ''}`;
        img.onclick = () => { selectedRelCharId = e.id; renderRelationsModule(container); };
        return img;
    };

    if (players.length > 0) {
        const d = document.createElement('div'); d.className = 'rel-selector';
        players.forEach(p => d.appendChild(createAvatar(p)));
        container.appendChild(d);
    }
    if (npcs.length > 0) {
        const d = document.createElement('div'); d.className = 'rel-selector';
        npcs.forEach(n => d.appendChild(createAvatar(n)));
        container.appendChild(d);
    }

    const board = document.createElement('div'); board.className = 'rel-board'; board.style.marginTop = "20px";
    const cols = { friendly: { title: '💚 Alliés', color: '#28a745', list: [] }, neutral: { title: '😐 Neutres', color: '#6c757d', list: [] }, hostile: { title: '❤️ Ennemis', color: '#dc3545', list: [] } };

    allEntities.forEach(target => {
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
        colData.list.forEach(char => {
            const card = document.createElement('div'); card.className = 'rel-card'; card.style.borderLeftColor = colData.color;
            let icon = char.realStatus === 'friendly' ? '🙂' : (char.realStatus === 'hostile' ? '😡' : '😐');
            card.innerHTML = `<img src="${char.avatar}"> <div style="flex:1"><strong>${char.name}</strong></div> <div>${icon}</div>`;
            if(currentUser.role === 'dm') {
                card.onclick = () => {
                    const states = ['neutral', 'friendly', 'hostile', 'ally'];
                    const nextStatus = states[(states.indexOf(char.realStatus) + 1) % states.length];
                    const existingIndex = gameData.relations.findIndex(r => r.source === selectedRelCharId && r.target === char.id);
                    if (existingIndex >= 0) gameData.relations[existingIndex].status = nextStatus;
                    else gameData.relations.push({ source: selectedRelCharId, target: char.id, status: nextStatus });
                    saveData();
                };
            }
            colDiv.appendChild(card);
        });
        board.appendChild(colDiv);
    });
    container.appendChild(board);
}

// 6. QUÊTES (VOTRE VERSION AVANCÉE INCHANGÉE)
function renderQuestsModule(container) {
    container.innerHTML = '<div style="margin-bottom:20px; text-align:center"><button id="btn-new-quest" class="btn btn-secondary" style="width:100%">+ Nouvelle Quête</button></div>';
    document.getElementById('btn-new-quest').onclick = () => {
        if(gameData.players.length === 0) return alert("Créez d'abord des joueurs !");
        openQuestModal((data) => {
            gameData.quests.push({
                id: generateId(), title: data.title, desc: data.desc, reward: data.reward, giverId: data.giverId, assignedTo: data.assignedTo, status: 'active'
            });
            saveData(`Nouvelle quête : ${data.title}`);
        });
    };
    const list = document.createElement('div');
    gameData.quests.forEach((q, index) => {
        const assignedIds = Array.isArray(q.assignedTo) ? q.assignedTo : [q.assignedTo];
        const names = assignedIds.map(id => { const p = gameData.players.find(x => x.id === id); return p ? p.name : 'Inconnu'; }).join(', ');
        let giverImg = './assets/map.png';
        if (q.giverId && q.giverId !== 'board') {
            const npc = gameData.npcs.find(n => n.id === q.giverId);
            if (npc) giverImg = npc.avatar;
        }
        const card = document.createElement('div'); card.className = 'quest-card';
        card.innerHTML = `
            <img src="${giverImg}" class="quest-giver" onerror="this.src='https://placehold.co/60'">
            <div class="quest-info">
                <div style="float:right"><button class="btn" style="background:red; font-size:0.7rem; padding:4px 8px;" onclick="window.deleteQuest(${index})">X</button></div>
                <h4 class="quest-title">${q.title}</h4>
                <p class="quest-desc">${q.desc || ''}</p>
                <div style="display:flex; flex-direction:column; margin-top:5px; gap:5px;">
                    <span class="quest-reward" style="align-self:flex-start">🎁 ${q.reward}</span>
                    <small style="color:var(--cr-blue); font-weight:bold">👥 Pour : ${names}</small>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
    container.appendChild(list);
}
window.deleteQuest = (index) => { if(confirm('Supprimer cette quête ?')) { gameData.quests.splice(index, 1); saveData(); }};

function renderPlayerQuests(container, player) {
    const myQuests = gameData.quests.filter(q => {
        if (Array.isArray(q.assignedTo)) return q.assignedTo.includes(player.id);
        return q.assignedTo === player.id;
    });
    container.innerHTML = '<h2>Mes Quêtes</h2>';
    if (myQuests.length === 0) container.innerHTML += '<p style="text-align:center">Aucune mission.</p>';
    myQuests.forEach(q => {
        let giverImg = './assets/map.png';
        if (q.giverId && q.giverId !== 'board') {
            const npc = gameData.npcs.find(n => n.id === q.giverId);
            if (npc) giverImg = npc.avatar;
        }
        const card = document.createElement('div'); card.className = 'quest-card';
        card.innerHTML = `<img src="${giverImg}" class="quest-giver"><div class="quest-info"><h4 class="quest-title">${q.title}</h4><p class="quest-desc">${q.desc}</p><span class="quest-reward">💰 ${q.reward}</span></div>`;
        container.appendChild(card);
    });
}

// 7. JOURNAL (VOTRE VERSION AVANCÉE INCHANGÉE)
function renderJournalModule(container) {
    if (!gameData.journal) gameData.journal = [];
    if (currentUser.role === 'dm') {
        container.innerHTML = '<div style="margin-bottom:20px; text-align:center"><button id="btn-new-entry" class="btn btn-primary" style="width:100%">+ Nouveau Résumé</button></div>';
        document.getElementById('btn-new-entry').onclick = () => {
            openJournalModal('Nouveau Résumé', { title: '', date: new Date().toISOString().split('T')[0], content: '', participants: [] }, (data) => {
                gameData.journal.unshift({ id: generateId(), ...data });
                saveData();
            });
        };
    } else {
        container.innerHTML = '<h2>Chroniques</h2>';
    }
    const list = document.createElement('div');
    gameData.journal.forEach((entry, index) => {
        const entryDiv = document.createElement('div'); entryDiv.className = 'journal-entry';
        let avatarsHtml = '';
        if (entry.participants) entry.participants.forEach(pid => {
            const p = gameData.players.find(x => x.id === pid);
            if (p) avatarsHtml += `<img src="${p.avatar}" class="participant-badge">`;
        });
        entryDiv.innerHTML = `<div class="journal-header"><div style="display:flex;justify-content:space-between"><span class="journal-date">📅 ${entry.date}</span><div class="journal-participants">${avatarsHtml}</div></div><h3 class="journal-title">${entry.title}</h3></div><div class="journal-content">${entry.content}</div>`;
        if (currentUser.role === 'dm') {
            const actions = document.createElement('div'); actions.style.marginTop = '10px';
            const btnDel = document.createElement('button'); btnDel.className='btn'; btnDel.style.background='red'; btnDel.innerText='🗑️';
            btnDel.onclick = () => { if(confirm('Supprimer ?')) { gameData.journal.splice(index, 1); saveData(); }};
            actions.appendChild(btnDel); entryDiv.appendChild(actions);
        }
        list.appendChild(entryDiv);
    });
    container.appendChild(list);
}

function openJournalModal(title, initialData, onSave) {
    const modal = document.getElementById('modal-form');
    const contentBox = modal.querySelector('.modal-content'); contentBox.classList.add('modal-large');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');
    document.getElementById('form-title').innerText = title;
    container.innerHTML = ''; saveBtn.style.display = 'inline-block'; saveBtn.innerText = 'Sauvegarder';

    container.innerHTML += `<div style="display:flex; gap:10px;"><div style="flex:2"><label>Titre</label><input type="text" id="j-title" value="${initialData.title}"></div><div style="flex:1"><label>Date</label><input type="date" id="j-date" value="${initialData.date}"></div></div>`;
    let checksHtml = '<div class="checkbox-group">';
    gameData.players.forEach(p => {
        const isChecked = initialData.participants.includes(p.id) ? 'checked' : '';
        checksHtml += `<label class="checkbox-item"><input type="checkbox" class="j-part-check" value="${p.id}" ${isChecked}>${p.name}</label>`;
    });
    checksHtml += '</div>';
    container.innerHTML += `<div class="form-group"><label>Participants</label>${checksHtml}</div><div class="form-group" style="height:100%; display:flex; flex-direction:column;"><label>Récit</label><textarea id="j-content" style="flex:1; resize:none;">${initialData.content}</textarea></div>`;

    modal.style.display = 'flex';
    const closeModal = () => { contentBox.classList.remove('modal-large'); modal.style.display = 'none'; };
    modal.querySelector('.close-form').onclick = closeModal;
    saveBtn.onclick = () => {
        const selectedParticipants = [];
        document.querySelectorAll('.j-part-check:checked').forEach(box => selectedParticipants.push(box.value));
        onSave({ title: document.getElementById('j-title').value, date: document.getElementById('j-date').value, content: document.getElementById('j-content').value, participants: selectedParticipants });
        closeModal();
    };
}

// --- DECK MANAGER (CORRIGÉ & PERSISTANT : FIX MODAL QUI FIGE) ---
function openDeckManager(entityArg) {
    const modal = document.getElementById('modal-form');
    modal.querySelector('.modal-content').classList.add('modal-xl'); 
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');
    
    // IMPORTANT : On garde l'ID, pas l'objet, pour pouvoir le recharger
    const targetId = entityArg.id;
    
    saveBtn.style.display = 'none'; 
    modal.style.display = 'flex';

    // Fonction interne de rendu
    const renderManager = () => {
        // 1. On recharge les données fraîches depuis gameData à chaque appel
        const freshEntity = findEntityById(targetId);
        if (!freshEntity) return modal.style.display = 'none';

        document.getElementById('form-title').innerText = `Deck de ${freshEntity.name}`;
        container.innerHTML = ''; 

        const currentSection = document.createElement('div');
        currentSection.innerHTML = '<h4>Inventaire</h4>';
        const currentList = document.createElement('div');
        currentList.className = 'deck-manager-section mini-card-grid';
        if (!freshEntity.deck) freshEntity.deck = [];
        freshEntity.deck.forEach((cardId, index) => {
            const card = gameData.cards.find(c => c.id === cardId);
            if (card) {
                const el = document.createElement('div'); el.className = 'mini-card'; el.style.borderColor='red';
                el.innerHTML = `<img src="${card.img}">`;
                
                // Action : Supprimer
                el.onclick = () => { 
                    freshEntity.deck.splice(index, 1); 
                    saveData(); // Sauvegarde en background
                    renderManager(); // Re-render immédiat (sans fermer)
                };
                currentList.appendChild(el);
            }
        });
        currentSection.appendChild(currentList); container.appendChild(currentSection);

        const libSection = document.createElement('div');
        libSection.innerHTML = '<h4>Ajouter</h4>';
        const libList = document.createElement('div');
        libList.className = 'deck-manager-section mini-card-grid';
        gameData.cards.forEach(card => {
            const el = document.createElement('div'); el.className = 'mini-card'; el.style.borderColor='green';
            el.innerHTML = `<img src="${card.img}">`;
            
            // Action : Ajouter
            el.onclick = () => { 
                freshEntity.deck.push(card.id); 
                saveData(); // Sauvegarde en background
                renderManager(); // Re-render immédiat (sans fermer)
            };
            libList.appendChild(el);
        });
        libSection.appendChild(libList); container.appendChild(libSection);
    };
    
    // Premier appel
    renderManager();
    
    modal.querySelector('.close-form').onclick = () => {
        saveBtn.style.display = 'inline-block';
        modal.querySelector('.modal-content').classList.remove('modal-xl'); 
        modal.style.display = 'none';
        render(); // Render global à la fermeture
    };
}

function renderPlayerStats(container, p) {
    const header = document.createElement('div');
    header.className = 'mobile-profile-header';
    let resourcesHtml = '';
    if (gameData.resourceTypes) {
        gameData.resourceTypes.forEach(res => {
            const val = p[res.id] !== undefined ? p[res.id] : 0;
            resourcesHtml += `
                <div class="resource-pill">
                    <div style="width:20px; height:20px; background:${res.color||'#fff'}; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:5px; font-size:0.7rem;">${res.icon||'💎'}</div>
                    <span>${val}</span>
                </div>`;
        });
    }
    header.innerHTML = `
        <div style="position:relative; display:inline-block;">
            <img src="${p.avatar}" class="mobile-avatar" onerror="this.src='https://placehold.co/100'">
            <div style="position:absolute; bottom:-5px; right:-5px; background:#3498db; color:white; font-family:'Lilita One', sans-serif; padding:2px 6px; border-radius:6px; border:2px solid white; font-size:0.7rem;">NV.1</div>
        </div>
        <div class="mobile-name">${p.name}</div>
        <div style="display:flex; justify-content:center; flex-wrap:wrap; gap:5px; margin-top:5px;">${resourcesHtml}</div>
    `;
    container.appendChild(header);

    const invSection = document.createElement('div');
    invSection.innerHTML = `<h3 class="mobile-section-title">🎒 Inventaire</h3>`;
    const invBox = document.createElement('div');
    invBox.className = 'inventory-box';
    invBox.innerText = p.inventory || 'Sac vide.';
    invSection.appendChild(invBox);
    container.appendChild(invSection);

    const deckSection = document.createElement('div');
    deckSection.innerHTML = `<h3 class="mobile-section-title">⚔️ Deck</h3>`;
    const deckGrid = document.createElement('div');
    deckGrid.className = 'card-grid';
    const userDeck = Array.isArray(p.deck) ? p.deck : [];
    if (userDeck.length > 0) {
        userDeck.forEach(cardId => {
            const c = gameData.cards.find(x => x.id === cardId);
            if (c) {
                const cardEl = document.createElement('div'); cardEl.className = 'clash-card';
                cardEl.innerHTML = `<div class="cost">${c.cost}</div><img src="${c.img}"><h4 style="color:#fcc22d">${c.name}</h4>`;
                cardEl.onclick = () => { if(confirm(`Jouer ${c.name} ?`)) playCardAction(p.name, c); };
                deckGrid.appendChild(cardEl);
            }
        });
    } else {
        deckGrid.innerHTML = '<p style="color:#aaa; text-align:center; width:100%;">Aucune carte.</p>';
    }
    deckSection.appendChild(deckGrid);
    container.appendChild(deckSection);
}

// ⚠️ BUG FIX : J'ai supprimé ici le "Ghost Code" dupliqué qui causait le crash de l'interface

function playCardAction(playerName, card) {
    const cardHtml = `<div style="text-align:center; margin-top:5px; border:2px solid #333; border-radius:8px; overflow:hidden; background:white;"><img src="${card.img}" style="width:100%; height:100px; object-fit:cover; display:block;"><div style="padding:5px; background:#f0f0f0;"><strong style="color:#2c3e50">${card.name}</strong><br><small>${card.desc}</small></div></div>`;
    gameData.chat.push({
        id: generateId(), sender: playerName, senderId: currentUser.id,
        text: `⚔️ Je lance <b>${card.name}</b> ! ${cardHtml}`,
        target: 'global', timestamp: new Date().toISOString()
    });
    saveData();
    switchTab(currentUser.role === 'dm' ? 'chat' : 'p-chat', currentUser.role);
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
        if (meNew && meNew.deck.length > prevDeckSize) {
            const newCardId = meNew.deck[meNew.deck.length - 1];
            if(newCardId) triggerChestAnimation(newCardId);
        }
        if (meNew) prevDeckSize = meNew.deck.length;
    }
    gameData = newData;
    render();
}

function triggerChestAnimation(newCardId) {
    const overlay = document.getElementById('chest-overlay');
    const container = overlay.querySelector('.chest-anim-container');
    const card = gameData.cards.find(c => c.id === newCardId);
    if(!card) return;
    const chestUrl = "https://media.tenor.com/J1y9sWv7tSAAAAAC/clash-royale-legendary-chest.gif";
    container.innerHTML = `
        <div id="phase-coffre"><img src="${chestUrl}" style="width:200px"></div>
        <div id="phase-carte" style="display:none; flex-direction:column; align-items:center;">
            <div class="clash-card" style="transform:scale(1.5)"><img src="${card.img}"><h4>${card.name}</h4></div>
            <h2 style="color:#ffd700; margin-top:20px;">NOUVELLE CARTE !</h2>
        </div>
    `;
    overlay.classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('phase-coffre').style.display='none';
        document.getElementById('phase-carte').style.display='flex';
    }, 2500);
    overlay.onclick = () => { if(document.getElementById('phase-carte').style.display==='flex') overlay.classList.add('hidden'); };
}

// 8. SYSTÈME
function renderSystemModule(container) {
    container.innerHTML = `<h2>Gestion de la Session</h2>`;
    const exportBox = document.createElement('div'); exportBox.className = 'system-box';
    exportBox.innerHTML = `<button id="btn-backup" class="btn btn-primary">Télécharger la Sauvegarde</button>`;
    exportBox.querySelector('#btn-backup').onclick = () => {
        const dataStr = JSON.stringify(gameData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click(); URL.revokeObjectURL(url);
    };
    container.appendChild(exportBox);

    const importBox = document.createElement('div'); importBox.className = 'system-box';
    importBox.innerHTML = `<div class="file-upload-wrapper"><button class="btn btn-secondary">Importer .JSON</button><input type="file" id="file-input" accept=".json"></div>`;
    importBox.querySelector('#file-input').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (confirm("Écraser la partie ?")) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try { gameData = JSON.parse(event.target.result); saveData("Restauration système."); alert("Succès"); render(); } 
                catch (err) { alert("Erreur fichier"); }
            };
            reader.readAsText(file);
        }
    };
    container.appendChild(importBox);
}

function openResourceManager() { alert('Module de gestion des ressources'); }
function openQuestModal(onSave) {
    const modal = document.getElementById('modal-form');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');

    // Reset UI
    saveBtn.style.display = 'inline-block';
    saveBtn.innerText = 'Publier la Quête';
    document.getElementById('form-title').innerText = 'Nouvelle Quête de Groupe';
    container.innerHTML = '';

    // 1. TITRE & RÉCOMPENSE
    container.innerHTML += `
        <div style="display:flex; gap:10px;">
            <div class="form-group" style="flex:1">
                <label>Titre</label>
                <input type="text" id="q-title" placeholder="Ex: Chasser les rats">
            </div>
            <div class="form-group" style="flex:1">
                <label>Récompense</label>
                <input type="text" id="q-reward" placeholder="Ex: 500 Or">
            </div>
        </div>
    `;

    // 2. COMMANDITAIRE (Select)
    let npcOptions = '<option value="board">📢 Panneau d\'affichage</option>';
    gameData.npcs.forEach(n => {
        npcOptions += `<option value="${n.id}">👤 ${n.name}</option>`;
    });
    
    container.innerHTML += `
        <div class="form-group">
            <label>Commanditaire</label>
            <select id="q-giver" style="width:100%; padding:10px;">${npcOptions}</select>
        </div>
    `;

    // 3. DESCRIPTION
    container.innerHTML += `
        <div class="form-group">
            <label>Instructions</label>
            <textarea id="q-desc" rows="3"></textarea>
        </div>
    `;

    // 4. ASSIGNATION (CHECKBOXES)
    let checksHtml = '<div class="checkbox-group" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:5px;">';
    
    // Bouton "Tous" pour aller plus vite
    checksHtml += `
        <label class="checkbox-item" style="background:#ddd; font-weight:bold">
            <input type="checkbox" onchange="document.querySelectorAll('.q-player-check').forEach(c => c.checked = this.checked)"> Tout le monde
        </label>
    `;

    gameData.players.forEach(p => {
        checksHtml += `
            <label class="checkbox-item" style="background:#e3f2fd;">
                <input type="checkbox" class="q-player-check" value="${p.id}" checked>
                ${p.name}
            </label>
        `;
    });
    checksHtml += '</div>';

    container.innerHTML += `
        <div class="form-group">
            <label>Assigner aux aventuriers :</label>
            ${checksHtml}
        </div>
    `;

    // Affichage
    modal.style.display = 'flex';
    modal.querySelector('.close-form').onclick = () => modal.style.display = 'none';

    // Sauvegarde
    saveBtn.onclick = null;
    saveBtn.onclick = () => {
        const title = document.getElementById('q-title').value;
        const reward = document.getElementById('q-reward').value;
        const desc = document.getElementById('q-desc').value;
        const giverId = document.getElementById('q-giver').value;
        
        // Récupérer tous les IDs cochés
        const assignedTo = [];
        document.querySelectorAll('.q-player-check:checked').forEach(box => {
            assignedTo.push(box.value);
        });

        if (title && assignedTo.length > 0) {
            onSave({ title, reward, desc, giverId, assignedTo });
            modal.style.display = 'none';
        } else {
            alert("Il faut un titre et au moins un joueur !");
        }
    };
}
function showQRCode() {
    const modal = document.getElementById('modal-qr');
    const modalContent = modal.querySelector('.modal-content');
    
    // On recrée le HTML à chaque ouverture pour être sûr d'avoir la liste à jour
    modalContent.innerHTML = `
        <span class="close-modal" style="position:absolute; right:15px; top:10px; cursor:pointer; font-size:24px;">&times;</span>
        <h3>Rejoindre la partie</h3>
        
        <div style="margin-bottom:15px; text-align:left;">
            <label>Qui connecter ?</label>
            <select id="qr-target-select" style="padding:10px; width:100%; margin-top:5px;">
                <option value="new">✨ Nouveau Joueur (Générique)</option>
            </select>
        </div>

        <div id="qrcode" style="display:flex; justify-content:center; margin:20px 0;"></div>
        <p id="qr-hint" style="font-size:0.9rem; color:#444;">Scanner pour rejoindre.</p>
    `;

    const select = document.getElementById('qr-target-select');
    
    // Remplissage de la liste des joueurs
    if (gameData.players && gameData.players.length > 0) {
        gameData.players.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = `👤 ${p.name}`;
            select.appendChild(opt);
        });
    }

    // Fonction de génération
    const generateQR = () => {
        const qrContainer = document.getElementById('qrcode');
        qrContainer.innerHTML = ''; 

        const baseUrl = window.location.href.split('?')[0];
        const session = document.getElementById('session-input').value;
        const selectedId = select.value;

        let targetUrl = `${baseUrl}?session=${session}`;

        if (selectedId !== 'new') {
            targetUrl += `&role=player&id=${selectedId}`;
            const pName = gameData.players.find(p=>p.id===selectedId)?.name || 'Joueur';
            document.getElementById('qr-hint').innerHTML = `Connexion directe : <b>${pName}</b>`;
        } else {
            document.getElementById('qr-hint').innerText = "Lien d'invitation générique.";
        }

        new QRCode(qrContainer, {
            text: targetUrl,
            width: 200,
            height: 200
        });
    };

    // Events
    select.onchange = generateQR;
    modal.querySelector('.close-modal').onclick = () => modal.style.display = 'none';

    modal.style.display = 'flex';
    generateQR();
}