import { initialGameData, generateId, formatTime } from './data.js';
import { joinSession, createSession, syncGameData } from './cloud.js';

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
    // 1. INITIALISATION DES TYPES DE RESSOURCES (Si inexistant)
    if (!gameData.resourceTypes) {
        gameData.resourceTypes = [
            { id: 'gold', name: 'Or', icon: '💰', color: '#ffbd2e' },
            { id: 'elixir', name: 'Élixir', icon: '💧', color: '#d6308e' }
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

// 1. MAP & ATLAS
// MODULE MAP (AVEC POSITIONS SAUVEGARDÉES PAR CARTE)
// MODULE MAP (GESTION DE PRÉSENCE PAR ZONE)
function renderMapModule(container, isEditable) {
    // Initialisation Maps
    if (!gameData.maps) {
        gameData.maps = [{ id: 'default', name: 'Carte Principale', url: './assets/map.png', desc: 'Défaut' }];
        gameData.activeMapId = 'default';
        syncGameData(gameData);
    }

    // Carte Active
    let currentMap = gameData.maps.find(m => m.id === gameData.activeMapId) || gameData.maps[0];
    if(!currentMap || !currentMap.url) currentMap = { url: './assets/map.png', name: 'Défaut', id: 'default' };

    const wrapper = document.createElement('div');
    wrapper.className = 'map-container';
    wrapper.style.backgroundColor = '#222';
    
    // --- COUCHE 1 : L'IMAGE ---
    const img = document.createElement('img');
    img.src = currentMap.url;
    img.className = 'map-img';
    img.onerror = function() { this.style.display = 'none'; };
    wrapper.appendChild(img);

    // --- COUCHE 2 : INTERFACE DE GESTION (ROSTER) ---
    // Un panneau à droite pour voir où sont les joueurs et les amener ici
    if (isEditable) {
        const rosterPanel = document.createElement('div');
        rosterPanel.style.position = 'absolute';
        rosterPanel.style.top = '10px';
        rosterPanel.style.right = '10px';
        rosterPanel.style.width = '160px';
        rosterPanel.style.background = 'rgba(0,0,0,0.8)';
        rosterPanel.style.padding = '10px';
        rosterPanel.style.borderRadius = '8px';
        rosterPanel.style.color = 'white';
        rosterPanel.style.zIndex = '200';
        rosterPanel.style.maxHeight = '80%';
        rosterPanel.style.overflowY = 'auto';

        rosterPanel.innerHTML = '<h5 style="margin:0 0 10px 0; border-bottom:1px solid #555; padding-bottom:5px;">Présence Ici</h5>';

        [...gameData.players, ...gameData.npcs].forEach(entity => {
            // Initialisation de la mapId si elle n'existe pas
            if (!entity.mapId) entity.mapId = 'default';

            const isOnMap = entity.mapId === currentMap.id;
            
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.marginBottom = '5px';
            row.style.cursor = 'pointer';
            row.style.fontSize = '0.8rem';
            row.title = isOnMap ? "Déjà ici (Cliquer pour sélectionner)" : "Cliquer pour téléporter ici";

            row.innerHTML = `
                <div style="width:10px; height:10px; border-radius:50%; background:${isOnMap ? '#4caf50' : '#555'}; margin-right:8px; border:1px solid white;"></div>
                <img src="${entity.avatar}" style="width:20px; height:20px; border-radius:50%; margin-right:5px; opacity:${isOnMap ? 1 : 0.5}">
                <span style="opacity:${isOnMap ? 1 : 0.5}">${entity.name}</span>
            `;

            row.onclick = (e) => {
                e.stopPropagation(); // Ne pas cliquer sur la carte en dessous
                
                if (!isOnMap) {
                    // TÉLÉPORTATION : On change son mapId et on le met au centre
                    if(confirm(`Déplacer ${entity.name} vers cette carte ?`)) {
                        entity.mapId = currentMap.id;
                        entity.x = 50; 
                        entity.y = 50;
                        syncGameData(gameData);
                        render();
                    }
                } else {
                    // SÉLECTION : Si déjà là, on le sélectionne
                    selectedEntityId = entity.id;
                    render();
                }
            };
            rosterPanel.appendChild(row);
        });

        wrapper.appendChild(rosterPanel);

        // Bouton Atlas (déplacé à gauche pour pas gêner)
        const btnManage = document.createElement('button');
        btnManage.className = 'btn btn-secondary';
        btnManage.innerHTML = '🗺️ Atlas';
        btnManage.style.position = 'absolute';
        btnManage.style.top = '10px'; btnManage.style.left = '10px'; btnManage.style.zIndex = '50';
        btnManage.onclick = () => openMapManager();
        wrapper.appendChild(btnManage);
    }

    // --- LOGIQUE DE DÉPLACEMENT ---
    if(isEditable) {
        wrapper.addEventListener('click', (e) => {
            if(e.target.tagName === 'BUTTON') return;

            if (selectedEntityId) {
                let entity = findEntityById(selectedEntityId);
                
                // On ne peut bouger que si l'entité est SUR CETTE CARTE
                if (entity && entity.mapId === currentMap.id) {
                    const rect = wrapper.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    
                    entity.x = x; 
                    entity.y = y;
                    syncGameData(gameData); 
                    render(); 
                } else if (entity) {
                    alert(`${entity.name} n'est pas sur cette carte ! Utilisez le menu à droite pour le faire venir.`);
                }
            }
        });
    }

    // --- COUCHE 3 : RENDU DES PIONS (FILTRÉ) ---
    [...gameData.players, ...gameData.npcs].forEach(entity => {
        // FILTRE CRUCIAL : On n'affiche le pion QUE si son mapId correspond à la carte active
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
            { name: 'url', label: 'URL Image (laisser vide pour défaut)', value: '' }, // Vide par défaut
            { name: 'desc', label: 'Description', type: 'textarea', value: '' }
        ], (data) => {
            // FIX 1 : Si l'URL est vide, on force une image locale par défaut
            const safeUrl = data.url && data.url.trim() !== '' ? data.url : './assets/map.png';

            gameData.maps.push({ 
                id: generateId(), 
                name: data.name || 'Sans Nom', // Nom par défaut 
                url: safeUrl, 
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
        
        // FIX 2 : Gestion d'erreur sans réseau (on remplace l'image par un emoji si elle plante)
        // On évite les liens externes type 'placehold.co' qui causent tes bugs
        row.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center">
                <div>
                    <strong>${m.name}</strong> ${isActive ? '✅' : ''}<br>
                    <small style="opacity:0.7">${m.desc || ''}</small>
                </div>
                <div class="map-thumb-container" style="width:50px; height:30px; border:1px solid #ccc; margin:0 10px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:#eee;">
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
                { name: 'url', label: 'URL', value: m.url },
                { name: 'desc', label: 'Description', type: 'textarea', value: m.desc || '' }
            ], (data) => {
                m.name = data.name; 
                // Si vide à la modif, on garde l'ancienne ou on met défaut
                m.url = data.url && data.url.trim() !== '' ? data.url : './assets/map.png';
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

// 2. PLAYERS (CORRIGÉ : SYNTAXE + BUG VISUEL)
function renderPlayersModule(container) {
    container.innerHTML = `
        <div style="margin-bottom:15px; display:flex; gap:10px;">
            <button id="btn-add-p" class="btn btn-primary" style="flex:1">+ Nouveau Personnage</button>
            <button id="btn-manage-res" class="btn btn-secondary">💎 Gérer Ressources</button>
        </div>
    `;
    
    // Listeners
    document.getElementById('btn-manage-res').onclick = () => openResourceManager();
    document.getElementById('btn-add-p').onclick = () => {
        openFormModal('Créer Personnage', [
            { name: 'name', label: 'Nom', value: '' },
            { name: 'type', label: 'Type', type: 'select', options: [{value:'player', label:'Joueur'}, {value:'npc', label:'PNJ'}], value: 'player' },
            { name: 'avatar', label: 'URL Avatar', value: 'https://cdn-icons-png.flaticon.com/512/147/147144.png' },
            { name: 'desc', label: 'Description', type: 'textarea', value: '' }
        ], (data) => {
            const newChar = { 
                id: generateId(), 
                name: data.name, 
                avatar: data.avatar, 
                desc: data.desc, 
                deck: [], 
                inventory: '', 
                x: 50, y: 50 
            };
            if(data.type === 'player') gameData.players.push(newChar); else gameData.npcs.push(newChar);
            
            // CORRECTION SYNTAXE ICI (Ajout des backticks ` `)
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
                const val = (char[res.id] !== undefined && char[res.id] !== null) ? char[res.id] : 0;
                resourcesHtml += `
                    <div style="display:flex; align-items:center; background:#eee; padding:2px 5px; border-radius:4px;">
                        <span style="font-size:0.8rem; margin-right:2px;" title="${res.name}">${res.icon}</span> 
                        <input type="number" class="res-input" data-id="${char.id}" data-type="${res.id}" style="width:50px; padding:2px; border:1px solid #ccc;" value="${val}">
                    </div>`;
            });
            resourcesHtml += '</div>';
        }

        // CORRECTION BUG VISUEL : Si la desc est "undefined" (texte), on met vide
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
                { name: 'desc', label: 'Description', type: 'textarea', value: cleanDesc },
                { name: 'inventory', label: 'Inventaire', type: 'textarea', value: char.inventory || '' }
            ], (data) => {
                char.name = data.name; char.avatar = data.avatar;
                char.desc = data.desc; char.inventory = data.inventory;
                // CORRECTION SYNTAXE ICI
                saveData(`Modification de ${char.name}`);
            });
        };
        row.querySelector(`#del-${char.id}`).onclick = () => {
            if(confirm(`Supprimer ${char.name} ?`)) {
                if(type === 'player') gameData.players = gameData.players.filter(p => p.id !== char.id);
                else gameData.npcs = gameData.npcs.filter(p => p.id !== char.id);
                // CORRECTION SYNTAXE ICI
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

// 5. RELATIONS V2 (FIX COULEURS + HOVER)
function renderRelationsModule(container) {
    if (!gameData.relations) gameData.relations = [];
    const entities = [...gameData.players, ...gameData.npcs];

    if(entities.length < 2) {
        return container.innerHTML = '<div class="panel" style="color:#333">Il faut au moins 2 personnages pour avoir des relations.</div>';
    }

    // Sélection par défaut
    if (!selectedRelCharId || !entities.find(e => e.id === selectedRelCharId)) {
        selectedRelCharId = entities[0].id;
    }

    const selectedEntity = entities.find(e => e.id === selectedRelCharId);

    // 1. EN-TÊTE (Avec couleurs forcées et Zone de Nom)
    container.innerHTML = `
        <h2 style="color:var(--cr-blue-dark); text-align:center; margin-bottom:5px;">Réseau d'Influence</h2>
        <p class="hint" style="color:#555; text-align:center; margin:0 0 10px 0;">
            Sélectionnez un personnage pour voir son point de vue.
        </p>
        
        <div id="rel-name-display" style="height:30px; line-height:30px; text-align:center; font-weight:900; color:var(--cr-blue); font-size:1.2rem; text-transform:uppercase; margin-bottom:5px;">
            ${selectedEntity ? selectedEntity.name : ''}
        </div>
    `;

    // 2. SÉLECTEUR (Haut)
    const selector = document.createElement('div');
    selector.className = 'rel-selector';
    
    entities.forEach(e => {
        const img = document.createElement('img');
        img.src = e.avatar;
        img.className = `rel-avatar-select ${e.id === selectedRelCharId ? 'active' : ''}`;
        img.title = e.name; // Tooltip natif au cas où
        img.onerror = function() { this.src='https://placehold.co/60'; };
        
        // --- INTERACTION HOVER ---
        img.onmouseenter = () => {
            document.getElementById('rel-name-display').innerText = e.name;
        };
        img.onmouseleave = () => {
            // Quand on quitte, on remet le nom du perso sélectionné
            const current = entities.find(x => x.id === selectedRelCharId);
            document.getElementById('rel-name-display').innerText = current ? current.name : '';
        };

        img.onclick = () => {
            selectedRelCharId = e.id;
            renderRelationsModule(container); // Recharger la vue
        };
        selector.appendChild(img);
    });
    container.appendChild(selector);

    // 3. LE TABLEAU DE BORD (3 Colonnes)
    const board = document.createElement('div');
    board.className = 'rel-board';

    const cols = {
        friendly: { title: '💚 Alliés / Amis', color: '#28a745', list: [] },
        neutral:  { title: '😐 Neutres / Inconnus', color: '#6c757d', list: [] },
        hostile:  { title: '❤️ Hostiles / Ennemis', color: '#dc3545', list: [] }
    };

    entities.forEach(target => {
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
        
        // Couleur forcée ici aussi pour être sûr
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
                    <div style="flex:1; color:#333;"> <strong>${char.name}</strong>
                    </div>
                    <div style="font-size:1.2rem">${icon}</div>
                `;

                if(currentUser.role === 'dm') {
                    card.title = "Cliquez pour changer la relation";
                    card.onclick = () => {
                        cycleRelation(selectedRelCharId, char.id, char.realStatus);
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

// MODULE JOUEUR: PROFIL & STATS (INVENTAIRE VERROUILLÉ)
// MODULE JOUEUR: PROFIL (RESSOURCES DYNAMIQUES)
function renderPlayerStats(container, p) {
    // Génération dynamique des pilules
    let pillsHtml = '';
    if (gameData.resourceTypes) {
        gameData.resourceTypes.forEach(res => {
            const val = p[res.id] !== undefined ? p[res.id] : 0;
            // Calcul d'une couleur plus claire pour le texte
            pillsHtml += `
                <div class="res-pill">
                    <div class="res-icon" style="background:${res.color}; color:white">${res.icon}</div>
                    <span style="color:${res.color}; filter:brightness(1.5)">${val}</span>
                </div>
            `;
        });
    }

    const header = document.createElement('div');
    header.className = 'profile-header';
    header.innerHTML = `
        <img src="${p.avatar}" class="profile-avatar" onerror="this.onerror=null;this.src='https://cdn-icons-png.flaticon.com/512/147/147144.png'">
        <div class="profile-name">${p.name}</div>
        <div class="resource-row" style="flex-wrap:wrap">
            ${pillsHtml}
        </div>
        <div style="margin-top:10px; font-size:0.8rem; font-style:italic; opacity:0.8">
            ${p.desc || 'Un héros sans histoire...'}
        </div>
    `;
    container.appendChild(header);

    // Le reste ne change pas (Inventaire lecture seule + Deck)
    const dashboard = document.createElement('div');
    dashboard.className = 'player-dashboard';
    
    dashboard.innerHTML += `<h3 style="color:var(--cr-wood); margin-top:20px;">🎒 Inventaire</h3>`;
    const invInput = document.createElement('textarea');
    invInput.className = 'inventory-box';
    invInput.value = p.inventory || 'Votre sac est vide.';
    invInput.readOnly = true; 
    invInput.style.backgroundColor = '#e6e6e6'; 
    invInput.style.color = '#555';
    invInput.style.cursor = 'default';
    invInput.style.outline = 'none';
    dashboard.appendChild(invInput);

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

// --- GESTIONNAIRE DE DECK (MJ) - VERSION ROBUSTE ---
function openDeckManager(entityArg) {
    const modal = document.getElementById('modal-form');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');
    
    // On garde l'ID en mémoire
    const targetId = entityArg.id;

    saveBtn.style.display = 'none'; // Pas de bouton save, c'est instantané
    modal.style.display = 'flex';

    // Fonction qui redessine le contenu de la fenêtre
    const renderManager = () => {
        // 1. On récupère la version la plus récente du personnage
        const freshEntity = findEntityById(targetId);
        
        // Sécurité : si le perso n'existe plus
        if (!freshEntity) return modal.style.display = 'none';

        // Mise à jour du titre
        const typeLabel = gameData.players.some(p => p.id === targetId) ? 'Joueur' : 'PNJ';
        document.getElementById('form-title').innerText = `Deck de ${freshEntity.name} (${typeLabel})`;
        
        container.innerHTML = ''; 

        // --- SECTION 1 : CARTES POSSÉDÉES ---
        const currentSection = document.createElement('div');
        currentSection.innerHTML = '<h4 style="margin:0 0 5px 0; color:var(--cr-blue)">Inventaire (Cliquer pour retirer)</h4>';
        
        const currentList = document.createElement('div');
        currentList.className = 'deck-manager-section mini-card-grid';
        
        if (!freshEntity.deck) freshEntity.deck = [];

        if (freshEntity.deck.length === 0) {
            currentList.innerHTML = '<p style="font-size:0.8rem; color:#888; width:100%; padding:10px;">Le deck est vide.</p>';
        } else {
            freshEntity.deck.forEach((cardId, index) => {
                const card = gameData.cards.find(c => c.id === cardId);
                if (card) {
                    const el = document.createElement('div');
                    el.className = 'mini-card';
                    el.style.borderColor = '#ff4d4d'; // Rouge
                    el.title = "Retirer";
                    el.innerHTML = `
                        <img src="${card.img}" onerror="this.onerror=null;this.src='https://placehold.co/50?text=?'">
                        <div style="font-size:0.6rem; padding:2px; white-space:nowrap; overflow:hidden;">${card.name}</div>
                        <div class="action-overlay" style="background:rgba(255,0,0,0.3)">✖</div>
                    `;
                    
                    // ACTION : RETIRER
                    el.onclick = () => {
                        freshEntity.deck.splice(index, 1); // 1. Modifie le tableau local
                        renderManager();                   // 2. Rafraîchit la fenêtre IMMÉDIATEMENT
                        window.syncGameData(gameData);            // 3. Sauvegarde silencieuse
                    };
                    currentList.appendChild(el);
                }
            });
        }
        currentSection.appendChild(currentList);
        container.appendChild(currentSection);

        // --- SECTION 2 : AJOUTER DES CARTES ---
        const librarySection = document.createElement('div');
        librarySection.innerHTML = '<h4 style="margin:10px 0 5px 0; color:green">Bibliothèque (Cliquer pour ajouter)</h4>';
        
        const libraryList = document.createElement('div');
        libraryList.className = 'deck-manager-section mini-card-grid';
        
        gameData.cards.forEach(card => {
            const el = document.createElement('div');
            el.className = 'mini-card';
            el.style.borderColor = '#4caf50'; // Vert
            el.title = "Ajouter";
            el.innerHTML = `
                <img src="${card.img}" onerror="this.onerror=null;this.src='https://placehold.co/50?text=?'">
                <div style="font-size:0.6rem; padding:2px; white-space:nowrap; overflow:hidden;">${card.name}</div>
                <div class="action-overlay" style="background:rgba(0,255,0,0.3)">➕</div>
            `;
            
            // ACTION : AJOUTER
            el.onclick = () => {
                freshEntity.deck.push(card.id); // 1. Modifie le tableau local
                renderManager();                // 2. Rafraîchit la fenêtre IMMÉDIATEMENT
                window.syncGameData(gameData);         // 3. Sauvegarde silencieuse
            };
            libraryList.appendChild(el);
        });
        
        librarySection.appendChild(libraryList);
        container.appendChild(librarySection);
    };

    // Premier affichage
    renderManager();

    // Gestion de fermeture
    modal.querySelector('.close-form').onclick = () => {
        saveBtn.style.display = 'inline-block';
        modal.style.display = 'none';
        render(); // Un dernier rafraîchissement global pour être sûr
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

// --- GESTIONNAIRE DE RESSOURCES (MJ) ---
function openResourceManager() {
    const modal = document.getElementById('modal-form');
    const container = document.getElementById('form-fields');
    const saveBtn = document.getElementById('btn-form-save');

    saveBtn.style.display = 'none';
    modal.style.display = 'flex';
    document.getElementById('form-title').innerText = 'Types de Ressources';

    const renderList = () => {
        container.innerHTML = '<div style="margin-bottom:15px"><button id="btn-new-res" class="btn btn-primary">+ Nouvelle Ressource</button></div>';

        // Action Créer
        container.querySelector('#btn-new-res').onclick = () => {
            modal.style.display = 'none';
            openFormModal('Nouvelle Ressource', [
                { name: 'name', label: 'Nom (ex: Mana)', value: '' },
                { name: 'icon', label: 'Emoji/Icone (ex: 🧿)', value: '🧿' },
                { name: 'color', label: 'Couleur (Hex ou nom)', value: '#3498db' },
                { name: 'id', label: 'ID Technique (minuscules, sans espace)', value: 'mana' }
            ], (data) => {
                // On vérifie que l'ID est unique
                if(gameData.resourceTypes.find(r => r.id === data.id)) return alert("Cet ID existe déjà !");
                
                gameData.resourceTypes.push({
                    id: data.id.toLowerCase().replace(/\s/g, ''),
                    name: data.name,
                    icon: data.icon,
                    color: data.color
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

            row.innerHTML = `
                <div>
                    <span style="font-size:1.5rem; margin-right:10px;">${res.icon}</span>
                    <strong>${res.name}</strong> <small style="color:#888">(${res.id})</small>
                </div>
                <div>
                    <button class="btn" style="background:red; font-size:0.7rem; padding:5px;" id="del-res-${index}">🗑️</button>
                </div>
            `;

            row.querySelector(`#del-res-${index}`).onclick = () => {
                if(confirm(`Supprimer la ressource "${res.name}" ?\nCela ne supprimera pas les valeurs stockées sur les joueurs, mais l'affichage disparaîtra.`)) {
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
        render(); // Rafraîchir l'interface globale
    };
}
