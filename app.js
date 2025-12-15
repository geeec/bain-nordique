// === Configuration ===
const CONFIG = {
    API_URL: 'https://bain-nordique-api.geec.workers.dev',
    VOLUME_M3: 1.5,
    PH_IDEAL_MIN: 7.2,
    PH_IDEAL_MAX: 7.6,
    BROME_IDEAL_MIN: 2,
    BROME_IDEAL_MAX: 4,
    CYCLE_ACTIVATEUR_JOURS: 14,
    CYCLE_BALLES_JOURS: 30,
    DOSAGES: {
        ph_moins: { parM3: 30, unite: 'g', effet: '-0.4 pH' },
        ph_plus: { parM3: 15, unite: 'g', effet: '+0.2 pH' },
        brome: { parM3: 2, unite: 'tablettes', type: 'tablettes 20g' },
        activateur: { parM3: 15, unite: 'g' },
        choc: { parM3: 20, unite: 'g' },
        anti_ecume: { parM3: 1, unite: 'bouchon(s)' },
        eau_eclatante_preventif: { parM3: 2, unite: 'bouchon(s)' },
        eau_eclatante_curatif: { parM3: 4, unite: 'bouchon(s)' }
    }
};

// === État de l'application ===
let state = {
    mesures: [],
    baignades: [],
    config: {
        date_mise_en_eau: null,
        mode_hivernage: 'false',
        dernier_nettoyage_balles: null,
        alerte_gel_validee: 'false',
        topic_ntfy: ''
    },
    meteo: null
};

// === Initialisation ===
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initForms();
    initButtons();
    loadAllData();
});

// === API Calls ===
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showToast('Erreur de connexion au serveur', 'error');
        return null;
    }
}

async function loadAllData() {
    showToast('Chargement...', 'info');
    
    // Charger en parallèle
    const [mesures, baignades, config, meteo] = await Promise.all([
        apiCall('/api/mesures'),
        apiCall('/api/baignades'),
        apiCall('/api/config'),
        apiCall('/api/meteo')
    ]);
    
    if (mesures) state.mesures = mesures;
    if (baignades) state.baignades = baignades;
    if (config) state.config = config;
    if (meteo) state.meteo = meteo;
    
    updateUI();
    showToast('Données chargées !', 'success');
}

// === Navigation ===
function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });
    
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });
    
    if (page === 'dashboard') updateDashboard();
    if (page === 'mesure') updateMesurePage();
    if (page === 'historique') updateHistorique();
    if (page === 'gestion') updateGestion();
}

// === Forms ===
function initForms() {
    document.getElementById('form-mesure').addEventListener('submit', (e) => {
        e.preventDefault();
        enregistrerMesure();
    });
    
    document.getElementById('form-baignade').addEventListener('submit', (e) => {
        e.preventDefault();
        enregistrerBaignade();
    });
    
    document.getElementById('transparence').addEventListener('input', (e) => {
        document.getElementById('transparence-value').textContent = e.target.value;
    });
    
    ['ph', 'brome', 'couleur', 'ecume', 'transparence'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateDosagesPreview);
    });
}

// === Buttons ===
function initButtons() {
    document.getElementById('btn-baignade').addEventListener('click', () => {
        document.getElementById('modal-baignade').style.display = 'flex';
    });
    
    document.getElementById('btn-vidange').addEventListener('click', declarerVidange);
    document.getElementById('btn-hivernage').addEventListener('click', toggleHivernage);
    document.getElementById('btn-nettoyer-balles').addEventListener('click', marquerBallesNettoyees);
    document.getElementById('btn-save-config').addEventListener('click', sauvegarderConfig);
    document.getElementById('btn-test-notif').addEventListener('click', testerNotification);
    document.getElementById('btn-export').addEventListener('click', exporterCSV);
    document.getElementById('btn-reset').addEventListener('click', resetApplication);
    document.getElementById('btn-valider-gel').addEventListener('click', validerAlerteGel);
}

