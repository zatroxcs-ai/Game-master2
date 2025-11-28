// Configuration initiale et modèles
export const APP_CONFIG = {
    // Remplacer par vos clés Supabase
    SUPABASE_URL: 'https://zbxhopdsokkjtzlxxhsq.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpieGhvcGRzb2tranR6bHh4aHNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzNjQ5MDQsImV4cCI6MjA3OTk0MDkwNH0.WrMwE5kipZDBqzSXRMeR7zTwCl92mYyy8r669wCPkFM'
};

export const initialGameData = {
    config: {
        mapUrl: '/map.png',
        mapName: 'Arène Royale'
    },
    players: [], // { id, name, avatar, gold, elixir, darkElixir, inventory, deck: [], x: 50, y: 50 }
    npcs: [],    // Même structure que players
    chat: [],    // { id, sender, text, timestamp, channel: 'global'|'private', targetId }
    cards: [     // Database de cartes
        { id: 'c1', name: 'Chevalier', cost: 3, type: 'troupe', img: 'https://statsroyale.com/images/cards/full/knight.png', desc: 'Un combattant de mêlée robuste.' },
        { id: 'c2', name: 'Mousquetaire', cost: 4, type: 'troupe', img: 'https://statsroyale.com/images/cards/full/musketeer.png', desc: 'Tire de loin.' },
        { id: 'c3', name: 'Boule de Feu', cost: 4, type: 'sort', img: 'https://statsroyale.com/images/cards/full/fireball.png', desc: 'Boum !' }
    ],
    relations: [], // { sourceId, targetId, status: 'friendly'|'hostile'|'neutral' }
    quests: [],    // { id, title, desc, reward, assignedTo: [], completed: false }
    logs: []       // { text, timestamp }
};

// Helper pour générer des IDs
export function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Helper pour formater l'heure
export function formatTime(isoString) {
    const d = new Date(isoString);
    return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}
