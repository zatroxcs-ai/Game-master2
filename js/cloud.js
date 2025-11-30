import { APP_CONFIG } from './data.js';

if (!window.supabase) { alert("ERREUR : Supabase non chargé. Vérifiez index.html"); }

const { createClient } = window.supabase;
const supabase = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY);

let currentSessionId = null;
let subscription = null;

export async function joinSession(sessionId, onUpdate) {
    currentSessionId = sessionId;
    // 1. Données initiales
    const { data, error } = await supabase.from('sessions').select('data').eq('id', sessionId).single();
    if (data) onUpdate(data.data);

    // 2. Temps réel
    if (subscription) supabase.removeChannel(subscription);
    subscription = supabase.channel('public:sessions')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, 
        (payload) => { if (payload.new && payload.new.data) onUpdate(payload.new.data); })
        .subscribe();
    return true;
}

export async function createSession(sessionId, initialData) {
    const { error } = await supabase.from('sessions').insert([{ id: sessionId, data: initialData }]);
    return !error;
}

export async function syncGameData(gameData) {
    if (!currentSessionId) return;
    await supabase.from('sessions').update({ data: gameData, updated_at: new Date() }).eq('id', currentSessionId);
}