// === Mesures ===
async function enregistrerMesure() {
    const form = document.getElementById('form-mesure');
    const formData = new FormData(form);
    
    const mesure = {
        date: new Date().toISOString(),
        ph: parseFloat(formData.get('ph')) || null,
        brome: parseFloat(formData.get('brome')) || null,
        temperature: parseFloat(formData.get('temperature')) || null,
        transparence: parseInt(formData.get('transparence')),
        couleur: formData.get('couleur'),
        ecume: formData.get('ecume') === 'on',
        notes: formData.get('notes'),
        checklist: {
            mesure: formData.get('check_mesure') === 'on',
            produits: formData.get('check_produits') === 'on',
            activateur: formData.get('check_activateur') === 'on',
            eclatante: formData.get('check_eclatante') === 'on',
            niveau: formData.get('check_niveau') === 'on'
        },
        dosagesRecommandes: calculerDosages(
            parseFloat(formData.get('ph')),
            parseFloat(formData.get('brome')),
            formData.get('couleur'),
            formData.get('ecume') === 'on',
            parseInt(formData.get('transparence'))
        )
    };
    
    const result = await apiCall('/api/mesures', 'POST', mesure);
    
    if (result && result.success) {
        form.reset();
        document.getElementById('transparence-value').textContent = '1';
        document.getElementById('dosages-preview').style.display = 'none';
        
        showToast('Mesure enregistrée !', 'success');
        await loadAllData();
        navigateTo('dashboard');
    }
}

function calculerDosages(ph, brome, couleur, ecume, transparence) {
    const dosages = [];
    const vol = CONFIG.VOLUME_M3;
    
    if (ph !== null && !isNaN(ph)) {
        if (ph > CONFIG.PH_IDEAL_MAX) {
            const ecart = ph - CONFIG.PH_IDEAL_MAX;
            const doses = Math.ceil(ecart / 0.4);
            const quantite = doses * CONFIG.DOSAGES.ph_moins.parM3 * vol;
            dosages.push({
                produit: 'pH moins',
                quantite: `${quantite} ${CONFIG.DOSAGES.ph_moins.unite}`,
                raison: `pH trop élevé (${ph})`
            });
        } else if (ph < CONFIG.PH_IDEAL_MIN) {
            const ecart = CONFIG.PH_IDEAL_MIN - ph;
            const doses = Math.ceil(ecart / 0.2);
            const quantite = doses * CONFIG.DOSAGES.ph_plus.parM3 * vol;
            dosages.push({
                produit: 'pH plus',
                quantite: `${quantite} ${CONFIG.DOSAGES.ph_plus.unite}`,
                raison: `pH trop bas (${ph})`
            });
        }
    }
    
    if (brome !== null && !isNaN(brome)) {
        if (brome < CONFIG.BROME_IDEAL_MIN) {
            const quantite = CONFIG.DOSAGES.brome.parM3 * vol;
            dosages.push({
                produit: 'Brome',
                quantite: `${Math.round(quantite)} tablettes`,
                raison: `Brome insuffisant (${brome} mg/L)`
            });
        }
    }
    
    if (couleur === 'verte') {
        const quantite = CONFIG.DOSAGES.choc.parM3 * vol;
        dosages.push({
            produit: 'Choc sans chlore',
            quantite: `${quantite} ${CONFIG.DOSAGES.choc.unite}`,
            raison: 'Eau verte'
        });
    }
    
    if (ecume) {
        const quantite = CONFIG.DOSAGES.anti_ecume.parM3 * vol;
        dosages.push({
            produit: 'Anti-écume',
            quantite: `${quantite} ${CONFIG.DOSAGES.anti_ecume.unite}`,
            raison: 'Présence d\'écume'
        });
    }
    
    if (transparence > 2) {
        const quantite = CONFIG.DOSAGES.eau_eclatante_curatif.parM3 * vol;
        dosages.push({
            produit: 'Eau éclatante (curatif)',
            quantite: `${quantite} ${CONFIG.DOSAGES.eau_eclatante_curatif.unite}`,
            raison: `Eau trouble (transparence: ${transparence}/5)`
        });
    }
    
    return dosages;
}

