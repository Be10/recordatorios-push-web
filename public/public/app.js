// Lógica del Cliente Moderna - Recordatorios Push Universales

// 1. Configuración de API Backend
let BACKEND_URL = localStorage.getItem('custom_backend_url') || '';
if (!BACKEND_URL) {
  if (window.location.hostname !== 'localhost' && window.location.hostname.endsWith('github.io')) {
    console.warn('Ejecutándose en GitHub Pages. Configura la URL del backend.');
  } else {
    BACKEND_URL = window.location.origin;
  }
}

let swRegistration = null;
let currentSubscription = null;
let activeTab = 'pending';
let allReminders = [];
let allDevices = [];

// Elementos del DOM
const serverDot = document.getElementById('server-status-dot');
const devicesSummaryText = document.getElementById('devices-summary-text');
const btnOpenDevices = document.getElementById('btn-open-devices');
const btnOpenSettings = document.getElementById('btn-open-settings');
const modalDevices = document.getElementById('modal-devices');
const btnCloseDevices = document.getElementById('btn-close-devices');
const modalSettings = document.getElementById('modal-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const backendUrlInput = document.getElementById('backend-url-input');
const btnSaveBackend = document.getElementById('btn-save-backend');
const currentClock = document.getElementById('current-clock');

const btnTestBroadcast = document.getElementById('btn-test-broadcast');
const reminderForm = document.getElementById('reminder-form');
const reminderTitle = document.getElementById('reminder-title');
const reminderBody = document.getElementById('reminder-body');
const reminderDatetime = document.getElementById('reminder-datetime');
const reminderCategory = document.getElementById('reminder-category');
const alertPreviewText = document.getElementById('alert-preview-text');

const countPending = document.getElementById('count-pending');
const countSent = document.getElementById('count-sent');
const remindersContainer = document.getElementById('reminders-container');

const deviceNameInput = document.getElementById('device-name-input');
const btnToggleSub = document.getElementById('btn-toggle-sub');
const thisDeviceStatusBadge = document.getElementById('this-device-status-badge');
const devicesModalList = document.getElementById('devices-modal-list');
const toast = document.getElementById('toast');

// 2. Inicialización
window.addEventListener('DOMContentLoaded', async () => {
  setupDeviceDefaultName();
  setupClock();
  setupDefaultDateTime();
  setupFastDateChips();
  setupFastTimeChips();
  setupModals();
  setupTabs();

  await initServiceWorker();
  await checkServerStatus();
  await loadSubscriptionsList();
  await loadReminders();

  // Actualizar periódicamente
  setInterval(() => {
    checkServerStatus();
    loadReminders(false);
  }, 15000);
});

// Toast flotante
function showToast(message, duration = 3000) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// Reloj en tiempo real
function setupClock() {
  const update = () => {
    const now = new Date();
    currentClock.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  update();
  setInterval(update, 1000);
}

// 3. Sistema Rápido de Fecha y Hora (Hoy por defecto)
function setupDefaultDateTime() {
  const now = new Date();
  // Redondear al siguiente múltiplo de 5 minutos + 10 minutos
  const target = new Date(now.getTime() + 15 * 60000);
  const remainder = target.getMinutes() % 5;
  if (remainder !== 0) {
    target.setMinutes(target.getMinutes() + (5 - remainder));
  }
  target.setSeconds(0);
  target.setMilliseconds(0);

  reminderDatetime.value = formatDateTimeLocal(target);
  reminderDatetime.min = formatDateTimeLocal(now);

  updateAlertPreview();

  reminderDatetime.addEventListener('input', () => {
    updateAlertPreview();
    clearActiveChips();
  });
}

function formatDateTimeLocal(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Chips de Fecha Rápida
function setupFastDateChips() {
  document.querySelectorAll('#date-chips-container .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#date-chips-container .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const action = chip.dataset.date;
      const current = new Date(reminderDatetime.value || Date.now());
      const now = new Date();

      if (action === 'today') {
        current.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
        // Si la hora ya pasó, ajustar a 15 minutos en el futuro
        if (current <= now) {
          current.setTime(now.getTime() + 15 * 60000);
        }
      } else if (action === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        current.setFullYear(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
      } else if (action === 'weekend') {
        const sat = new Date(now);
        const day = now.getDay();
        const diff = (6 - day + 7) % 7 || 7;
        sat.setDate(sat.getDate() + diff);
        sat.setHours(10, 0, 0, 0);
        current.setTime(sat.getTime());
      } else if (action === 'next-monday') {
        const mon = new Date(now);
        const day = now.getDay();
        const diff = (1 - day + 7) % 7 || 7;
        mon.setDate(mon.getDate() + diff);
        mon.setHours(9, 0, 0, 0);
        current.setTime(mon.getTime());
      }

      reminderDatetime.value = formatDateTimeLocal(current);
      updateAlertPreview();
    });
  });
}

// Chips de Intervalos y Horas Predefinidas
function setupFastTimeChips() {
  document.querySelectorAll('#time-chips-container .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const now = new Date();

      if (chip.dataset.mins) {
        // Añadir minutos desde AHORA
        const mins = parseInt(chip.dataset.mins, 10);
        const target = new Date(now.getTime() + mins * 60000);
        reminderDatetime.value = formatDateTimeLocal(target);
        highlightDateChip('today');
      } else if (chip.dataset.fixedTime) {
        // Hora fija (ej: 09:00, 13:00, 20:00)
        const [hours, minutes] = chip.dataset.fixedTime.split(':').map(Number);
        const current = new Date(reminderDatetime.value || Date.now());
        current.setHours(hours, minutes, 0, 0);

        // Si la hora hoy ya pasó, pasarla para mañana automáticamente
        if (current <= now) {
          current.setDate(current.getDate() + 1);
          highlightDateChip('tomorrow');
        }
        reminderDatetime.value = formatDateTimeLocal(current);
      }

      updateAlertPreview();
    });
  });
}

