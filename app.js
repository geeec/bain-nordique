// === Configuration ===
const CONFIG = {
    VOLUME_M3: 1.5,
    PH_IDEAL_MIN: 7.2,
    PH_IDEAL_MAX: 7.6,
    BROME_IDEAL_MIN: 2,
    BROME_IDEAL_MAX: 4,
    CYCLE_ACTIVATEUR_JOURS: 14,
    CYCLE_BALLES_JOURS: 30,
    // Dosages par m³
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
        dateMiseEnEau: null,
        modeHivernage: false,
        dernierNettoyageBalles: null,
        alerteGelValidee: false,
        topicNtfy: ''
    }
};

// === Initialisation ===
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    initNavigation();
    initForms();
    initButtons();
    updateUI();
});

// === Storage ===
function loadState() {
    const saved = localStorage.getItem('bain-nordique-state');
    if (saved) {
        state = JSON.parse(saved);
    }
}

function saveState() {
    localStorage.setItem('bain-nordique-state', JSON.stringify(state));
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
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });
    
    // Update pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });
    
    // Refresh page content
    if (page === 'dashboard') updateDashboard();
    if (page === 'mesure') updateMesurePage();
    if (page === 'historique') updateHistorique();
    if (page === 'gestion') updateGestion();
}

// === Forms ===
function initForms() {
    // Form Mesure
    document.getElementById('form-mesure').addEventListener('submit', (e) => {
        e.preventDefault();
        enregistrerMesure();
    });
    
    // Form Baignade
    document.getElementById('form-baignade').addEventListener('submit', (e) => {
        e.preventDefault();
        enregistrerBaignade();
    });
    
    // Transparence slider
    document.getElementById('transparence').addEventListener('input', (e) => {
        document.getElementById('transparence-value').textContent = e.target.value;
    });
    
    // pH et Brome change -> update dosages preview
    ['ph', 'brome', 'couleur', 'ecume', 'transparence'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateDosagesPreview);
    });
}

// === Buttons ===
function initButtons() {
    // Baignade
    document.getElementById('btn-baignade').addEventListener('click', () => {
        document.getElementById('modal-baignade').style.display = 'flex';
    });
    
    // Vidange
    document.getElementById('btn-vidange').addEventListener('click', declarerVidange);
    
    // Hivernage
    document.getElementById('btn-hivernage').addEventListener('click', toggleHivernage);
    
    // Nettoyer balles
    document.getElementById('btn-nettoyer-balles').addEventListener('click', marquerBallesNettoyees);
    
    // Config
    document.getElementById('btn-save-config').addEventListener('click', sauvegarderConfig);
    document.getElementById('btn-test-notif').addEventListener('click', testerNotification);
    
    // Export
    document.getElementById('btn-export').addEventListener('click', exporterCSV);
    
    // Reset
    document.getElementById('btn-reset').addEventListener('click', resetApplication);
    
    // Valider alerte gel
    document.getElementById('btn-valider-gel').addEventListener('click', validerAlerteGel);
}