function updateDosagesPreview() {
    const ph = parseFloat(document.getElementById('ph').value);
    const brome = parseFloat(document.getElementById('brome').value);
    const couleur = document.getElementById('couleur').value;
    const ecume = document.getElementById('ecume').checked;
    const transparence = parseInt(document.getElementById('transparence').value);
    
    const dosages = calculerDosages(ph, brome, couleur, ecume, transparence);
    
    const container = document.getElementById('dosages-preview');
    const list = document.getElementById('dosages-list');
    
    if (dosages.length > 0) {
        list.innerHTML = dosages.map(d => `
            <div class="dosage-item">
                <span class="product">${d.produit}</span>
                <span class="quantity">${d.quantite}</span>
            </div>
        `).join('');
        container.style.display = 'block';
    } else if (ph || brome) {
        list.innerHTML = '<p style="color: var(--success);">✅ Aucun traitement nécessaire</p>';
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

// === Baignades ===
async function enregistrerBaignade() {
    const personnes = parseInt(document.getElementById('baignade-personnes').value);
    const duree = parseInt(document.getElementById('baignade-duree').value);
    
    const baignade = {
        date: new Date().toISOString(),
        nbPersonnes: personnes,
        dureeMinutes: duree
    };
    
    const result = await apiCall('/api/baignades', 'POST', baignade);
    
    if (result && result.success) {
        closeModal();
        showToast('Baignade enregistrée !', 'success');
        await loadAllData();
    }
}

function closeModal() {
    document.getElementById('modal-baignade').style.display = 'none';
}

// === Gestion du bain ===
async function declarerVidange() {
    if (!confirm('Confirmer la vidange et le remplissage du bain ?')) return;
    
    const result = await apiCall('/api/vidange', 'POST');
    
    if (result && result.success) {
        document.getElementById('modal-mise-en-service').style.display = 'flex';
        showToast('Vidange enregistrée !', 'success');
        await loadAllData();
    }
}

function closeMiseEnService() {
    document.getElementById('modal-mise-en-service').style.display = 'none';
    document.querySelectorAll('#checklist-mise-en-service input').forEach(cb => cb.checked = false);
    updateGestion();
    navigateTo('dashboard');
}

async function toggleHivernage() {
    const result = await apiCall('/api/hivernage', 'POST');
    
    if (result && result.success) {
        state.config.mode_hivernage = result.modeHivernage ? 'true' : 'false';
        updateGestion();
        updateDashboard();
        
        const msg = result.modeHivernage 
            ? 'Mode hivernage activé' 
            : 'Mode hivernage désactivé';
        showToast(msg, 'success');
    }
}

async function marquerBallesNettoyees() {
    const result = await apiCall('/api/balles', 'POST');
    
    if (result && result.success) {
        state.config.dernier_nettoyage_balles = result.date;
        updateGestion();
        showToast('Nettoyage des balles enregistré !', 'success');
    }
}

async function validerAlerteGel() {
    const result = await apiCall('/api/alerte-gel/valider', 'POST');
    
    if (result && result.success) {
        state.config.alerte_gel_validee = 'true';
        updateDashboard();
        showToast('Alerte validée', 'success');
    }
}

// === Configuration ===
async function sauvegarderConfig() {
    const topic = document.getElementById('topic-ntfy').value.trim();
    
    const result = await apiCall('/api/config', 'POST', { topic_ntfy: topic });
    
    if (result && result.success) {
        state.config.topic_ntfy = topic;
        showToast('Configuration sauvegardée !', 'success');
    }
}

async function testerNotification() {
    if (!state.config.topic_ntfy) {
        showToast('Veuillez d\'abord configurer le topic ntfy', 'error');
        return;
    }
    
    const result = await apiCall('/api/notification/test', 'POST');
    
    if (result && result.success) {
        showToast('Notification envoyée !', 'success');
    } else {
        showToast('Erreur lors de l\'envoi', 'error');
    }
}

// === Export ===
function exporterCSV() {
    if (state.mesures.length === 0) {
        showToast('Aucune donnée à exporter', 'error');
        return;
    }
    
    const headers = ['Date', 'pH', 'Brome', 'Température', 'Transparence', 'Couleur', 'Écume', 'Notes'];
    const rows = state.mesures.map(m => [
        new Date(m.date).toLocaleString('fr-FR'),
        m.ph || '',
        m.brome || '',
        m.temperature || '',
        m.transparence,
        m.couleur,
        m.ecume ? 'Oui' : 'Non',
        m.notes || ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `bain-nordique-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    URL.revokeObjectURL(url);
    showToast('Export téléchargé !', 'success');
}

// === Reset ===
async function resetApplication() {
    showToast('La réinitialisation complète n\'est pas disponible via l\'API. Contactez l\'administrateur.', 'error');
}

// === UI Updates ===
function updateUI() {
    updateDashboard();
    updateGestion();
}

function updateDashboard() {
    // Dernières mesures
    const derniereMesure = state.mesures[0];
    const container = document.getElementById('dernieres-mesures');
    
    if (derniereMesure) {
        container.innerHTML = `
            <div class="dashboard-values">
                <div class="dashboard-value">
                    <div class="label">pH</div>
                    <div class="number ${getValueClass(derniereMesure.ph, CONFIG.PH_IDEAL_MIN, CONFIG.PH_IDEAL_MAX)}">
                        ${derniereMesure.ph || '-'}
                    </div>
                </div>
                <div class="dashboard-value">
                    <div class="label">Brome</div>
                    <div class="number ${getValueClass(derniereMesure.brome, CONFIG.BROME_IDEAL_MIN, CONFIG.BROME_IDEAL_MAX)}">
                        ${derniereMesure.brome || '-'}
                    </div>
                </div>
                <div class="dashboard-value">
                    <div class="label">Temp.</div>
                    <div class="number">${derniereMesure.temperature || '-'}°C</div>
                </div>
            </div>
            <p class="text-muted mt-2">Mesure du ${formatDate(derniereMesure.date)}</p>
        `;
    } else {
        container.innerHTML = '<p class="text-muted">Aucune mesure enregistrée</p>';
    }
    
    // Dosages recommandés
    const dosagesContainer = document.getElementById('dosages-recommandes');
    if (derniereMesure) {
        let dosages = derniereMesure.dosages_recommandes || derniereMesure.dosagesRecommandes;
        if (typeof dosages === 'string') {
            try { dosages = JSON.parse(dosages); } catch(e) { dosages = []; }
        }
        
        if (dosages && dosages.length > 0) {
            dosagesContainer.innerHTML = dosages.map(d => `
                <div class="dosage-item">
                    <span class="product">${d.produit}</span>
                    <span class="quantity">${d.quantite}</span>
                </div>
            `).join('');
        } else {
            dosagesContainer.innerHTML = '<p style="color: var(--success);">✅ Aucun traitement nécessaire</p>';
        }
    } else {
        dosagesContainer.innerHTML = '<p class="text-muted">Effectuez une mesure pour voir les recommandations</p>';
    }
    
    // Infos bain
    updateInfosBain();
    
    // Mode hivernage banner
    document.getElementById('mode-hivernage-banner').style.display = 
        state.config.mode_hivernage === 'true' ? 'block' : 'none';
    
    // Alerte gel
    updateAlerteGel();
}

function updateAlerteGel() {
    const alerteContainer = document.getElementById('alerte-gel');
    const alerteMessage = document.getElementById('alerte-gel-message');
    
    if (state.meteo && state.meteo.risqueGel && state.config.alerte_gel_validee !== 'true') {
        const premierJour = state.meteo.premierJourGel;
        if (premierJour) {
            const joursAvant = Math.ceil((new Date(premierJour.date) - new Date()) / (1000 * 60 * 60 * 24));
            alerteMessage.textContent = `Gel prévu dans ${joursAvant} jour(s) ! Température minimale prévue : ${premierJour.tempMin}°C. Vidangez les canalisations !`;
            alerteContainer.style.display = 'block';
        } else {
            alerteContainer.style.display = 'none';
        }
    } else {
        alerteContainer.style.display = 'none';
    }
}

function updateInfosBain() {
    if (state.config.date_mise_en_eau) {
        const jours = Math.floor((new Date() - new Date(state.config.date_mise_en_eau)) / (1000 * 60 * 60 * 24));
        document.getElementById('jours-mise-eau').textContent = `${jours} jours`;
        
        const prochainActivateur = CONFIG.CYCLE_ACTIVATEUR_JOURS - (jours % CONFIG.CYCLE_ACTIVATEUR_JOURS);
        document.getElementById('prochain-activateur').textContent = 
            prochainActivateur === CONFIG.CYCLE_ACTIVATEUR_JOURS ? 'Aujourd\'hui !' : `Dans ${prochainActivateur} jours`;
    } else {
        document.getElementById('jours-mise-eau').textContent = '-';
        document.getElementById('prochain-activateur').textContent = '-';
    }
    
    if (state.config.dernier_nettoyage_balles) {
        const joursBalles = Math.floor((new Date() - new Date(state.config.dernier_nettoyage_balles)) / (1000 * 60 * 60 * 24));
        const prochainBalles = CONFIG.CYCLE_BALLES_JOURS - joursBalles;
        document.getElementById('prochain-balles').textContent = 
            prochainBalles <= 0 ? 'À faire !' : `Dans ${prochainBalles} jours`;
    } else {
        document.getElementById('prochain-balles').textContent = '-';
    }
}

function updateMesurePage() {
    if (state.config.date_mise_en_eau) {
        const jours = Math.floor((new Date() - new Date(state.config.date_mise_en_eau)) / (1000 * 60 * 60 * 24));
        const showCycle = (jours % CONFIG.CYCLE_ACTIVATEUR_JOURS) < 1 || jours < 1;
        
        document.getElementById('check-activateur-container').style.display = showCycle ? 'block' : 'none';
        document.getElementById('check-eclatante-container').style.display = showCycle ? 'block' : 'none';
    }
}

function updateHistorique() {
    const mesuresContainer = document.getElementById('historique-list');
    if (state.mesures.length > 0) {
        mesuresContainer.innerHTML = state.mesures.map(m => {
            let dosages = m.dosages_recommandes || m.dosagesRecommandes || [];
            if (typeof dosages === 'string') {
                try { dosages = JSON.parse(dosages); } catch(e) { dosages = []; }
            }
            
            return `
            <div class="mesure-card">
                <div class="date">${formatDate(m.date)}</div>
                <div class="values">
                    <div class="value-item">
                        <span class="value-label">pH</span>
                        <span class="value-number ${getValueClass(m.ph, CONFIG.PH_IDEAL_MIN, CONFIG.PH_IDEAL_MAX)}">${m.ph || '-'}</span>
                    </div>
                    <div class="value-item">
                        <span class="value-label">Brome</span>
                        <span class="value-number ${getValueClass(m.brome, CONFIG.BROME_IDEAL_MIN, CONFIG.BROME_IDEAL_MAX)}">${m.brome || '-'}</span>
                    </div>
                    <div class="value-item">
                        <span class="value-label">Temp.</span>
                        <span class="value-number">${m.temperature || '-'}°C</span>
                    </div>
                </div>
                <div class="etat-eau">
                    Transparence: ${m.transparence}/5 | Couleur: ${m.couleur} ${m.ecume ? '| Écume' : ''}
                </div>
                ${m.notes ? `<div class="notes">"${m.notes}"</div>` : ''}
                ${dosages && dosages.length > 0 ? `
                    <div class="dosages-appliques">
                        <h4>💊 Dosages recommandés</h4>
                        ${dosages.map(d => `
                            <div class="dosage-item">
                                <span class="product">${d.produit}</span>
                                <span class="quantity">${d.quantite}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `}).join('');
    } else {
        mesuresContainer.innerHTML = '<p class="text-muted">Aucune mesure enregistrée</p>';
    }
    
    const baignadesContainer = document.getElementById('baignades-list');
    if (state.baignades.length > 0) {
        baignadesContainer.innerHTML = state.baignades.map(b => `
            <div class="baignade-card">
                <div class="date">${formatDate(b.date)}</div>
                <div class="details">${b.nb_personnes || b.nbPersonnes} pers. - ${b.duree_minutes || b.dureeMinutes} min</div>
            </div>
        `).join('');
    } else {
        baignadesContainer.innerHTML = '<p class="text-muted">Aucune baignade enregistrée</p>';
    }
}

function updateGestion() {
    document.getElementById('topic-ntfy').value = state.config.topic_ntfy || '';
    
    const btnHivernage = document.getElementById('btn-hivernage');
    btnHivernage.textContent = state.config.mode_hivernage === 'true'
        ? 'Désactiver le mode hivernage' 
        : 'Activer le mode hivernage';
    
    document.getElementById('dernier-nettoyage-balles').textContent = 
        state.config.dernier_nettoyage_balles 
            ? formatDate(state.config.dernier_nettoyage_balles)
            : 'Jamais';
    
    document.getElementById('date-mise-eau').textContent = 
        state.config.date_mise_en_eau 
            ? formatDate(state.config.date_mise_en_eau)
            : 'Non définie';
    document.getElementById('nb-mesures').textContent = state.mesures.length;
    document.getElementById('nb-baignades').textContent = state.baignades.length;
    
    if (state.config.date_mise_en_eau) {
        const totalPersonnesMinutes = state.baignades.reduce((acc, b) => 
            acc + ((b.nb_personnes || b.nbPersonnes) * (b.duree_minutes || b.dureeMinutes)), 0);
        const joursDepuisMiseEnEau = Math.floor((new Date() - new Date(state.config.date_mise_en_eau)) / (1000 * 60 * 60 * 24));
        
        if (totalPersonnesMinutes > 1500 || joursDepuisMiseEnEau > 75) {
            document.getElementById('estimation-vidange').textContent = 'Bientôt recommandée';
            document.getElementById('estimation-vidange').style.color = 'var(--warning)';
        } else if (totalPersonnesMinutes > 2000 || joursDepuisMiseEnEau > 90) {
            document.getElementById('estimation-vidange').textContent = 'Recommandée';
            document.getElementById('estimation-vidange').style.color = 'var(--danger)';
        } else {
            const joursRestants = 90 - joursDepuisMiseEnEau;
            document.getElementById('estimation-vidange').textContent = `~${joursRestants} jours`;
            document.getElementById('estimation-vidange').style.color = 'var(--success)';
        }
    } else {
        document.getElementById('estimation-vidange').textContent = '-';
    }
}

// === Helpers ===
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getValueClass(value, min, max) {
    if (value === null || value === undefined || isNaN(value)) return '';
    if (value >= min && value <= max) return 'value-ok';
    if (value < min - 0.5 || value > max + 0.5) return 'value-danger';
    return 'value-warning';
}

function showToast(message, type = 'info') {
    // Supprimer les anciens toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

// === Service Worker Registration ===
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Service Worker enregistré'))
        .catch(err => console.log('Service Worker non enregistré', err));
}