function highlightDateChip(type) {
  document.querySelectorAll('#date-chips-container .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.date === type);
  });
}

function clearActiveChips() {
  document.querySelectorAll('#date-chips-container .chip').forEach(c => c.classList.remove('active'));
}

// Vista previa dinámica de cuándo sonará
function updateAlertPreview() {
  const val = reminderDatetime.value;
  if (!val) {
    alertPreviewText.textContent = 'Selecciona fecha y hora.';
    return;
  }

  const target = new Date(val);
  const now = new Date();
  const diffMs = target - now;

  if (diffMs <= 0) {
    alertPreviewText.innerHTML = '<span style="color: var(--accent-rose);">⚠️ La hora elegida ya pasó. Elige una hora en el futuro.</span>';
    return;
  }

  const diffMins = Math.round(diffMs / 60000);
  let timeAgo = '';
  if (diffMins < 60) {
    timeAgo = `en ${diffMins} minuto${diffMins === 1 ? '' : 's'}`;
  } else if (diffMins < 1440) {
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    timeAgo = `en ${hrs}h ${mins > 0 ? mins + 'm' : ''}`;
  } else {
    const days = Math.floor(diffMins / 1440);
    timeAgo = `en ${days} día${days === 1 ? '' : 's'}`;
  }

  const isToday = target.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = target.toDateString() === tomorrow.toDateString();

  let dayStr = isToday ? 'Hoy' : (isTomorrow ? 'Mañana' : target.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }));
  const timeStr = target.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  alertPreviewText.innerHTML = `Sonará: <strong>${dayStr} a las ${timeStr}</strong> (${timeAgo})`;
}

// 4. Modales
function setupModals() {
  btnOpenDevices.addEventListener('click', () => modalDevices.classList.add('open'));
  btnCloseDevices.addEventListener('click', () => modalDevices.classList.remove('open'));

  btnOpenSettings.addEventListener('click', () => {
    backendUrlInput.value = BACKEND_URL;
    modalSettings.classList.add('open');
  });
  btnCloseSettings.addEventListener('click', () => modalSettings.classList.remove('open'));

  [modalDevices, modalSettings].forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('open');
    });
  });

  btnSaveBackend.addEventListener('click', async () => {
    let url = backendUrlInput.value.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    BACKEND_URL = url;
    localStorage.setItem('custom_backend_url', url);
    showToast('Backend guardado. Conectando...');
    modalSettings.classList.remove('open');
    await checkServerStatus();
    await loadSubscriptionsList();
    await loadReminders();
  });
}

// 5. Pestañas
function setupTabs() {
  document.querySelectorAll('.tab-link').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderReminders();
    });
  });
}

// 6. Nombre de Dispositivo
function setupDeviceDefaultName() {
  const saved = localStorage.getItem('push_device_name');
  if (saved) {
    deviceNameInput.value = saved;
    return;
  }
  const ua = navigator.userAgent;
  let dev = 'Navegador Web';
  if (/iPhone/i.test(ua)) dev = 'iPhone';
  else if (/iPad/i.test(ua)) dev = 'iPad';
  else if (/Android/i.test(ua)) dev = 'Android';
  else if (/Macintosh|Mac OS X/i.test(ua)) dev = 'Mac';
  else if (/Windows NT/i.test(ua)) dev = 'PC Windows';
  deviceNameInput.value = dev;
}

