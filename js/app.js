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
    './assets/cards/snowball.png',
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
    './assets/cards/fury.png', // Ou rage.png selon le pack
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
let selectedRelCharId = null; // Mémoire du perso sélectionné dans l'onglet Relations

// Helper : Trouve un perso (Joueur ou PNJ) par son ID
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
    // Navigation (CORRECTIF MOBILE)
    document.querySelectorAll('#dm-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.tab, 'dm'));
    });
    
    // Ici on utilise 'currentTarget' pour être sûr de capter le clic même sur l'icône
    document.querySelectorAll('#player-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); // Empêche les comportements bizarres sur mobile
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

// --- SYSTÈME DE MODALE (AVEC SÉLECTEUR D'IMAGES) ---
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

        // 1. MENU DÉROULANT (SELECT)
        if (f.type === 'select') {
            const input = document.createElement('select');
            input.id = `field-${f.name}`;
            f.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.innerText = opt.label;
                if(opt.value === f.value) o.selected = true;
                input.appendChild(o);
            });
            div.appendChild(input);
        
        // 2. TEXTE LONG (TEXTAREA)
        } else if (f.type === 'textarea') {
            const input = document.createElement('textarea');
            input.id = `field-${f.name}`;
            input.rows = 3;
            input.value = (f.value != null) ? f.value : '';
            div.appendChild(input);

        // 3. IMAGE (Détection automatique par nom ou type explicite)
        } else if (f.type === 'image' || ['avatar', 'url', 'img', 'image'].includes(f.name)) {
            const wrapper = document.createElement('div');
            wrapper.className = 'img-input-row';

            // Miniature de prévisualisation
            const thumb = document.createElement('img');
            thumb.className = 'img-preview-thumb';
            thumb.src = f.value || 'https://placehold.co/40';
            thumb.onerror = function(){ this.src='https://placehold.co/40?text=?'; };

            // Champ texte (pour voir l'URL ou coller un lien internet)
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `field-${f.name}`;
            input.value = (f.value != null) ? f.value : '';
            input.placeholder = "./assets/... ou https://...";
            input.style.flex = "1";
            
            // Mise à jour de la miniature quand on tape à la main
            input.oninput = () => thumb.src = input.value;

            // Bouton "Choisir"
            const btnPick = document.createElement('button');
            btnPick.className = 'btn btn-secondary';
            btnPick.style.padding = '5px 10px';
            btnPick.style.fontSize = '0.8rem';
            btnPick.innerText = '📂';
            btnPick.title = "Choisir dans la galerie";
            
            // Ouvrir la galerie au clic
            btnPick.onclick = (e) => {
                e.preventDefault(); // Ne pas fermer le formulaire
                openAssetPicker((selectedUrl) => {
                    input.value = selectedUrl;
                    thumb.src = selectedUrl;
                });
            };

            wrapper.appendChild(thumb);
            wrapper.appendChild(input);
            wrapper.appendChild(btnPick);
            div.appendChild(wrapper);

        // 4. TEXTE / NOMBRE STANDARD
        } else {
            const input = document.createElement('input');
            input.id = `field-${f.name}`;
            input.type = f.type || 'text';
            input.value = (f.value != null) ? f.value : '';
            div.appendChild(input);
        }
        
        container.appendChild(div);
    });

    currentFormCallback = onSave;
    modal.style.display = 'flex';
    
    // Gestion fermeture
    modal.querySelector('.close-form').onclick = () => modal.style.display = 'none';
    
    // Gestion sauvegarde
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

// --- FONCTION DE LA GALERIE D'IMAGES ---
function openAssetPicker(onSelect) {
    const modal = document.getElementById('asset-picker');
    const grid = document.getElementById('asset-grid');
    grid.innerHTML = ''; // Nettoyer

    // Vérifier si la liste est vide
    if (!LOCAL_ASSETS || LOCAL_ASSETS.length === 0) {
        grid.innerHTML = '<p style="padding:10px; color:#666;">Aucune image configurée dans LOCAL_ASSETS (js/app.js).</p>';
    }

    // Remplir la grille avec la liste définie en haut du fichier
    LOCAL_ASSETS.forEach(url => {
        const item = document.createElement('div');
        item.className = 'asset-item';
        
        // On récupère juste le nom du fichier pour l'afficher proprement
        const cleanName = url.split('/').pop(); 
        
        item.innerHTML = `
            <img src="${url}" onerror="this.src='https://placehold.co/50?text=Err'">
            <div class="asset-name">${cleanName}</div>
        `;
        
        item.onclick = () => {
            onSelect(url); // Renvoie l'URL au formulaire
            modal.style.display = 'none'; // Ferme la galerie
        };
        grid.appendChild(item);
    });

    modal.style.display = 'flex';
}

// --- RENDERING ENGINE ---

function render() {
    if (currentUser.role === 'dm') renderDM();
    else renderPlayer();
}

function renderDM() {
    // 1. INITIALISATION DES TYPES DE RESSOURCES (Si inexistant)
    if (!gameData.resourceTypes) {
        gameData.resourceTypes = [
            { id: 'gold', name: 'Or', icon: '💰', color: '#ffbd2e', max: 999999 },
            { id: 'elixir', name: 'Élixir', icon: '💧', color: '#d6308e', max: 99 }
        ];
        // On sauvegarde silencieusement pour appliquer la structure
        syncGameData(gameData);
    }
    
    const header = document.querySelector('#dm-screen header');
    // ...
    // On met à jour la navigation pour inclure l'onglet Système
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

    // Réattacher les événements de clic sur le nouveau menu
    header.querySelectorAll('#dm-nav button').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab, 'dm'));
    });

    const container = document.getElementById('dm-content');
    container.innerHTML = '';

    // Routing des onglets
    if (currentTab === 'map') renderMapModule(container, true);
    else if (currentTab === 'players') renderPlayersModule(container);
    else if (currentTab === 'chat') renderChatModule(container);
    else if (currentTab === 'cards') renderCardsModule(container);
    else if (currentTab === 'relations') renderRelationsModule(container);
    else if (currentTab === 'quests') renderQuestsModule(container);
    else if (currentTab === 'journal') renderJournalModule(container);
    else if (currentTab === 'system') renderSystemModule(container); // <--- NOUVEAU
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

