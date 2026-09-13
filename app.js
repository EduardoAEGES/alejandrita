// Constants & Supabase Client
const PIN_CODE = "46069339";
const RATE_PER_HOUR = 15; // S/ 15 por 60 mins o fracción

const supabaseUrl = 'https://yckucfrsflacgbsihxdb.supabase.co';
const supabaseKey = 'sb_publishable_qEE7l-JpVSBo6-azqVu6ww_OAW1dM2l';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

// State
let activities = [];
let pendingAction = null; // { type: 'pay_all' | 'pay_single' | 'delete' | 'undo', target: id | null }

// DOM Elements
const form = document.getElementById('activity-form');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const totalAmountEl = document.getElementById('total-amount');
const btnPayAll = document.getElementById('btn-pay-all');
const manualAmountInput = document.getElementById('manual-amount-input');
const btnPayManual = document.getElementById('btn-pay-manual');
const activitiesList = document.getElementById('activities-list');
const pinModal = document.getElementById('pin-modal');
const pinInput = document.getElementById('pin-input');
const btnCancelPin = document.getElementById('btn-cancel-pin');
const btnConfirmPin = document.getElementById('btn-confirm-pin');
const pinError = document.getElementById('pin-error');

const btnEntrada = document.getElementById('btn-entrada');
const btnManualEntrada = document.getElementById('btn-manual-entrada');
const btnSalida = document.getElementById('btn-salida');
const btnManualSalida = document.getElementById('btn-manual-salida');

const manualTimeModal = document.getElementById('manual-time-modal');
const manualTimeTitle = document.getElementById('manual-time-title');
const manualTimeInput = document.getElementById('manual-time-input');
const manualSustento = document.getElementById('manual-sustento');
const btnCancelManual = document.getElementById('btn-cancel-manual');
const btnConfirmManual = document.getElementById('btn-confirm-manual');

let activeManualTarget = null;
let sustentoStart = '';
let sustentoEnd = '';

// Initialize
async function init() {
    await fetchActivities();
    renderActivities();
    updateSummary();
}

// Fetch from Supabase
async function fetchActivities() {
    const { data, error } = await db
        .from('actividades')
        .select('*')
        .order('id', { ascending: false });
        
    if (error) {
        console.error("Error fetching activities:", error);
        alert("Error de conexión al cargar datos de Supabase.");
    } else {
        activities = data || [];
    }
}

// Format currency
function formatMoney(amount) {
    return `S/ ${Number(amount).toFixed(2)}`;
}

// Calculate duration in minutes between two time strings (HH:mm)
function calculateDuration(start, end) {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    
    let startTotalMins = startH * 60 + startM;
    let endTotalMins = endH * 60 + endM;
    
    if (endTotalMins < startTotalMins) {
        endTotalMins += 24 * 60;
    }
    
    return endTotalMins - startTotalMins;
}

// Calculate amount based on duration
function calculateAmount(minutes) {
    if (minutes <= 0) return 0;
    const hours = Math.ceil(minutes / 60);
    return hours * RATE_PER_HOUR;
}

// Format duration for display
function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

// Update Summary (Accumulated unpaid amount)
function updateSummary() {
    const totalPending = activities
        .filter(a => !a.paid)
        .reduce((sum, a) => sum + Number(a.amount), 0);
        
    totalAmountEl.textContent = formatMoney(totalPending);
    btnPayAll.disabled = totalPending === 0;
    if (btnPayManual && manualAmountInput) {
        btnPayManual.disabled = totalPending === 0;
        manualAmountInput.disabled = totalPending === 0;
        if (totalPending === 0) {
            manualAmountInput.value = '';
        }
    }
}