deviceNameInput.addEventListener('change', () => {
  localStorage.setItem('push_device_name', deviceNameInput.value.trim());
});

// 7. Service Worker y Web Push
async function initServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    thisDeviceStatusBadge.textContent = 'No soportado';
    thisDeviceStatusBadge.style.color = '#f87171';
    btnToggleSub.disabled = true;
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    currentSubscription = await swRegistration.pushManager.getSubscription();
    updateSubscriptionState();
  } catch (err) {
    console.error('SW Error:', err);
  }
}

function updateSubscriptionState() {
  if (currentSubscription) {
    thisDeviceStatusBadge.textContent = '🟢 Conectado';
    thisDeviceStatusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
    thisDeviceStatusBadge.style.color = '#34d399';
    btnToggleSub.textContent = 'Desactivar';
    btnToggleSub.className = 'btn btn-danger btn-sm';
  } else {
    thisDeviceStatusBadge.textContent = 'Inactivo';
    thisDeviceStatusBadge.style.background = 'rgba(245, 158, 11, 0.2)';
    thisDeviceStatusBadge.style.color = '#fbbf24';
    btnToggleSub.textContent = 'Activar';
    btnToggleSub.className = 'btn btn-primary btn-sm';
  }
}

// Activar / Desactivar Suscripción
btnToggleSub.addEventListener('click', async () => {
  if (currentSubscription) {
    // Desuscribir
    try {
      await fetch(`${BACKEND_URL}/api/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: currentSubscription.endpoint })
      });
      await currentSubscription.unsubscribe();
      currentSubscription = null;
      showToast('Notificaciones desactivadas en este equipo');
      updateSubscriptionState();
      await loadSubscriptionsList();
    } catch (e) {
      showToast('Error al desactivar');
    }
  } else {
    // Suscribir
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        showToast('Permiso de notificación denegado');
        return;
      }
      const res = await fetch(`${BACKEND_URL}/api/vapid-public-key`);
      const { publicKey } = await res.json();
      currentSubscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicKey)
      });
      const devName = deviceNameInput.value.trim() || 'Dispositivo';
      await fetch(`${BACKEND_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: currentSubscription,
          deviceName: devName,
          userAgent: navigator.userAgent
        })
      });
      showToast('✅ ¡Notificaciones activas!');
      updateSubscriptionState();
      await loadSubscriptionsList();
    } catch (e) {
      showToast('Error al activar: ' + e.message);
    }
  }
});

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

// 8. Botón de Prueba Inmediata
btnTestBroadcast.addEventListener('click', async () => {
  try {
    btnTestBroadcast.disabled = true;
    btnTestBroadcast.classList.add('loading');
    const sender = deviceNameInput.value.trim() || 'Dispositivo';

    // Reproducir sonido acústico local con Web Audio API de respaldo
    playChime();

    const res = await fetch(`${BACKEND_URL}/api/test-broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '🔔 ¡Prueba de Notificación Exitosa!',
        body: `Enviada desde "${sender}" a todos los dispositivos sincronizados.`,
        deviceName: sender
      })
    });

    if (!res.ok) throw new Error('Error al enviar difusión');
    const data = await res.json();
    const stats = data.stats || { sent: 0, total: 0 };
    showToast(`🔔 Alerta enviada a ${stats.sent} de ${stats.total} equipo(s)`);
  } catch (err) {
    showToast('Error al enviar prueba');
  } finally {
    btnTestBroadcast.disabled = false;
  }
});

// Sintetizador de Sonido de Campana de Respaldo (Web Audio API)
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota A5
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // Silencio si no se permite autoplay
  }
}

// 9. Comprobación del Servidor & Dispositivos
async function checkServerStatus() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/status`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    serverDot.className = 'status-dot online';
    devicesSummaryText.textContent = `${data.totalDevices} dispositivo(s)`;
  } catch (e) {
    serverDot.className = 'status-dot offline';
    devicesSummaryText.textContent = 'Desconectado';
  }
}

async function loadSubscriptionsList() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/subscriptions`);
    if (!res.ok) return;
    const { devices } = await res.json();
    allDevices = devices || [];

    if (allDevices.length === 0) {
      devicesModalList.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; text-align: center; padding: 12px;">No hay dispositivos registrados.</div>';
      return;
    }

    devicesModalList.innerHTML = allDevices.map(d => {
      const isThis = currentSubscription && currentSubscription.endpoint.includes(d.endpointDomain);
      return `
        <div style="background: rgba(12, 18, 32, 0.8); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 0.84rem;">
          <div>
            <strong>${escapeHTML(d.deviceName)}</strong>
            <span style="color: var(--text-dim); font-size: 0.74rem; margin-left: 6px;">(${d.endpointDomain})</span>
          </div>
          ${isThis ? '<span style="color: var(--accent-cyan); font-size: 0.75rem; font-weight: 600;">(Este)</span>' : ''}
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error(e);
  }
}