// === Mesures ===
function enregistrerMesure() {
    const form = document.getElementById('form-mesure');
    const formData = new FormData(form);
    
    const mesure = {
        id: Date.now(),
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
    
    state.mesures.unshift(mesure);
    saveState();
    
    form.reset();
    document.getElementById('transparence-value').textContent = '1';
    document.getElementById('dosages-preview').style.display = 'none';
    
    showToast('Mesure enregistrée !', 'success');
    navigateTo('dashboard');
}

function calculerDosages(ph, brome, couleur, ecume, transparence) {
    const dosages = [];
    const vol = CONFIG.VOLUME_M3;
    
    // pH
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
    
    // Brome
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
    
    // Eau verte -> choc
    if (couleur === 'verte') {
        const quantite = CONFIG.DOSAGES.choc.parM3 * vol;
        dosages.push({
            produit: 'Choc sans chlore',
            quantite: `${quantite} ${CONFIG.DOSAGES.choc.unite}`,
            raison: 'Eau verte'
        });
    }
    
    // Écume
    if (ecume) {
        const quantite = CONFIG.DOSAGES.anti_ecume.parM3 * vol;
        dosages.push({
            produit: 'Anti-écume',
            quantite: `${quantite} ${CONFIG.DOSAGES.anti_ecume.unite}`,
            raison: 'Présence d\'écume'
        });
    }
    
    // Eau trouble (transparence > 2)
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
function enregistrerBaignade() {
    const personnes = parseInt(document.getElementById('baignade-personnes').value);
    const duree = parseInt(document.getElementById('baignade-duree').value);
    
    const baignade = {
        id: Date.now(),
        date: new Date().toISOString(),
        nbPersonnes: personnes,
        dureeMinutes: duree
    };
    
    state.baignades.unshift(baignade);
    saveState();
    
    closeModal();
    showToast('Baignade enregistrée !', 'success');
    updateDashboard();
}

function closeModal() {
    document.getElementById('modal-baignade').style.display = 'none';
}

// === Gestion du bain ===
function declarerVidange() {
    if (!confirm('Confirmer la vidange et le remplissage du bain ?')) return;
    
    state.config.dateMiseEnEau = new Date().toISOString();
    state.config.dernierNettoyageBalles = new Date().toISOString();
    state.config.modeHivernage = false;
    saveState();
    
    // Afficher modal mise en service
    document.getElementById('modal-mise-en-service').style.display = 'flex';
    
    showToast('Vidange enregistrée !', 'success');
}

function closeMiseEnService() {
    document.getElementById('modal-mise-en-service').style.display = 'none';
    // Reset checkboxes
    document.querySelectorAll('#checklist-mise-en-service input').forEach(cb => cb.checked = false);
    updateGestion();
    navigateTo('dashboard');
}

function toggleHivernage() {
    state.config.modeHivernage = !state.config.modeHivernage;
    saveState();
    updateGestion();
    updateDashboard();
    
    const msg = state.config.modeHivernage 
        ? 'Mode hivernage activé' 
        : 'Mode hivernage désactivé';
    showToast(msg, 'success');
}

function marquerBallesNettoyees() {
    state.config.dernierNettoyageBalles = new Date().toISOString();
    saveState();
    updateGestion();
    showToast('Nettoyage des balles enregistré !', 'success');
}

function validerAlerteGel() {
    state.config.alerteGelValidee = true;
    saveState();
    updateDashboard();
    showToast('Alerte validée', 'success');
}

// === Configuration ===
function sauvegarderConfig() {
    const topic = document.getElementById('topic-ntfy').value.trim();
    state.config.topicNtfy = topic;
    saveState();
    showToast('Configuration sauvegardée !', 'success');
}

async function testerNotification() {
    const topic = state.config.topicNtfy;
    if (!topic) {
        showToast('Veuillez d\'abord configurer le topic ntfy', 'error');
        return;
    }
    
    try {
        const response = await fetch(`https://ntfy.sh/${topic}`, {
            method: 'POST',
            body: '🛁 Test notification Bain Nordique !'
        });
        
        if (response.ok) {
            showToast('Notification envoyée !', 'success');
        } else {
            showToast('Erreur lors de l\'envoi', 'error');
        }
    } catch (error) {
        showToast('Erreur : ' + error.message, 'error');
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
function resetApplication() {
    if (!confirm('⚠️ Supprimer TOUTES les données ? Cette action est irréversible.')) return;
    if (!confirm('Êtes-vous vraiment sûr ?')) return;
    
    localStorage.removeItem('bain-nordique-state');
    state = {
        mesures: [],
        baignades: [],
        config: {
            dateMiseEnEau: null,
            modeHivernage: false,
            dernierNettoyageBalles: null,
            alerteGelValidee: false,
            topicNtfy: ''
        }
    };
    
    showToast('Application réinitialisée', 'success');
    updateUI();
    navigateTo('dashboard');
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
    if (derniereMesure && derniereMesure.dosagesRecommandes && derniereMesure.dosagesRecommandes.length > 0) {
        dosagesContainer.innerHTML = derniereMesure.dosagesRecommandes.map(d => `
            <div class="dosage-item">
                <span class="product">${d.produit}</span>
                <span class="quantity">${d.quantite}</span>
            </div>
        `).join('');
    } else if (derniereMesure) {
        dosagesContainer.innerHTML = '<p style="color: var(--success);">✅ Aucun traitement nécessaire</p>';
    } else {
        dosagesContainer.innerHTML = '<p class="text-muted">Effectuez une mesure pour voir les recommandations</p>';
    }
    
    // Infos bain
    updateInfosBain();
    
    // Mode hivernage banner
    document.getElementById('mode-hivernage-banner').style.display = 
        state.config.modeHivernage ? 'block' : 'none';
    
    // Alerte gel (simulé pour l'instant - sera connecté à l'API météo)
    document.getElementById('alerte-gel').style.display = 'none';
}

function updateInfosBain() {
    // Jours depuis mise en eau
    if (state.config.dateMiseEnEau) {
        const jours = Math.floor((new Date() - new Date(state.config.dateMiseEnEau)) / (1000 * 60 * 60 * 24));
        document.getElementById('jours-mise-eau').textContent = `${jours} jours`;
        
        // Prochain activateur
        const prochainActivateur = CONFIG.CYCLE_ACTIVATEUR_JOURS - (jours % CONFIG.CYCLE_ACTIVATEUR_JOURS);
        document.getElementById('prochain-activateur').textContent = 
            prochainActivateur === CONFIG.CYCLE_ACTIVATEUR_JOURS ? 'Aujourd\'hui !' : `Dans ${prochainActivateur} jours`;
    } else {
        document.getElementById('jours-mise-eau').textContent = '-';
        document.getElementById('prochain-activateur').textContent = '-';
    }
    
    // Prochain nettoyage balles
    if (state.config.dernierNettoyageBalles) {
        const joursBalles = Math.floor((new Date() - new Date(state.config.dernierNettoyageBalles)) / (1000 * 60 * 60 * 24));
        const prochainBalles = CONFIG.CYCLE_BALLES_JOURS - joursBalles;
        document.getElementById('prochain-balles').textContent = 
            prochainBalles <= 0 ? 'À faire !' : `Dans ${prochainBalles} jours`;
    } else {
        document.getElementById('prochain-balles').textContent = '-';
    }
}

function updateMesurePage() {
    // Check if activateur/eclatante should be shown
    if (state.config.dateMiseEnEau) {
        const jours = Math.floor((new Date() - new Date(state.config.dateMiseEnEau)) / (1000 * 60 * 60 * 24));
        const showCycle = (jours % CONFIG.CYCLE_ACTIVATEUR_JOURS) < 1 || jours < 1;
        
        document.getElementById('check-activateur-container').style.display = showCycle ? 'block' : 'none';
        document.getElementById('check-eclatante-container').style.display = showCycle ? 'block' : 'none';
    }
}

function updateHistorique() {
    // Mesures
    const mesuresContainer = document.getElementById('historique-list');
    if (state.mesures.length > 0) {
        mesuresContainer.innerHTML = state.mesures.map(m => `
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
                ${m.dosagesRecommandes && m.dosagesRecommandes.length > 0 ? `
                    <div class="dosages-appliques">
                        <h4>💊 Dosages recommandés</h4>
                        ${m.dosagesRecommandes.map(d => `
                            <div class="dosage-item">
                                <span class="product">${d.produit}</span>
                                <span class="quantity">${d.quantite}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');
    } else {
        mesuresContainer.innerHTML = '<p class="text-muted">Aucune mesure enregistrée</p>';
    }
    
    // Baignades
    const baignadesContainer = document.getElementById('baignades-list');
    if (state.baignades.length > 0) {
        baignadesContainer.innerHTML = state.baignades.map(b => `
            <div class="baignade-card">
                <div class="date">${formatDate(b.date)}</div>
                <div class="details">${b.nbPersonnes} pers. - ${b.dureeMinutes} min</div>
            </div>
        `).join('');
    } else {
        baignadesContainer.innerHTML = '<p class="text-muted">Aucune baignade enregistrée</p>';
    }
}

function updateGestion() {
    // Topic ntfy
    document.getElementById('topic-ntfy').value = state.config.topicNtfy || '';
    
    // Bouton hivernage
    const btnHivernage = document.getElementById('btn-hivernage');
    btnHivernage.textContent = state.config.modeHivernage 
        ? 'Désactiver le mode hivernage' 
        : 'Activer le mode hivernage';
    
    // Dernier nettoyage balles
    document.getElementById('dernier-nettoyage-balles').textContent = 
        state.config.dernierNettoyageBalles 
            ? formatDate(state.config.dernierNettoyageBalles)
            : 'Jamais';
    
    // Statistiques
    document.getElementById('date-mise-eau').textContent = 
        state.config.dateMiseEnEau 
            ? formatDate(state.config.dateMiseEnEau)
            : 'Non définie';
    document.getElementById('nb-mesures').textContent = state.mesures.length;
    document.getElementById('nb-baignades').textContent = state.baignades.length;
    
    // Estimation vidange (simple : basée sur le nombre de baignades)
    if (state.config.dateMiseEnEau) {
        const totalPersonnesMinutes = state.baignades.reduce((acc, b) => 
            acc + (b.nbPersonnes * b.dureeMinutes), 0);
        // Règle simplifiée : vidange recommandée après 2000 personnes-minutes ou 90 jours
        const joursDepuisMiseEnEau = Math.floor((new Date() - new Date(state.config.dateMiseEnEau)) / (1000 * 60 * 60 * 24));
        
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