// MODULE MAP (AVEC RENDU MÉTÉO)
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
    
    // --- 1. COUCHE MÉTÉO ---
    if (currentMap.weather && currentMap.weather !== 'none') {
        const weatherLayer = document.createElement('div');
        weatherLayer.className = `weather-layer fx-${currentMap.weather}`;
        wrapper.appendChild(weatherLayer);
    }

    // --- 2. L'IMAGE ---
    const img = document.createElement('img');
    img.src = currentMap.url;
    img.className = 'map-img';
    img.onerror = function() { this.style.display = 'none'; };
    wrapper.appendChild(img);

    // --- 3. ROSTER (MJ ONLY) ---
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
                <img src="${entity.avatar}" style="width:20px; height:20px; border-radius:50%; margin-right:5px; opacity:${isOnMap ? 1 : 0.5}" onerror="this.src='https://placehold.co/20'">
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

    // --- 4. PIONS ---
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

// --- ATLAS (AVEC MÉTÉO) ---
function openMapManager() {
    const modal = document.getElementById('modal-form');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');
    
    document.getElementById('form-title').innerText = 'Atlas des Cartes';
    container.innerHTML = '<div style="margin-bottom:15px"><button id="btn-new-map" class="btn btn-primary">+ Nouvelle Carte</button></div>';

    // Options Météo
    const weatherOptions = [
        {value:'none', label:'☀️ Normal'},
        {value:'rain', label:'🌧️ Pluie'},
        {value:'snow', label:'❄️ Neige'},
        {value:'fog', label:'🌫️ Brouillard'},
        {value:'night', label:'🌑 Nuit'},
        {value:'sepia', label:'📜 Sépia (Vieux)'}
    ];

    container.querySelector('#btn-new-map').onclick = () => {
        modal.style.display = 'none'; 
        openFormModal('Nouvelle Carte', [
            { name: 'name', label: 'Nom du lieu', value: '' },
            { name: 'url', label: 'URL Image', value: '', type:'image' },
            { name: 'weather', label: 'Ambiance / Météo', type: 'select', options: weatherOptions, value: 'none' }, // Nouveau champ
            { name: 'desc', label: 'Description', type: 'textarea', value: '' }
        ], (data) => {
            const safeUrl = data.url && data.url.trim() !== '' ? data.url : './assets/map.png';
            gameData.maps.push({ 
                id: generateId(), 
                name: data.name || 'Sans Nom', 
                url: safeUrl, 
                weather: data.weather, // Sauvegarde météo
                desc: data.desc 
            });
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
                    <small style="opacity:0.7">Météo: ${m.weather || 'Normal'}</small>
                </div>
                <div style="width:50px; height:30px; border:1px solid #ccc; margin:0 10px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:#eee;">
                     <img src="${m.url}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.parentNode.innerHTML='🗺️'">
                </div>
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
                { name: 'url', label: 'URL', value: m.url, type:'image' },
                { name: 'weather', label: 'Météo', type: 'select', options: weatherOptions, value: m.weather || 'none' }, // Champ modifiable
                { name: 'desc', label: 'Description', type: 'textarea', value: m.desc || '' }
            ], (data) => {
                m.name = data.name; 
                m.url = data.url && data.url.trim() !== '' ? data.url : './assets/map.png';
                m.weather = data.weather;
                m.desc = data.desc;
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

// 2. PLAYERS (TRI ALPHABÉTIQUE FRANÇAIS)
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
            { name: 'avatar', label: 'Avatar', type: 'image', value: './assets/king.png' },
            { name: 'desc', label: 'Description', type: 'textarea', value: '' }
        ], (data) => {
            const newChar = { id: generateId(), name: data.name, avatar: data.avatar, desc: data.desc, deck: [], inventory: '', x: 50, y: 50 };
            if(data.type === 'player') gameData.players.push(newChar); else gameData.npcs.push(newChar);
            saveData(`Création de ${data.name}`);
        });
    };

    const list = document.createElement('div');
    
    // --- FONCTION DE TRI ROBUSTE (FRANÇAIS) ---
    const sortFrench = (a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB, 'fr', { sensitivity: 'base' });
    };

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
                const val = (char[res.id] !== undefined && char[res.id] !== null) ? char[res.id] : 0;
                const maxVal = res.max || 9999999;
                resourcesHtml += `
                    <div style="display:flex; align-items:center; background:#eee; padding:2px 5px; border-radius:4px;">
                        <span style="font-size:0.8rem; margin-right:2px;" title="${res.name}">${res.icon}</span> 
                        <input type="number" class="res-input" data-id="${char.id}" data-type="${res.id}" data-max="${maxVal}" style="width:100px; padding:2px; border:1px solid #ccc;" value="${val}" max="${maxVal}" min="0">
                    </div>`;
            });
            resourcesHtml += '</div>';
        }

        const cleanDesc = (char.desc && char.desc !== "undefined") ? char.desc : "";

        row.innerHTML = `
            <img src="${char.avatar}" onerror="this.onerror=null;this.src='https://cdn-icons-png.flaticon.com/512/847/847969.png'" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid #333">
            <div style="flex:1">
                <strong>${char.name}</strong> <small>(${type === 'npc' ? 'PNJ' : 'Joueur'})</small>
                ${resourcesHtml}
                <small style="opacity:0.7; display:block; font-size:0.8rem">${cleanDesc}</small>
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
                let val = parseInt(e.target.value) || 0;
                const fieldType = e.target.dataset.type;
                const pid = e.target.dataset.id;
                const max = parseInt(e.target.dataset.max);
                if (val > max) { val = max; e.target.value = max; alert(`Maximum atteint (${max})`); }
                if (val < 0) { val = 0; e.target.value = 0; }
                const targetP = findEntityById(pid);
                if(targetP) { targetP[fieldType] = val; syncGameData(gameData); }
            };
        });

        row.querySelector(`#deck-${char.id}`).onclick = () => openDeckManager(char);
        row.querySelector(`#edit-${char.id}`).onclick = () => {
            openFormModal(`Éditer ${char.name}`, [
                { name: 'name', label: 'Nom', value: char.name },
                { name: 'avatar', label: 'Avatar', type: 'image', value: char.avatar },
                { name: 'desc', label: 'Description', type: 'textarea', value: cleanDesc },
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

    // --- APPLICATION DU TRI ---
    // On trie une COPIE des tableaux pour ne pas modifier l'ordre interne de la DB
    const sortedPlayers = [...gameData.players].sort(sortFrench);
    const sortedNPCs = [...gameData.npcs].sort(sortFrench);

    if(sortedPlayers.length > 0) {
        list.innerHTML += `<h3 style="margin-top:0; border-bottom:2px solid var(--cr-blue); color:var(--cr-blue)">Joueurs</h3>`;
        sortedPlayers.forEach(p => renderRow(p, 'player'));
    }
    
    if(sortedNPCs.length > 0) {
        const sep = document.createElement('h3'); 
        sep.innerHTML = `PNJ`; 
        sep.style.cssText = 'margin-top:20px; border-bottom:2px solid var(--cr-wood); color:var(--cr-wood)';
        list.appendChild(sep);
        sortedNPCs.forEach(n => renderRow(n, 'npc'));
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

// 4. CARTES (TRI CATÉGORIES + ALPHABÉTIQUE)
function renderCardsModule(container) {
    container.innerHTML = '<div style="margin-bottom:15px"><button id="btn-create-card" class="btn btn-secondary">+ Créer une Carte</button></div>';

    document.getElementById('btn-create-card').onclick = () => {
        openFormModal('Nouvelle Carte', [
            { name: 'name', label: 'Nom', value: '' },
            { name: 'type', label: 'Catégorie', type: 'select', options: [
                {value:'troupe', label:'Troupes / Personnages'},
                {value:'sort', label:'Sorts / Pouvoirs'},
                {value:'batiment', label:'Bâtiments / Lieux'},
                {value:'objet', label:'Objets / Items'}
            ], value: 'objet' },
            { name: 'cost', label: 'Coût', type: 'number', value: '3' },
            { name: 'img', label: 'Image URL', type: 'image', value: './assets/cards/knight.png' },
            { name: 'desc', label: 'Effet', type: 'textarea', value: '' }
        ], (data) => {
            gameData.cards.push({ 
                id: generateId(), 
                name: data.name, 
                type: data.type, 
                cost: parseInt(data.cost), 
                img: data.img, 
                desc: data.desc 
            });
            saveData(`Carte créée : ${data.name}`);
        });
    };

    // --- LOGIQUE DE TRI ---
    const categories = {
        'troupe': { title: '⚔️ Troupes', cards: [] },
        'sort': { title: '🧪 Sorts', cards: [] },
        'batiment': { title: '🏰 Bâtiments', cards: [] },
        'objet': { title: '🎒 Objets', cards: [] },
        'autre': { title: '❓ Autres', cards: [] }
    };

    // Répartition
    gameData.cards.forEach(c => {
        const catKey = (c.type && categories[c.type]) ? c.type : 'autre';
        categories[catKey].cards.push(c);
    });

    // Tri A-Z dans chaque catégorie (Robuste)
    Object.keys(categories).forEach(key => {
        categories[key].cards.sort((a, b) => {
            const na = (a.name || '').toLowerCase();
            const nb = (b.name || '').toLowerCase();
            return na.localeCompare(nb, 'fr', { sensitivity: 'base' });
        });
    });

    // Affichage
    let hasCards = false;
    Object.keys(categories).forEach(key => {
        const cat = categories[key];
        if (cat.cards.length > 0) {
            hasCards = true;
            const header = document.createElement('h3');
            header.style.cssText = "margin-top:20px; border-bottom: 2px solid #ccc; color:#555;";
            header.innerText = cat.title;
            container.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'card-grid';

            cat.cards.forEach(c => {
                const el = document.createElement('div');
                el.className = 'clash-card';
                el.style.cursor = 'pointer';
                el.innerHTML = `<div class="cost">${c.cost}</div><img src="${c.img}" onerror="this.onerror=null;this.src='https://placehold.co/100x120?text=?'"><h4>${c.name}</h4>`;
                
                el.onclick = () => {
                    openFormModal(`Modifier ${c.name}`, [
                        { name: 'name', label: 'Nom', value: c.name },
                        { name: 'type', label: 'Catégorie', type: 'select', options: [
                            {value:'troupe', label:'Troupes'}, {value:'sort', label:'Sorts'},
                            {value:'batiment', label:'Bâtiments'}, {value:'objet', label:'Objets'}
                        ], value: c.type || 'objet' },
                        { name: 'cost', label: 'Coût', type: 'number', value: c.cost },
                        { name: 'img', label: 'Image URL', type: 'image', value: c.img },
                        { name: 'desc', label: 'Description', type: 'textarea', value: c.desc || '' }
                    ], (data) => {
                        c.name = data.name;
                        c.type = data.type;
                        c.cost = parseInt(data.cost);
                        c.img = data.img;
                        c.desc = data.desc;
                        saveData(`Carte modifiée : ${c.name}`);
                    });
                };
                grid.appendChild(el);
            });
            container.appendChild(grid);
        }
    });
    
    if (!hasCards) {
        container.innerHTML += '<p style="opacity:0.5; text-align:center">Aucune carte dans la collection.</p>';
    }
}

// 5. RELATIONS (SÉLECTION SÉPARÉE JOUEURS / PNJ)
function renderRelationsModule(container) {
    if (!gameData.relations) gameData.relations = [];
    
    // On sépare les listes pour l'affichage
    const players = gameData.players || [];
    const npcs = gameData.npcs || [];
    const allEntities = [...players, ...npcs];

    if(allEntities.length < 2) {
        return container.innerHTML = '<div class="panel" style="color:#333">Il faut au moins 2 personnages pour avoir des relations.</div>';
    }

    // Sélection par défaut (Sécurité)
    if (!selectedRelCharId || !allEntities.find(e => e.id === selectedRelCharId)) {
        selectedRelCharId = allEntities[0].id;
    }

    const selectedEntity = allEntities.find(e => e.id === selectedRelCharId);

    // 1. EN-TÊTE
    container.innerHTML = `
        <h2 style="color:var(--cr-blue-dark); text-align:center; margin-bottom:5px;">Réseau d'Influence</h2>
        
        <div id="rel-name-display" style="height:30px; line-height:30px; text-align:center; font-weight:900; color:var(--cr-blue); font-size:1.2rem; text-transform:uppercase; margin-bottom:10px;">
            ${selectedEntity ? selectedEntity.name : ''}
        </div>
    `;

    // --- FONCTION HELPER POUR CRÉER UN AVATAR ---
    const createAvatar = (e) => {
        const img = document.createElement('img');
        img.src = e.avatar;
        img.className = `rel-avatar-select ${e.id === selectedRelCharId ? 'active' : ''}`;
        img.onerror = function() { this.src='https://placehold.co/60'; };
        
        // Hover effect
        img.onmouseenter = () => { document.getElementById('rel-name-display').innerText = e.name; };
        img.onmouseleave = () => { 
            const current = allEntities.find(x => x.id === selectedRelCharId);
            document.getElementById('rel-name-display').innerText = current ? current.name : '';
        };

        img.onclick = () => {
            selectedRelCharId = e.id;
            renderRelationsModule(container); // Recharger la vue
        };
        return img;
    };

    // 2. LIGNE DES JOUEURS
    if (players.length > 0) {
        const titleP = document.createElement('h4');
        titleP.style.cssText = "margin: 0 0 5px 10px; color: var(--cr-blue); font-size: 0.9rem; text-transform: uppercase;";
        titleP.innerText = "Joueurs";
        container.appendChild(titleP);

        const selectorP = document.createElement('div');
        selectorP.className = 'rel-selector';
        players.forEach(p => selectorP.appendChild(createAvatar(p)));
        container.appendChild(selectorP);
    }

    // 3. LIGNE DES PNJ
    if (npcs.length > 0) {
        const titleN = document.createElement('h4');
        titleN.style.cssText = "margin: 10px 0 5px 10px; color: var(--cr-wood); font-size: 0.9rem; text-transform: uppercase;";
        titleN.innerText = "PNJ";
        container.appendChild(titleN);

        const selectorN = document.createElement('div');
        selectorN.className = 'rel-selector';
        npcs.forEach(n => selectorN.appendChild(createAvatar(n)));
        container.appendChild(selectorN);
    }

    // 4. LE TABLEAU DE BORD (Point de vue)
    const board = document.createElement('div');
    board.className = 'rel-board';
    board.style.marginTop = "20px";

    const cols = {
        friendly: { title: '💚 Alliés / Amis', color: '#28a745', list: [] },
        neutral:  { title: '😐 Neutres / Inconnus', color: '#6c757d', list: [] },
        hostile:  { title: '❤️ Hostiles / Ennemis', color: '#dc3545', list: [] }
    };

    allEntities.forEach(target => {
        if (target.id === selectedRelCharId) return; 

        const rel = gameData.relations.find(r => r.source === selectedRelCharId && r.target === target.id);
        let status = rel ? rel.status : 'neutral';
        
        let displayCat = status;
        if (status === 'ally') displayCat = 'friendly';

        cols[displayCat].list.push({ ...target, realStatus: status });
    });

    Object.keys(cols).forEach(key => {
        const colData = cols[key];
        const colDiv = document.createElement('div');
        colDiv.className = 'rel-column';
        colDiv.style.borderTop = `4px solid ${colData.color}`;
        
        colDiv.innerHTML = `<h3 style="color:${colData.color}; margin-top:5px;">${colData.title}</h3>`;
        
        if (colData.list.length === 0) {
            colDiv.innerHTML += '<p style="opacity:0.5; font-size:0.8rem; text-align:center; color:#888;">- Vide -</p>';
        } else {
            colData.list.forEach(char => {
                const card = document.createElement('div');
                card.className = 'rel-card';
                card.style.borderLeftColor = colData.color;
                
                let icon = '😐';
                if(char.realStatus === 'friendly') icon = '🙂';
                if(char.realStatus === 'ally') icon = '🛡️';
                if(char.realStatus === 'hostile') icon = '😡';

                card.innerHTML = `
                    <img src="${char.avatar}" onerror="this.src='https://placehold.co/40'">
                    <div style="flex:1; color:#333;">
                        <strong>${char.name}</strong>
                    </div>
                    <div style="font-size:1.2rem">${icon}</div>
                `;

                if(currentUser.role === 'dm') {
                    card.title = "Cliquez pour changer la relation";
                    card.onclick = () => {
                        const states = ['neutral', 'friendly', 'hostile', 'ally'];
                        const nextStatus = states[(states.indexOf(char.realStatus) + 1) % states.length];
                        
                        const existingIndex = gameData.relations.findIndex(r => r.source === selectedRelCharId && r.target === char.id);
                        if (existingIndex >= 0) {
                            gameData.relations[existingIndex].status = nextStatus;
                        } else {
                            gameData.relations.push({ source: selectedRelCharId, target: char.id, status: nextStatus });
                        }
                        
                        saveData();
                    };
                } else {
                    card.style.cursor = 'default';
                }

                colDiv.appendChild(card);
            });
        }
        board.appendChild(colDiv);
    });

    container.appendChild(board);
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

// 6. QUÊTES (MULTI-JOUEURS)
function renderQuestsModule(container) {
    container.innerHTML = '<div style="margin-bottom:20px; text-align:center"><button id="btn-new-quest" class="btn btn-secondary" style="width:100%">+ Nouvelle Quête</button></div>';

    // Appel de notre nouvelle modale
    document.getElementById('btn-new-quest').onclick = () => {
        if(gameData.players.length === 0) return alert("Créez d'abord des joueurs !");
        
        openQuestModal((data) => {
            gameData.quests.push({
                id: generateId(),
                title: data.title,
                desc: data.desc,
                reward: data.reward,
                giverId: data.giverId,
                assignedTo: data.assignedTo, // C'est maintenant un tableau [id1, id2]
                status: 'active'
            });
            saveData(`Nouvelle quête : ${data.title}`);
        });
    };

    const list = document.createElement('div');
    
    if (gameData.quests.length === 0) {
        list.innerHTML = '<p style="opacity:0.5; text-align:center">Aucune quête active.</p>';
    } else {
        gameData.quests.forEach((q, index) => {
            // Gestion rétro-compatibilité (si c'est une vieille quête avec un seul ID string)
            const assignedIds = Array.isArray(q.assignedTo) ? q.assignedTo : [q.assignedTo];

            // On construit la liste des noms
            const names = assignedIds.map(id => {
                const p = gameData.players.find(x => x.id === id);
                return p ? p.name : 'Inconnu';
            }).join(', ');

            // Image Commanditaire
            let giverImg = 'https://cdn-icons-png.flaticon.com/512/3209/3209995.png';
            if (q.giverId && q.giverId !== 'board') {
                const npc = gameData.npcs.find(n => n.id === q.giverId);
                if (npc) giverImg = npc.avatar;
            }

            const card = document.createElement('div');
            card.className = 'quest-card';
            card.innerHTML = `
                <img src="${giverImg}" class="quest-giver" onerror="this.src='https://placehold.co/60'">
                <div class="quest-info">
                    <div style="float:right">
                         <button class="btn" style="background:red; font-size:0.7rem; padding:4px 8px;" onclick="window.deleteQuest(${index})">X</button>
                    </div>
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
    }
    container.appendChild(list);
}

// Fonction de suppression (Doit être en dehors)
window.deleteQuest = (index) => {
    if(confirm('Supprimer cette quête ?')) {
        gameData.quests.splice(index, 1);
        saveData();
    }
};

// Fonction de suppression globale
window.deleteQuest = (index) => {
    if(confirm('Supprimer cette quête ? (Cela l\'effacera aussi chez le joueur)')) {
        gameData.quests.splice(index, 1);
        saveData();
    }
};

// QUÊTES JOUEUR (COMPATIBLE MULTI)
function renderPlayerQuests(container, player) {
    // Filtre : Est-ce que mon ID est dans le tableau 'assignedTo' ?
    const myQuests = gameData.quests.filter(q => {
        if (Array.isArray(q.assignedTo)) {
            return q.assignedTo.includes(player.id);
        }
        // Rétro-compatibilité vieilles quêtes
        return q.assignedTo === player.id;
    });
    
    container.innerHTML = '<h2>Mes Quêtes</h2>';
    
    if (myQuests.length === 0) {
        container.innerHTML += `
            <div style="text-align:center; opacity:0.6; margin-top:40px;">
                <p>Aucune mission pour le moment.</p>
            </div>`;
        return;
    }

    myQuests.forEach(q => {
        let giverImg = 'https://cdn-icons-png.flaticon.com/512/3209/3209995.png';
        let giverName = 'Panneau';
        
        if (q.giverId && q.giverId !== 'board') {
            const npc = gameData.npcs.find(n => n.id === q.giverId);
            if (npc) {
                giverImg = npc.avatar;
                giverName = npc.name;
            }
        }

        const card = document.createElement('div');
        card.className = 'quest-card';
        card.style.borderLeftColor = 'var(--cr-blue)'; 
        
        card.innerHTML = `
            <img src="${giverImg}" class="quest-giver" onerror="this.src='https://placehold.co/60'">
            <div class="quest-info">
                <small style="text-transform:uppercase; font-size:0.6rem; color:#888;">${giverName}</small>
                <h4 class="quest-title">${q.title}</h4>
                <p class="quest-desc">${q.desc || ''}</p>
                <span class="quest-reward">💰 ${q.reward}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

// 7. JOURNAL NARRATIF (RÉSUMÉS DE SESSION)
function renderJournalModule(container) {
    // Initialisation des données si elles n'existent pas
    if (!gameData.journal) gameData.journal = [];

    // --- VUE MJ : BOUTON AJOUTER ---
    if (currentUser.role === 'dm') {
        container.innerHTML = '<div style="margin-bottom:20px; text-align:center"><button id="btn-new-entry" class="btn btn-primary" style="width:100%">+ Nouveau Résumé</button></div>';
        
        document.getElementById('btn-new-entry').onclick = () => {
            const today = new Date().toISOString().split('T')[0]; // Date du jour YYYY-MM-DD
            
            openJournalModal('Nouveau Résumé', {
                title: '',
                date: today,
                content: '',
                participants: [] // Vide par défaut
            }, (data) => {
                gameData.journal.unshift({
                    id: generateId(),
                    title: data.title,
                    date: data.date,
                    content: data.content,
                    participants: data.participants
                });
                saveData(`Journal : ${data.title}`);
            });
        };
    } else {
        container.innerHTML = '<h2 style="margin-bottom:20px;">Chroniques</h2>';
    }

    // --- LISTE DES ENTRÉES ---
    const list = document.createElement('div');
    
    if (gameData.journal.length === 0) {
        list.innerHTML = '<p style="text-align:center; opacity:0.6">Le livre est encore vierge...</p>';
    }

    gameData.journal.forEach((entry, index) => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'journal-entry';
        
        // Génération des avatars des participants
        let avatarsHtml = '';
        if (entry.participants && entry.participants.length > 0) {
            entry.participants.forEach(pid => {
                const p = gameData.players.find(x => x.id === pid);
                if (p) {
                    avatarsHtml += `<img src="${p.avatar}" class="participant-badge" title="${p.name}" onerror="this.src='https://placehold.co/20'">`;
                }
            });
        }

        entryDiv.innerHTML = `
            <div class="journal-header">
                <div style="display:flex; justify-content:space-between;">
                    <span class="journal-date">📅 ${entry.date}</span>
                    <div class="journal-participants">${avatarsHtml}</div>
                </div>
                <h3 class="journal-title">${entry.title}</h3>
            </div>
            <div class="journal-content">${entry.content}</div>
        `;

        // Boutons d'édition pour le MJ
        if (currentUser.role === 'dm') {
            const actions = document.createElement('div');
            actions.style.marginTop = '15px';
            actions.style.textAlign = 'right';
            actions.style.borderTop = '1px solid #eee';
            actions.style.paddingTop = '10px';
            
            actions.innerHTML = `
                <button class="btn" style="background:orange; font-size:0.7rem; padding:5px 10px;" id="edit-j-${entry.id}">✏️ Éditer</button>
                <button class="btn" style="background:red; font-size:0.7rem; padding:5px 10px;" id="del-j-${entry.id}">🗑️</button>
            `;
            
            entryDiv.appendChild(actions);

            // Action Supprimer
            actions.querySelector(`#del-j-${entry.id}`).onclick = () => {
                if(confirm('Supprimer cette entrée définitivement ?')) {
                    gameData.journal.splice(index, 1);
                    saveData();
                }
            };

            // Action Éditer
            actions.querySelector(`#edit-j-${entry.id}`).onclick = () => {
                openJournalModal('Modifier Résumé', entry, (updatedData) => {
                    entry.title = updatedData.title;
                    entry.date = updatedData.date;
                    entry.content = updatedData.content;
                    entry.participants = updatedData.participants;
                    saveData();
                });
            };
        }

        list.appendChild(entryDiv);
    });

    container.appendChild(list);
}

// --- FONCTION SPÉCIALE POUR LE FORMULAIRE JOURNAL (Avec Checkboxes) ---
// --- FONCTION SPÉCIALE JOURNAL (VERSION LARGE) ---
function openJournalModal(title, initialData, onSave) {
    const modal = document.getElementById('modal-form');
    const contentBox = modal.querySelector('.modal-content'); // La boîte blanche
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');

    // 1. ACTIVATION DU MODE LARGE
    contentBox.classList.add('modal-large');

    // Réinitialisation standard
    document.getElementById('form-title').innerText = title;
    container.innerHTML = '';
    saveBtn.style.display = 'inline-block';
    saveBtn.innerText = 'Sauvegarder';

    // 2. GÉNÉRATION DES CHAMPS
    // Titre et Date sur la même ligne pour gagner de la place
    container.innerHTML += `
        <div style="display:flex; gap:10px;">
            <div class="form-group" style="flex:2">
                <label>Titre de la session</label>
                <input type="text" id="j-title" value="${initialData.title}" placeholder="ex: La Caverne des Gobelins">
            </div>
            <div class="form-group" style="flex:1">
                <label>Date</label>
                <input type="date" id="j-date" value="${initialData.date}">
            </div>
        </div>
    `;

    // Participants
    let checksHtml = '<div class="checkbox-group">';
    gameData.players.forEach(p => {
        const isChecked = initialData.participants.includes(p.id) ? 'checked' : '';
        checksHtml += `
            <label class="checkbox-item">
                <input type="checkbox" class="j-part-check" value="${p.id}" ${isChecked}>
                ${p.name}
            </label>
        `;
    });
    checksHtml += '</div>';

    container.innerHTML += `
        <div class="form-group">
            <label>Participants présents</label>
            ${checksHtml}
        </div>
    `;

    // Contenu (Prendra toute la hauteur grâce au CSS)
    container.innerHTML += `
        <div class="form-group" style="height:100%; display:flex; flex-direction:column;">
            <label>Récit de l'aventure</label>
            <textarea id="j-content" style="flex:1; resize:none; padding:15px; font-family:'Georgia', serif; font-size:1.1rem; line-height:1.6;" placeholder="Il était une fois...">${initialData.content}</textarea>
        </div>
    `;

    // Affichage
    modal.style.display = 'flex';

    // FONCTION DE NETTOYAGE (Pour remettre la modale normale après)
    const closeModal = () => {
        contentBox.classList.remove('modal-large'); // Retirer le mode large
        modal.style.display = 'none';
    };

    // Gestion Fermeture (Croix)
    modal.querySelector('.close-form').onclick = closeModal;

    // Gestion Sauvegarde
    saveBtn.onclick = null;
    saveBtn.onclick = () => {
        const titleVal = document.getElementById('j-title').value;
        const dateVal = document.getElementById('j-date').value;
        const contentVal = document.getElementById('j-content').value;
        
        const selectedParticipants = [];
        document.querySelectorAll('.j-part-check:checked').forEach(box => {
            selectedParticipants.push(box.value);
        });

        if (titleVal && contentVal) {
            onSave({
                title: titleVal,
                date: dateVal,
                content: contentVal,
                participants: selectedParticipants
            });
            closeModal(); // Ferme et nettoie
        } else {
            alert("Le titre et le contenu sont obligatoires.");
        }
    };
}

function renderPlayerStats(container, p) {
    // 1. En-tête Profil
    let pillsHtml = '';
    if (gameData.resourceTypes) {
        gameData.resourceTypes.forEach(res => {
            const val = p[res.id] !== undefined ? p[res.id] : 0;
            pillsHtml += `<div class="res-pill"><div class="res-icon" style="background:${res.color}; color:white">${res.icon}</div><span style="color:${res.color}; filter:brightness(1.5)">${val}</span></div>`;
        });
    }
    
    const header = document.createElement('div'); 
    header.className = 'profile-header';
    header.innerHTML = `<img src="${p.avatar}" class="profile-avatar" onerror="this.src='https://placehold.co/80'"><div class="profile-name">${p.name}</div><div class="resource-row" style="flex-wrap:wrap">${pillsHtml}</div><div style="margin-top:10px; font-size:0.8rem; font-style:italic; opacity:0.8">${p.desc || ''}</div>`;
    container.appendChild(header);

    const dashboard = document.createElement('div'); 
    dashboard.className = 'player-dashboard';
    
    // 2. Inventaire
    dashboard.innerHTML += `<h3 style="color:var(--cr-wood); margin-top:20px;">🎒 Inventaire</h3>`;
    const invInput = document.createElement('textarea'); 
    invInput.className = 'inventory-box';
    invInput.value = p.inventory || 'Votre sac est vide.'; 
    invInput.readOnly = true; 
    invInput.style.cssText = 'background:#e6e6e6; color:#555; cursor:default; outline:none;';
    dashboard.appendChild(invInput);

    // 3. Deck (Correction ici)
    dashboard.innerHTML += `<h3 style="color:var(--cr-blue); margin-top:10px;">⚔️ Deck</h3><p class="play-hint">Clique pour jouer !</p>`;
    const deckGrid = document.createElement('div'); 
    deckGrid.className = 'card-grid player-deck';
    
    // Sécurité : on s'assure que p.deck est un tableau
    const userDeck = Array.isArray(p.deck) ? p.deck : [];

    if(userDeck.length === 0) {
        deckGrid.innerHTML = '<p style="opacity:0.5; width:100%">Coffre vide.</p>';
    } else {
        userDeck.forEach(cardId => {
            // On cherche la carte dans la base
            const c = gameData.cards.find(x => x.id === cardId);
            
            // On n'affiche QUE si la carte existe encore
            if(c) {
                const el = document.createElement('div'); 
                el.className = 'clash-card';
                el.innerHTML = `<div class="cost">${c.cost}</div><img src="${c.img}" onerror="this.src='https://placehold.co/100?text=?'"><h4>${c.name}</h4>`;
                el.onclick = () => { 
                    if(confirm(`Jouer "${c.name}" ?`)) playCardAction(p.name, c); 
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

// --- GESTIONNAIRE DE DECK (CORRIGÉ & STABLE) ---
function openDeckManager(entityArg) {
    const modal = document.getElementById('modal-form');
    modal.querySelector('.modal-content').classList.add('modal-xl'); 
    
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');
    
    // On garde l'ID pour retrouver l'entité fraîche à chaque fois
    const targetId = entityArg.id;

    saveBtn.style.display = 'none'; // Pas de bouton save, c'est instantané
    modal.style.display = 'flex';

    // Fonction de rendu interne
    const renderManager = () => {
        // 1. On récupère l'entité fraîche via la fonction globale
        const freshEntity = findEntityById(targetId);
        
        // Si l'entité n'existe plus, on ferme
        if (!freshEntity) return modal.style.display = 'none';

        // Titre dynamique
        const typeLabel = gameData.players.some(p => p.id === targetId) ? 'Joueur' : 'PNJ';
        document.getElementById('form-title').innerText = `Deck de ${freshEntity.name} (${typeLabel})`;
        
        container.innerHTML = ''; 

        // --- ZONE 1 : DECK ACTUEL ---
        const currentSection = document.createElement('div');
        currentSection.innerHTML = '<h4 style="margin:0 0 5px 0; color:var(--cr-blue)">Inventaire (Cliquer pour retirer)</h4>';
        
        const currentList = document.createElement('div');
        currentList.className = 'deck-manager-section mini-card-grid';
        
        if (!freshEntity.deck) freshEntity.deck = []; // Sécurité

        if (freshEntity.deck.length === 0) {
            currentList.innerHTML = '<p style="font-size:0.8rem; color:#888; width:100%">Inventaire vide.</p>';
        } else {
            freshEntity.deck.forEach((cardId, index) => {
                const card = gameData.cards.find(c => c.id === cardId);
                if (card) {
                    const el = document.createElement('div');
                    el.className = 'mini-card';
                    el.style.borderColor = '#ff4d4d'; // Rouge léger
                    el.title = "Retirer du deck";
                    el.innerHTML = `
                        <img src="${card.img}" onerror="this.onerror=null;this.src='https://placehold.co/50?text=?'">
                        <div style="font-size:0.6rem; padding:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${card.name}</div>
                        <div class="action-overlay" style="background:rgba(255,0,0,0.3)">✖</div>
                    `;
                    
                    // --- CORRECTION ICI ---
                    el.onclick = () => {
                        freshEntity.deck.splice(index, 1); 
                        renderManager(); 
                        syncGameData(gameData); // Appel direct (sans window.)
                    };
                    currentList.appendChild(el);
                }
            });
        }
        currentSection.appendChild(currentList);
        container.appendChild(currentSection);

        // --- ZONE 2 : BIBLIOTHÈQUE ---
        const librarySection = document.createElement('div');
        librarySection.innerHTML = '<h4 style="margin:10px 0 5px 0; color:green">Ajouter (Cliquer pour donner)</h4>';
        
        const libraryList = document.createElement('div');
        libraryList.className = 'deck-manager-section mini-card-grid';
        
        gameData.cards.forEach(card => {
            const el = document.createElement('div');
            el.className = 'mini-card';
            el.style.borderColor = '#4caf50'; // Vert
            el.title = "Ajouter au deck";
            el.innerHTML = `
                <img src="${card.img}" onerror="this.onerror=null;this.src='https://placehold.co/50?text=?'">
                <div style="font-size:0.6rem; padding:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${card.name}</div>
                <div class="action-overlay" style="background:rgba(0,255,0,0.3)">➕</div>
            `;
            
            // --- CORRECTION ICI ---
            el.onclick = () => {
                freshEntity.deck.push(card.id);
                renderManager();
                syncGameData(gameData); // Appel direct (sans window.)
            };
            libraryList.appendChild(el);
        });
        
        librarySection.appendChild(libraryList);
        container.appendChild(librarySection);
    };

    // Lancement initial
    renderManager();

   // Gestion fermeture
    modal.querySelector('.close-form').onclick = () => {
        saveBtn.style.display = 'inline-block';
        
        // ON RETIRE LA CLASSE XL ICI
        modal.querySelector('.modal-content').classList.remove('modal-xl'); 
        
        modal.style.display = 'none';
        render(); 
    };
}


// Remplace la fonction updateLocalData existante
function updateLocalData(newData) {
    // Si c'est le tout premier chargement de la page
    if (isFirstLoad) {
        gameData = newData;
        // On initialise la taille du deck sans déclencher d'animation
        if (currentUser.role === 'player') {
            const me = newData.players.find(p => p.id === currentUser.id);
            if (me) prevDeckSize = me.deck.length;
        }
        isFirstLoad = false; // On désactive le drapeau pour les prochaines fois
        render();
        return; // On arrête là pour cette fois
    }

    // Détection pour le Joueur : Est-ce que mon deck a grandi ?
    if (currentUser.role === 'player') {
        const meNew = newData.players.find(p => p.id === currentUser.id);
        
        // On s'assure que prevDeckSize est un nombre
        if (typeof prevDeckSize === 'undefined') prevDeckSize = 0;

        if (meNew && meNew.deck.length > prevDeckSize) {
            console.log("🎁 NOUVELLE CARTE DÉTECTÉE !");
            const newCardId = meNew.deck[meNew.deck.length - 1];
            // Petite sécurité : on vérifie que la carte existe vraiment
            if(newCardId) triggerChestAnimation(newCardId);
        }
        
        if (meNew) prevDeckSize = meNew.deck.length;
    }

    gameData = newData;
    render();
}

// --- ANIMATION COFFRE (VERSION SÉCURISÉE) ---
function triggerChestAnimation(newCardId) {
    const overlay = document.getElementById('chest-overlay');
    const display = document.getElementById('new-card-display');
    
    const card = gameData.cards.find(c => c.id === newCardId);
    if(!card) return;

    display.innerHTML = `
        <div style="position:relative; display:flex; flex-direction:column; align-items:center;">
            
            <img src="./assets/chest_anim.gif?t=${new Date().getTime()}" 
                 onerror="this.onerror=null; this.src='./assets/coffre.png'; this.style.width='150px';"
                 style="width:200px; height:auto; margin-bottom:-20px; z-index:2; filter: drop-shadow(0 0 20px gold);">
            
            <div id="anim-card-reveal" style="opacity:0; transform:scale(0.5); transition:all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                <div class="clash-card" style="transform: scale(1.2); background:white; margin-bottom:15px; box-shadow: 0 0 30px white;">
                    <div class="cost">${card.cost}</div>
                    <img src="${card.img}" onerror="this.src='https://placehold.co/100x120?text=?'">
                    <h4>${card.name}</h4>
                </div>
            </div>

            <p style="color:#ffd700; text-shadow:0 2px 4px black; font-size:1.2rem; text-align:center; z-index:5;">
                NOUVELLE CARTE !<br>
                <strong style="font-size:1.5rem; text-transform:uppercase;">${card.name}</strong>
            </p>
        </div>
    `;
    
    overlay.classList.remove('hidden');

    // Séquence
    setTimeout(() => {
        const cardDiv = document.getElementById('anim-card-reveal');
        if(cardDiv) {
            cardDiv.style.opacity = '1';
            cardDiv.style.transform = 'scale(1)';
        }
    }, 1500);

    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 6000);
    
    overlay.onclick = () => overlay.classList.add('hidden');
}

// 8. SYSTÈME (SAUVEGARDE & IMPORT)
function renderSystemModule(container) {
    container.innerHTML = `<h2>Gestion de la Session</h2>`;

    // 1. BLOC EXPORT (Sauvegarder)
    const exportBox = document.createElement('div');
    exportBox.className = 'system-box';
    exportBox.innerHTML = `
        <h3 style="color:var(--cr-blue)">💾 Sauvegarder la partie</h3>
        <p>Téléchargez un fichier .json contenant toutes les données actuelles (Joueurs, Cartes, Map, Chat...).</p>
        <button id="btn-backup" class="btn btn-primary">Télécharger la Sauvegarde</button>
    `;
    
    exportBox.querySelector('#btn-backup').onclick = () => {
        const dataStr = JSON.stringify(gameData, null, 2); // Beau JSON
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        // Création d'un lien invisible pour déclencher le téléchargement
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().split('T')[0];
        a.download = `manager-royale-backup-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    container.appendChild(exportBox);

    // 2. BLOC IMPORT (Restaurer)
    const importBox = document.createElement('div');
    importBox.className = 'system-box';
    importBox.style.border = '2px dashed #fcc22d'; // Bordure dorée attention
    importBox.innerHTML = `
        <h3 style="color:#d35400">⚠️ Restaurer une sauvegarde</h3>
        <p>Attention : Cela <strong>écrasera</strong> toutes les données actuelles de la session pour tous les joueurs !</p>
        
        <div class="file-upload-wrapper">
            <button class="btn btn-secondary">Choisir un fichier .JSON</button>
            <input type="file" id="file-input" accept=".json">
        </div>
    `;

    importBox.querySelector('#file-input').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (confirm("Êtes-vous sûr de vouloir écraser la partie actuelle avec ce fichier ? Cette action est irréversible.")) {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    
                    // Vérification sommaire que c'est bien un fichier Manager Royale
                    if (!importedData.players || !importedData.config) {
                        throw new Error("Format de fichier invalide.");
                    }

                    // Mise à jour locale
                    gameData = importedData;
                    
                    // Envoi à Supabase (propage à tout le monde)
                    saveData("♻️ Restauration du système effectuée.");
                    
                    alert("Succès ! La partie a été restaurée.");
                    render(); // Rafraîchir l'interface
                    
                } catch (err) {
                    alert("Erreur : Le fichier est corrompu ou invalide.\n" + err.message);
                }
            };
            
            reader.readAsText(file);
        } else {
            // Reset l'input si annulé
            e.target.value = ''; 
        }
    };
    container.appendChild(importBox);

    // 3. BLOC INFO TECHNIQUE
    const infoBox = document.createElement('div');
    infoBox.style.textAlign = 'center';
    infoBox.style.opacity = '0.6';
    infoBox.style.marginTop = '20px';
    infoBox.innerHTML = `<small>Session ID : <strong>${document.getElementById('session-input').value}</strong></small>`;
    container.appendChild(infoBox);
}

// --- GESTIONNAIRE DE RESSOURCES (MJ) - AVEC GESTION DU MAX ---
function openResourceManager() {
    const modal = document.getElementById('modal-form');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');

    saveBtn.style.display = 'none';
    modal.style.display = 'flex';
    document.getElementById('form-title').innerText = 'Types de Ressources';

    const renderList = () => {
        container.innerHTML = '<div style="margin-bottom:15px"><button id="btn-new-res" class="btn btn-primary">+ Nouvelle Ressource</button></div>';

        // 1. CRÉER
        container.querySelector('#btn-new-res').onclick = () => {
            modal.style.display = 'none';
            openFormModal('Nouvelle Ressource', [
                { name: 'name', label: 'Nom (ex: Mana)', value: '' },
                { name: 'icon', label: 'Emoji (ex: 🧿)', value: '🧿' },
                { name: 'color', label: 'Couleur', value: '#3498db' },
                { name: 'max', label: 'Maximum autorisé', type: 'number', value: '100' }, // Nouveau champ
                { name: 'id', label: 'ID Technique (minuscule)', value: 'mana' }
            ], (data) => {
                if(gameData.resourceTypes.find(r => r.id === data.id)) return alert("Cet ID existe déjà !");
                
                gameData.resourceTypes.push({
                    id: data.id.toLowerCase().replace(/\s/g, ''),
                    name: data.name,
                    icon: data.icon,
                    color: data.color,
                    max: parseInt(data.max) || 999999 // Stockage du max
                });
                saveData(`Ajout ressource : ${data.name}`);
                setTimeout(openResourceManager, 100);
            });
        };

        const list = document.createElement('div');
        list.style.maxHeight = '400px'; 
        list.style.overflowY = 'auto';

        gameData.resourceTypes.forEach((res, index) => {
            const row = document.createElement('div');
            row.className = 'panel';
            row.style.marginBottom = '10px';
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.borderLeft = `5px solid ${res.color}`;
            row.style.textAlign = 'left';

            // Affichage du Max dans la liste pour info
            const maxDisplay = res.max ? `/ ${res.max}` : '';

            row.innerHTML = `
                <div>
                    <span style="font-size:1.5rem; margin-right:10px;">${res.icon}</span>
                    <strong>${res.name}</strong> <small style="color:#888">(${res.id} ${maxDisplay})</small>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="btn" style="background:orange; font-size:0.7rem; padding:5px 8px;" id="edit-res-${index}">✏️</button>
                    <button class="btn" style="background:red; font-size:0.7rem; padding:5px 8px;" id="del-res-${index}">🗑️</button>
                </div>
            `;

            // 2. MODIFIER
            row.querySelector(`#edit-res-${index}`).onclick = () => {
                modal.style.display = 'none';
                openFormModal(`Modifier ${res.name}`, [
                    { name: 'name', label: 'Nom', value: res.name },
                    { name: 'icon', label: 'Emoji', value: res.icon },
                    { name: 'color', label: 'Couleur', value: res.color },
                    { name: 'max', label: 'Maximum', type: 'number', value: res.max || 999999 } // Edition du max
                ], (data) => {
                    res.name = data.name;
                    res.icon = data.icon;
                    res.color = data.color;
                    res.max = parseInt(data.max);
                    saveData(`Modif ressource : ${res.name}`);
                    setTimeout(openResourceManager, 100);
                });
            };

            // 3. SUPPRIMER
            row.querySelector(`#del-res-${index}`).onclick = () => {
                if(confirm(`Supprimer la ressource "${res.name}" ?`)) {
                    gameData.resourceTypes.splice(index, 1);
                    saveData();
                    renderList();
                }
            };
            list.appendChild(row);
        });
        container.appendChild(list);
    };

    renderList();

    modal.querySelector('.close-form').onclick = () => {
        saveBtn.style.display = 'inline-block';
        modal.style.display = 'none';
        render(); 
    };
}

// --- FIX MOBILE : RÉVEIL AUTOMATIQUE ---
// Détecte quand l'utilisateur revient sur l'onglet/appli
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log("👀 Retour sur l'app : Vérification des mises à jour...");
        // On force une reconnexion propre pour récupérer les dernières données
        const sid = document.getElementById('session-input').value;
        if(sid) connectToSession(sid); 
    }
});

// Détecte le focus (clic sur l'écran) pour les vieux téléphones
window.addEventListener('focus', () => {
    const sid = document.getElementById('session-input').value;
    if(sid && document.visibilityState === 'visible') {
        // On relance une synchro légère
        import('./cloud.js').then(module => module.joinSession(sid, (newData) => {
            updateLocalData(newData);
        }));
    }
});

// --- MODALE SPÉCIALE QUÊTE (MULTI-JOUEURS) ---
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