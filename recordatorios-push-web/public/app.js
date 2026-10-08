// Lógica del Cliente - Recordatorios Push Universales

// 1. Configuración de API Backend
let BACKEND_URL = localStorage.getItem('custom_backend_url') || '';
if (!BACKEND_URL) {
  // Si estamos en localhost o servidor propio, usar origin actual
  if (window.location.hostname !== 'localhost' && window.location.hostname.endsWith('github.io')) {
    // Si está en GitHub Pages y no hay URL configurada, indicar al usuario
    console.warn('Ejecutándose en GitHub Pages. Se requiere configurar la URL del backend.');
  } else {
    BACKEND_URL = window.location.origin;
  }
}

let swRegistration = null;
let currentSubscription = null;
let activeTab = 'pending';
let allReminders = [];

// Elementos del DOM
const serverDot = document.getElementById('server-status-dot');
const serverText = document.getElementById('server-status-text');
const devicesOnlineText = document.getElementById('devices-online-text');
const deviceStatusBadge = document.getElementById('device-status-badge');
const deviceStatusLabel = document.getElementById('device-status-label');
const deviceNameInput = document.getElementById('device-name-input');
const btnSubscribe = document.getElementById('btn-subscribe');
const btnUnsubscribe = document.getElementById('btn-unsubscribe');
const btnTestBroadcast = document.getElementById('btn-test-broadcast');
const testResultMsg = document.getElementById('test-result-msg');
const devicesList = document.getElementById('devices-list');
const totalDevicesCount = document.getElementById('total-devices-count');
const reminderForm = document.getElementById('reminder-form');
const reminderDatetime = document.getElementById('reminder-datetime');
const remindersContainer = document.getElementById('reminders-container');
const countPending = document.getElementById('count-pending');
const countSent = document.getElementById('count-sent');
const guideToggle = document.getElementById('guide-toggle');
const guideBody = document.getElementById('guide-body');
const guideArrow = document.getElementById('guide-arrow');
const btnToggleConfig = document.getElementById('btn-toggle-config');
const backendConfigPanel = document.getElementById('backend-config-panel');
const backendUrlInput = document.getElementById('backend-url-input');
const btnSaveBackend = document.getElementById('btn-save-backend');
const toast = document.getElementById('toast');

// 2. Inicialización
window.addEventListener('DOMContentLoaded', async () => {
  setupDeviceDefaultName();
  setupBackendConfigUI();
  setupGuideAccordion();
  setupQuickTimeButtons();
  setupTabs();
  setupPWAInstall();

  // Registrar Service Worker
  await initServiceWorker();

  // Comprobar conexión con el servidor
  await checkServerStatus();
  await loadSubscriptionsList();
  await loadReminders();

  // Refrescar cada 20 segundos
  setInterval(() => {
    checkServerStatus();
    loadReminders(false);
  }, 20000);
});

// Toast flotante
function showToast(message, duration = 3500) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// Detección automática del nombre del dispositivo
function setupDeviceDefaultName() {
  const savedName = localStorage.getItem('push_device_name');
  if (savedName) {
    deviceNameInput.value = savedName;
    return;
  }

  const ua = navigator.userAgent;
  let devName = 'Navegador Web';
  if (/iPhone/i.test(ua)) devName = 'iPhone';
  else if (/iPad/i.test(ua)) devName = 'iPad';
  else if (/Android/i.test(ua)) devName = 'Teléfono Android';
  else if (/Macintosh|Mac OS X/i.test(ua)) devName = 'Mac';
  else if (/Windows NT/i.test(ua)) devName = 'PC Windows';
  else if (/Linux/i.test(ua)) devName = 'Linux';

  deviceNameInput.value = devName;
}

deviceNameInput.addEventListener('change', () => {
  localStorage.setItem('push_device_name', deviceNameInput.value.trim());
});

// Configuración de Backend URL
function setupBackendConfigUI() {
  backendUrlInput.value = BACKEND_URL;
  btnToggleConfig.addEventListener('click', () => {
    backendConfigPanel.style.display = backendConfigPanel.style.display === 'none' ? 'block' : 'none';
  });

  btnSaveBackend.addEventListener('click', async () => {
    let url = backendUrlInput.value.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    BACKEND_URL = url;
    localStorage.setItem('custom_backend_url', url);
    showToast('Backend guardado. Reconectando...');
    backendConfigPanel.style.display = 'none';
    await checkServerStatus();
    await loadSubscriptionsList();
    await loadReminders();
  });
}