// 10. Gestión de Recordatorios
reminderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = reminderTitle.value.trim();
  const body = reminderBody.value.trim();
  const datetimeVal = reminderDatetime.value;
  const category = reminderCategory.value;

  if (!title || !datetimeVal) {
    showToast('Completa título y fecha');
    return;
  }

  const scheduled = new Date(datetimeVal);
  if (scheduled <= new Date()) {
    showToast('La fecha debe ser en el futuro');
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        scheduledTime: scheduled.toISOString(),
        category
      })
    });

    if (!res.ok) throw new Error('Error al guardar');
    showToast('📅 ¡Recordatorio programado con éxito!');
    reminderTitle.value = '';
    reminderBody.value = '';
    setupDefaultDateTime();
    await loadReminders();
  } catch (err) {
    showToast('Error: ' + err.message);
  }
});

async function loadReminders(showLoading = true) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/reminders`);
    if (!res.ok) return;
    allReminders = await res.json();

    const pending = allReminders.filter(r => r.status === 'pending');
    const sent = allReminders.filter(r => r.status !== 'pending');

    countPending.textContent = pending.length;
    countSent.textContent = sent.length;

    renderReminders();
  } catch (e) {
    console.error(e);
  }
}

function renderReminders() {
  const filtered = allReminders.filter(r => activeTab === 'pending' ? r.status === 'pending' : r.status !== 'pending');

  if (filtered.length === 0) {
    remindersContainer.innerHTML = `
      <div class="empty-state">
        ${activeTab === 'pending' ? '✨ No tienes recordatorios pendientes.' : '📭 No hay recordatorios en el historial.'}
      </div>
    `;
    return;
  }

  remindersContainer.innerHTML = filtered.map(r => {
    const scheduled = new Date(r.scheduledTime);
    const now = new Date();
    const diffMs = scheduled - now;
    const isDueSoon = diffMs > 0 && diffMs <= 30 * 60000;

    let countdownStr = '';
    if (r.status === 'pending') {
      if (diffMs <= 0) {
        countdownStr = '<span class="countdown-tag" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b;">⏳ Por dispararse</span>';
      } else {
        const mins = Math.round(diffMs / 60000);
        if (mins < 60) countdownStr = `<span class="countdown-tag">⏳ En ${mins} min</span>`;
        else if (mins < 1440) countdownStr = `<span class="countdown-tag">⏳ En ${Math.floor(mins / 60)}h ${mins % 60}m</span>`;
        else countdownStr = `<span class="countdown-tag">⏳ En ${Math.floor(mins / 1440)}d</span>`;
      }
    } else {
      countdownStr = '<span class="countdown-tag" style="background: rgba(16, 185, 129, 0.15); color: #34d399;">✔ Enviado a todos</span>';
    }

    const dateFormatted = scheduled.toLocaleString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="reminder-item ${isDueSoon ? 'due-soon' : ''}">
        <div class="reminder-main">
          <h4>
            <span>${escapeHTML(r.title)}</span>
            <span class="category-badge">${escapeHTML(r.category || 'General')}</span>
          </h4>
          ${r.body ? `<p>${escapeHTML(r.body)}</p>` : ''}
          <div class="reminder-footer">
            <span>⏰ ${dateFormatted}</span>
            ${countdownStr}
          </div>
        </div>

        <div class="reminder-item-actions">
          ${r.status === 'pending' ? `
            <button class="btn btn-ghost btn-sm" onclick="sendNow('${r.id}')" title="Disparar inmediatamente">
              ⚡ Enviar Ya
            </button>
          ` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteReminder('${r.id}')" title="Eliminar">
            🗑
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteReminder = async function(id) {
  if (!confirm('¿Eliminar este recordatorio?')) return;
  try {
    await fetch(`${BACKEND_URL}/api/reminders/${id}`, { method: 'DELETE' });
    showToast('Recordatorio eliminado');
    await loadReminders();
  } catch (e) {
    showToast('Error al eliminar');
  }
};

window.sendNow = async function(id) {
  try {
    playChime();
    await fetch(`${BACKEND_URL}/api/reminders/${id}/send-now`, { method: 'POST' });
    showToast('⚡ Alerta enviada a todos los dispositivos');
    await loadReminders();
  } catch (e) {
    showToast('Error al enviar');
  }
};

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}