// Render Activities List
function renderActivities() {
    activitiesList.innerHTML = '';
    
    if (activities.length === 0) {
        activitiesList.innerHTML = `
            <div class="empty-state glass">
                <p>No hay actividades registradas.</p>
            </div>
        `;
        return;
    }
    
    activities.forEach(activity => {
        const card = document.createElement('div');
        card.className = 'activity-card glass';
        card.innerHTML = `
            <div class="activity-info">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3>${activity.description}</h3>
                    <button class="btn btn-outline btn-small" title="Eliminar" onclick="openPinModal('delete', ${activity.id})" style="color: var(--danger); border-color: var(--danger); padding: 0.2rem 0.5rem; font-size: 0.8rem;">🗑️</button>
                </div>
                <div class="activity-meta">
                    <span>📅 ${new Date(Number(activity.id)).toLocaleDateString()}</span>
                    <span>⏱️ ${activity.start_time} - ${activity.end_time} (${formatDuration(activity.duration_mins)})</span>
                    <span class="badge ${activity.paid ? 'badge-paid' : 'badge-pending'}">
                        ${activity.paid ? 'Pagado' : 'Pendiente'}
                    </span>
                    ${activity.paid && activity.paid_at ? `<span style="font-size: 0.85rem; color: var(--secondary); margin-left: 0.5rem;">✔ Pagado el ${activity.paid_at} (${activity.payment_method})</span>` : ''}
                </div>
                ${activity.sustento ? `<div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 5px;"><i>Sustento:</i> ${activity.sustento}</div>` : ''}
            </div>
            <div class="activity-actions">
                <div class="activity-amount">${formatMoney(activity.amount)}</div>
                ${!activity.paid 
                    ? `<button class="btn btn-outline" onclick="openPinModal('pay_single', ${activity.id})" style="margin-left: 1rem; padding: 0.5rem 1rem;">Pagar</button>` 
                    : `<button class="btn btn-outline" onclick="openPinModal('undo', ${activity.id})" style="margin-left: 1rem; padding: 0.5rem 1rem; color: var(--text-muted);">Deshacer Pago</button>`
                }
            </div>
        `;
        activitiesList.appendChild(card);
    });
}

// Handle Form Submit
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const desc = document.getElementById('desc').value;
    const start = startTimeInput.value;
    const end = endTimeInput.value;
    
    const duration_mins = calculateDuration(start, end);
    
    if (duration_mins <= 0) {
        alert("La hora de fin debe ser mayor a la hora de inicio.");
        return;
    }
    
    const amount = calculateAmount(duration_mins);
    
    const newActivity = {
        id: Date.now(),
        description: desc,
        start_time: start,
        end_time: end,
        duration_mins,
        amount,
        paid: false,
        sustento: [sustentoStart ? `Inicio: ${sustentoStart}` : '', sustentoEnd ? `Fin: ${sustentoEnd}` : ''].filter(Boolean).join(' | ') || null
    };
    
    const { error } = await db.from('actividades').insert([newActivity]);
    
    if (error) {
        console.error(error);
        alert("Error al guardar en Supabase");
        return;
    }
    
    sustentoStart = '';
    sustentoEnd = '';
    form.reset();
    
    await fetchActivities();
    renderActivities();
    updateSummary();
});

// Modal Logic
window.openPinModal = function(type, target) {
    pendingAction = { type, target };
    pinInput.value = '';
    pinError.classList.remove('active');
    
    const paymentContainer = document.getElementById('payment-method-container');
    if (type === 'pay_single' || type === 'pay_all' || type === 'pay_manual') {
        paymentContainer.style.display = 'block';
    } else {
        paymentContainer.style.display = 'none';
    }
    
    pinModal.classList.add('active');
    setTimeout(() => pinInput.focus(), 100);
}

function closePinModal() {
    pinModal.classList.remove('active');
    pendingAction = null;
}

btnCancelPin.addEventListener('click', closePinModal);

btnPayAll.addEventListener('click', () => {
    openPinModal('pay_all', null);
});

btnPayManual.addEventListener('click', () => {
    const amount = parseFloat(manualAmountInput.value);
    if (isNaN(amount) || amount <= 0) {
        alert("Por favor, ingrese un monto válido a abonar.");
        return;
    }
    const totalPending = activities
        .filter(a => !a.paid)
        .reduce((sum, a) => sum + Number(a.amount), 0);
    
    if (amount > totalPending) {
        alert("El monto ingresado es mayor a la deuda total.");
        return;
    }

    openPinModal('pay_manual', amount);
});

btnConfirmPin.addEventListener('click', processPinAction);
pinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') processPinAction();
});

async function processPinAction() {
    const pin = pinInput.value;
    
    if (pin !== PIN_CODE) {
        pinError.classList.add('active');
        pinInput.value = '';
        pinInput.focus();
        setTimeout(() => {
            pinError.classList.remove('active');
            void pinError.offsetWidth;
            pinError.classList.add('active');
        }, 10);
        return;
    }
    
    // Authorization successful
    const { type, target } = pendingAction;
    
    // Show a small loading state on button or just wait
    btnConfirmPin.textContent = "Procesando...";
    btnConfirmPin.disabled = true;
    
    try {
        if (type === 'pay_all') {
            const method = document.getElementById('payment-method-select').value;
            const dateStr = new Date().toLocaleDateString();
            await db.from('actividades').update({ paid: true, paid_at: dateStr, payment_method: method }).eq('paid', false);
        } else if (type === 'pay_manual') {
            const method = document.getElementById('payment-method-select').value;
            const dateStr = new Date().toLocaleDateString();
            let remainingAmount = parseFloat(target);
            
            // Get pending activities sorted by oldest first (ascending ID)
            const pendingActivities = [...activities].filter(a => !a.paid).sort((a, b) => Number(a.id) - Number(b.id));
            
            for (let i = 0; i < pendingActivities.length; i++) {
                if (remainingAmount <= 0) break;
                
                const activity = pendingActivities[i];
                const actAmount = parseFloat(activity.amount);
                
                if (remainingAmount >= actAmount) {
                    // Pay completely
                    await db.from('actividades').update({ 
                        paid: true, 
                        paid_at: dateStr, 
                        payment_method: method 
                    }).eq('id', activity.id);
                    remainingAmount -= actAmount;
                } else {
                    // Pay partially
                    // 1. Create a new activity for the paid portion
                    const splitActivity = {
                        ...activity,
                        id: Date.now() + i, // slight adjustment to avoid duplicate ID
                        amount: remainingAmount,
                        paid: true,
                        paid_at: dateStr,
                        payment_method: method,
                        sustento: activity.sustento ? activity.sustento + ' (Pago Parcial)' : '(Pago Parcial)'
                    };
                    
                    // 2. Update the original activity to reduce its amount
                    const newPendingAmount = actAmount - remainingAmount;
                    
                    await db.from('actividades').insert([splitActivity]);
                    await db.from('actividades').update({
                        amount: newPendingAmount
                    }).eq('id', activity.id);
                    
                    remainingAmount = 0;
                    break;
                }
            }
            if (manualAmountInput) manualAmountInput.value = '';
        } else if (type === 'pay_single') {
            const method = document.getElementById('payment-method-select').value;
            const dateStr = new Date().toLocaleDateString();
            await db.from('actividades').update({ paid: true, paid_at: dateStr, payment_method: method }).eq('id', target);
        } else if (type === 'undo') {
            await db.from('actividades').update({ paid: false, paid_at: null, payment_method: null }).eq('id', target);
        } else if (type === 'delete') {
            await db.from('actividades').delete().eq('id', target);
        }
    } catch (e) {
        console.error("Supabase Error", e);
        alert("Hubo un error de conexión.");
    }
    
    btnConfirmPin.textContent = "Confirmar";
    btnConfirmPin.disabled = false;
    closePinModal();
    
    // Refresh Data
    await fetchActivities();
    renderActivities();
    updateSummary();
}

// Time Buttons Logic
function getCurrentTime() {
    const now = new Date();
    return now.toTimeString().slice(0,5);
}

btnEntrada.addEventListener('click', () => {
    startTimeInput.value = getCurrentTime();
    sustentoStart = ''; 
});

btnSalida.addEventListener('click', () => {
    endTimeInput.value = getCurrentTime();
    sustentoEnd = ''; 
});

btnManualEntrada.addEventListener('click', () => {
    activeManualTarget = 'start';
    manualTimeTitle.textContent = "Ingreso Manual - Hora Inicio";
    manualTimeInput.value = startTimeInput.value || getCurrentTime();
    manualSustento.value = sustentoStart;
    document.getElementById('manual-pin').value = '';
    manualTimeModal.classList.add('active');
});

btnManualSalida.addEventListener('click', () => {
    activeManualTarget = 'end';
    manualTimeTitle.textContent = "Ingreso Manual - Hora Fin";
    manualTimeInput.value = endTimeInput.value || getCurrentTime();
    manualSustento.value = sustentoEnd;
    document.getElementById('manual-pin').value = '';
    manualTimeModal.classList.add('active');
});

btnCancelManual.addEventListener('click', () => {
    manualTimeModal.classList.remove('active');
});

btnConfirmManual.addEventListener('click', () => {
    const timeVal = manualTimeInput.value;
    const sustentoVal = manualSustento.value.trim();
    const pinVal = document.getElementById('manual-pin').value;
    
    if (!timeVal) {
        alert("La hora es obligatoria.");
        return;
    }
    
    if (pinVal === PIN_CODE) {
        // Master mode: Bypass sustento requirement
    } else {
        // Normal mode
        if (!sustentoVal) {
            alert("Debe ingresar un sustento o el PIN Maestro.");
            return;
        }
        if (pinVal && pinVal !== PIN_CODE) {
            alert("PIN Maestro incorrecto.");
            return;
        }
    }
    
    const finalSustento = (pinVal === PIN_CODE && !sustentoVal) ? 'Edición Maestra' : sustentoVal;

    if (activeManualTarget === 'start') {
        startTimeInput.value = timeVal;
        sustentoStart = finalSustento;
    } else {
        endTimeInput.value = timeVal;
        sustentoEnd = finalSustento;
    }
    manualTimeModal.classList.remove('active');
});

// Run init on load
init();