// Guía Desplegable
function setupGuideAccordion() {
  guideToggle.addEventListener('click', () => {
    const isOpen = guideBody.classList.contains('open');
    guideBody.classList.toggle('open');
    guideArrow.textContent = isOpen ? '▼' : '▲';
  });
}

// Botones de atajo de hora (+5m, +15m, +1h, mañana 9am)
function setupQuickTimeButtons() {
  // Ajustar hora mínima en el input al momento actual
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const localIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  reminderDatetime.min = localIso;

  document.querySelectorAll('.btn-quick[data-minutes]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.dataset.minutes, 10);
      const target = new Date(Date.now() + mins * 60000);
      reminderDatetime.value = formatForDateTimeInput(target);
    });
  });

  document.getElementById('btn-tomorrow-9am').addEventListener('click', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    reminderDatetime.value = formatForDateTimeInput(tomorrow);
  });
}

function formatForDateTimeInput(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Pestañas (Pendientes / Enviados)
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderReminders();
    });
  });
}

// 3. Service Worker y Web Push
async function initServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    updateDeviceBadge('disconnected', 'Web Push no soportado en este navegador');
    btnSubscribe.disabled = true;
    return;
  }

  try {
    // Usar ruta relativa para compatibilidad con GitHub Pages
    swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    console.log('Service Worker registrado:', swRegistration.scope);

    // Verificar si ya existe suscripción
    currentSubscription = await swRegistration.pushManager.getSubscription();
    updateSubscriptionUI();
  } catch (err) {
    console.error('Fallo al registrar Service Worker:', err);
    updateDeviceBadge('disconnected', 'Error registrando Service Worker');
  }
}

function updateSubscriptionUI() {
  if (currentSubscription) {
    updateDeviceBadge('connected', '🟢 Notificaciones Activas en este equipo');
    btnSubscribe.style.display = 'none';
    btnUnsubscribe.style.display = 'inline-flex';
  } else {
    if (Notification.permission === 'denied') {
      updateDeviceBadge('disconnected', '🔴 Permiso Denegado (Revisa ajustes del navegador)');
      btnSubscribe.disabled = true;
      btnUnsubscribe.style.display = 'none';
    } else {
      updateDeviceBadge('pending', '🟡 Notificaciones pendientes de activación');
      btnSubscribe.style.display = 'inline-flex';
      btnSubscribe.disabled = false;
      btnUnsubscribe.style.display = 'none';
    }
  }
}

function updateDeviceBadge(status, label) {
  deviceStatusBadge.className = `device-status-badge badge-${status}`;
  deviceStatusLabel.textContent = label;
}

// Conversor VAPID Key URL-Safe Base64 a Uint8Array
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Botón Activar Notificaciones
btnSubscribe.addEventListener('click', async () => {
  try {
    if (!swRegistration) {
      showToast('Service Worker aún no está listo. Espera un momento.');
      return;
    }

    // Solicitar permiso explícito al usuario
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Permiso de notificación no concedido.');
      updateSubscriptionUI();
      return;
    }

    btnSubscribe.disabled = true;
    btnSubscribe.textContent = 'Suscribiendo...';

    // Obtener VAPID public key del backend
    const res = await fetch(`${BACKEND_URL}/api/vapid-public-key`);
    if (!res.ok) throw new Error('No se pudo obtener la llave VAPID del servidor');
    const { publicKey } = await res.json();

    const applicationServerKey = urlB64ToUint8Array(publicKey);
    currentSubscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });

    // Enviar suscripción al backend
    const devName = deviceNameInput.value.trim() || 'Dispositivo';
    const subRes = await fetch(`${BACKEND_URL}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: currentSubscription,
        deviceName: devName,
        userAgent: navigator.userAgent
      })
    });

    if (!subRes.ok) throw new Error('Error al registrar dispositivo en backend');

    showToast('✅ ¡Notificaciones activadas en este dispositivo!');
    updateSubscriptionUI();
    await loadSubscriptionsList();
  } catch (err) {
    console.error('Error suscribiendo:', err);
    showToast('❌ Error: ' + err.message);
    updateSubscriptionUI();
  } finally {
    btnSubscribe.disabled = false;
    btnSubscribe.textContent = 'Activar Notificaciones';
  }
});

// Botón Desactivar Notificaciones
btnUnsubscribe.addEventListener('click', async () => {
  if (!currentSubscription) return;
  try {
    btnUnsubscribe.disabled = true;
    await fetch(`${BACKEND_URL}/api/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: currentSubscription.endpoint })
    });

    await currentSubscription.unsubscribe();
    currentSubscription = null;
    showToast('Notificaciones desactivadas para este equipo.');
    updateSubscriptionUI();
    await loadSubscriptionsList();
  } catch (err) {
    console.error('Error al desuscribir:', err);
    showToast('Error al desuscribir: ' + err.message);
  } finally {
    btnUnsubscribe.disabled = false;
  }
});

