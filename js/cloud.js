import { APP_CONFIG } from './data.js';

const { createClient } = window.supabase;

const supabase = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY);

let currentSessionId = null;
let onDataUpdateCallback = null;

// Initialiser la connexion
export async function joinSession(sessionId, onUpdate) {
    currentSessionId = sessionId;
    onDataUpdateCallback = onUpdate;

    // 1. Récupérer les données initiales
    const { data, error } = await supabase
        .from('sessions')
        .select('data')
        .eq('id', sessionId)
        .single();

    if (error && error.code === 'PGRST116') {
        // La session n'existe pas, on retourne null pour que l'app demande de créer
        return null;
    } else if (data) {
        onUpdate(data.data);
    }

    // 2. Souscrire aux changements temps réel
    supabase
        .channel('game-updates')
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'sessions', 
            filter: `id=eq.${sessionId}` 
        }, payload => {
            console.log('Update received:', payload);
            if(payload.new && payload.new.data) {
                onUpdate(payload.new.data);
            }
        })
        .subscribe();
        
    return true;
}

export async function createSession(sessionId, initialData) {
    const { error } = await supabase
        .from('sessions')
        .insert([{ id: sessionId, data: initialData }]);
    
    if (error) {
        console.error("Erreur création:", error);
        return false;
    }
    return true;
}

// Fonction pour envoyer les mises à jour (Debounced idéalement, mais simple ici)
export async function syncGameData(gameData) {
    if (!currentSessionId) return;

    // Logique optimiste : on n'attend pas la réponse pour l'UI, 
    // mais on envoie à la DB.
    await supabase
        .from('sessions')
        .update({ data: gameData, updated_at: new Date() })
        .eq('id', currentSessionId);
}
