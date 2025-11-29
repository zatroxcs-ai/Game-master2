import { APP_CONFIG } from './data.js';

// Vérification de sécurité
if (!window.supabase) {
    alert("ERREUR CRITIQUE : La librairie Supabase n'est pas chargée. Vérifiez index.html");
}

const { createClient } = window.supabase;
const supabase = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY);

let currentSessionId = null;
let subscription = null;

// Initialiser la connexion et écouter les changements
export async function joinSession(sessionId, onUpdate) {
    currentSessionId = sessionId;

    // 1. Récupérer les données initiales (Une seule fois au chargement)
    const { data, error } = await supabase
        .from('sessions')
        .select('data')
        .eq('id', sessionId)
        .single();

    if (error || !data) {
        console.warn("Session introuvable ou erreur:", error);
        return false; // La session n'existe pas
    }

    // On met à jour l'interface immédiatement avec les données reçues
    onUpdate(data.data);

    // 2. Mettre en place l'écoute Temps Réel (Websockets)
    if (subscription) supabase.removeChannel(subscription); // Nettoyage ancienne connexion

    subscription = supabase
        .channel('public:sessions') // Nom du canal
        .on('postgres_changes', 
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'sessions', 
                filter: `id=eq.${sessionId}` 
            }, 
            (payload) => {
                console.log('🔄 Mise à jour reçue !', payload);
                if (payload.new && payload.new.data) {
                    onUpdate(payload.new.data);
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`✅ Connecté au canal temps réel pour la session ${sessionId}`);
            } else if (status === 'CHANNEL_ERROR') {
                console.error('❌ Erreur de connexion temps réel. Vérifiez que "Realtime" est activé dans Supabase.');
            }
        });
        
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

// Fonction pour envoyer les mises à jour
export async function syncGameData(gameData) {
    if (!currentSessionId) return;

    // On envoie la nouvelle version à la base de données
    const { error } = await supabase
        .from('sessions')
        .update({ data: gameData, updated_at: new Date() })
        .eq('id', currentSessionId);

    if (error) console.error("Erreur de sauvegarde:", error);
}

window.syncGameData = syncGameData;