// 4. BOTÓN DE PRUEBA: Enviar Notificación a TODOS
btnTestBroadcast.addEventListener('click', async () => {
  try {
    btnTestBroadcast.disabled = true;
    btnTestBroadcast.innerHTML = '<span>⏳ Enviando señal a todos los equipos...</span>';
    testResultMsg.style.display = 'none';

    const senderDevice = deviceNameInput.value.trim() || 'Dispositivo';

    const res = await fetch(`${BACKEND_URL}/api/test-broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '🔔 ¡Prueba de Notificación Exitosa!',
        body: `Enviada desde "${senderDevice}" a todos los dispositivos sincronizados.`,
        deviceName: senderDevice
      })
    });

    if (!res.ok) throw new Error('El servidor respondió con error al enviar prueba');
    const data = await res.json();

    const stats = data.stats || { sent: 0, total: 0 };
    testResultMsg.textContent = `✅ Prueba enviada exitosamente a ${stats.sent} de ${stats.total} dispositivo(s).`;
    testResultMsg.style.display = 'block';
    showToast(`🔔 Notificación enviada a ${stats.sent} equipo(s)`);
  } catch (err) {
    console.error('Error en broadcast:', err);
    testResultMsg.textContent = `❌ Error al enviar prueba: ${err.message}`;
    testResultMsg.style.display = 'block';
    showToast('Error en prueba de notificación');
  } finally {
    btnTestBroadcast.disabled = false;
    btnTestBroadcast.innerHTML = '<span>🔔 Enviar Notificación a Todos los Dispositivos</span>';
  }
});

// 5. Estado del Servidor
async function checkServerStatus() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/status`);
    if (!res.ok) throw new Error('Servidor no disponible');
    const data = await res.json();

    serverDot.className = 'status-dot online';
    serverText.textContent = 'Servidor Conectado';
    devicesOnlineText.textContent = `${data.totalDevices} dispositivo(s) registrados`;
    totalDevicesCount.textContent = `${data.totalDevices} activos`;
  } catch (e) {
    serverDot.className = 'status-dot offline';
    serverText.textContent = 'Sin conexión con el backend';
  }
}

// Cargar lista de dispositivos suscritos
async function loadSubscriptionsList() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/subscriptions`);
    if (!res.ok) return;
    const { devices, total } = await res.json();
    totalDevicesCount.textContent = `${total} activos`;

    if (!devices || devices.length === 0) {
      devicesList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.82rem;">No hay dispositivos registrados aún. Activa las notificaciones arriba.</div>';
      return;
    }

    devicesList.innerHTML = devices.map(d => {
      const isCurrent = currentSubscription && currentSubscription.endpoint.includes(d.endpointDomain);
      return `
        <div style="background: #090e1a; padding: 8px 12px; border-radius: 6px; font-size: 0.82rem; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border);">
          <div>
            <strong>${escapeHTML(d.deviceName)}</strong>
            <span style="color: var(--text-muted); font-size: 0.75rem; margin-left: 6px;">(${d.endpointDomain})</span>
          </div>
          ${isCurrent ? '<span style="color: var(--accent); font-size: 0.72rem; font-weight: bold;">(Este equipo)</span>' : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    devicesList.innerHTML = '<div style="color: var(--danger); font-size: 0.82rem;">Error al cargar lista de dispositivos.</div>';
  }
}

// 6. Gestión de Recordatorios
reminderForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('reminder-title').value.trim();
  const body = document.getElementById('reminder-body').value.trim();
  const datetimeVal = reminderDatetime.value;
  const category = document.getElementById('reminder-category').value;

  if (!title || !datetimeVal) {
    showToast('Por favor completa el título y la fecha/hora.');
    return;
  }

  const scheduledDate = new Date(datetimeVal);
  if (scheduledDate <= new Date()) {
    showToast('La fecha y hora deben ser en el futuro.');
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        scheduledTime: scheduledDate.toISOString(),
        category
      })
    });

    if (!res.ok) throw new Error('Error al programar recordatorio en el servidor');

    showToast('📅 Recordatorio programado exitosamente');
    reminderForm.reset();
    setupDeviceDefaultName();
    await loadReminders();
  } catch (err) {
    showToast('❌ ' + err.message);
  }
});

async function loadReminders(showLoading = true) {
  try {
    if (showLoading && allReminders.length === 0) {
      remindersContainer.innerHTML = '<div class="empty-state">Cargando recordatorios...</div>';
    }

    const res = await fetch(`${BACKEND_URL}/api/reminders`);
    if (!res.ok) return;
    allReminders = await res.json();

    const pending = allReminders.filter(r => r.status === 'pending');
    const sent = allReminders.filter(r => r.status !== 'pending');

    countPending.textContent = pending.length;
    countSent.textContent = sent.length;

    renderReminders();
  } catch (e) {
    console.error('Error cargando recordatorios:', e);
  }
}

function renderReminders() {
  const filtered = allReminders.filter(r => 
    activeTab === 'pending' ? r.status === 'pending' : r.status !== 'pending'
  );

  if (filtered.length === 0) {
    remindersContainer.innerHTML = `
      <div class="empty-state">
        ${activeTab === 'pending' ? '✨ No tienes recordatorios pendientes.' : '📭 Aún no se han enviado recordatorios.'}
      </div>
    `;
    return;
  }

  remindersContainer.innerHTML = filtered.map(r => {
    const scheduled = new Date(r.scheduledTime);
    const dateFormatted = scheduled.toLocaleString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const isPending = r.status === 'pending';
    const isPast = scheduled <= new Date();

    return `
      <div class="reminder-item">
        <div class="reminder-info">
          <h4>${escapeHTML(r.title)} <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; background: #1e293b; color: var(--accent); margin-left: 6px;">${escapeHTML(r.category || 'General')}</span></h4>
          ${r.body ? `<p>${escapeHTML(r.body)}</p>` : ''}
          <div class="reminder-meta">
            <span>⏰ ${dateFormatted}</span>
            ${isPending ? (isPast ? '<span style="color: var(--warning);">(Por dispararse)</span>' : '') : '<span style="color: var(--success);">✔ Notificación enviada</span>'}
          </div>
        </div>
        <div class="reminder-actions">
          ${isPending ? `
            <button class="btn btn-secondary btn-sm" onclick="sendNow('${r.id}')" title="Disparar a todos inmediatamente">
              ⚡ Enviar Ya
            </button>
          ` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteReminder('${r.id}')" title="Eliminar recordatorio">
            🗑
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Funciones globales para botones inline
window.deleteReminder = async function(id) {
  if (!confirm('¿Deseas eliminar este recordatorio?')) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/reminders/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    showToast('Recordatorio eliminado');
    await loadReminders();
  } catch (e) {
    showToast('Error: ' + e.message);
  }
};

window.sendNow = async function(id) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/reminders/${id}/send-now`, { method: 'POST' });
    if (!res.ok) throw new Error('Error al enviar recordatorio');
    showToast('⚡ Recordatorio enviado a todos los dispositivos');
    await loadReminders();
  } catch (e) {
    showToast('Error: ' + e.message);
  }
};

// PWA Install Prompt
let deferredPrompt;
function setupPWAInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installContainer = document.getElementById('pwa-install-container');
    const btnInstall = document.getElementById('btn-install-pwa');
    if (installContainer && btnInstall) {
      installContainer.style.display = 'block';
      btnInstall.addEventListener('click', async () => {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          installContainer.style.display = 'none';
        }
        deferredPrompt = null;
      });
    }
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
