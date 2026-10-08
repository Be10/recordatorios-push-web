const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Directorios y archivos de datos
const DATA_DIR = path.join(__dirname, 'data');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 1. Configuración de Llaves VAPID (Web Push)
let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
  contactEmail: process.env.VAPID_EMAIL || 'mailto:admin@example.com'
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  if (fs.existsSync(VAPID_FILE)) {
    try {
      const savedKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
      vapidKeys.publicKey = savedKeys.publicKey;
      vapidKeys.privateKey = savedKeys.privateKey;
      if (savedKeys.contactEmail) vapidKeys.contactEmail = savedKeys.contactEmail;
      console.log('✓ Llaves VAPID cargadas desde archivo.');
    } catch (e) {
      console.error('Error leyendo vapid.json, regenerando...', e);
    }
  }

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    const generated = webpush.generateVAPIDKeys();
    vapidKeys.publicKey = generated.publicKey;
    vapidKeys.privateKey = generated.privateKey;
    fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
    console.log('✓ Nuevas llaves VAPID generadas y guardadas.');
  }
}

webpush.setVapidDetails(
  vapidKeys.contactEmail,
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// 2. Helpers para almacenamiento JSON
function readJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error leyendo ${file}:`, err.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error escribiendo ${file}:`, err.message);
  }
}

// 3. Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 4. API Endpoints

// Obtener clave pública para que el navegador se suscriba
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Estado general del servidor
app.get('/api/status', (req, res) => {
  const subs = readJSON(SUBS_FILE, []);
  const reminders = readJSON(REMINDERS_FILE, []);
  const pending = reminders.filter(r => r.status === 'pending').length;
  res.json({
    status: 'online',
    serverTime: new Date().toISOString(),
    totalDevices: subs.length,
    totalReminders: reminders.length,
    pendingReminders: pending
  });
});

// Registrar o actualizar suscripción de un dispositivo
app.post('/api/subscribe', (req, res) => {
  const { subscription, deviceName, userAgent } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }

  let subs = readJSON(SUBS_FILE, []);
  const existingIdx = subs.findIndex(s => s.subscription.endpoint === subscription.endpoint);

  const deviceData = {
    id: 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    subscription,
    deviceName: deviceName || 'Dispositivo desconocido',
    userAgent: userAgent || 'Navegador Web',
    updatedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    subs[existingIdx] = {
      ...subs[existingIdx],
      ...deviceData,
      createdAt: subs[existingIdx].createdAt || new Date().toISOString()
    };
  } else {
    deviceData.createdAt = new Date().toISOString();
    subs.push(deviceData);
  }

  writeJSON(SUBS_FILE, subs);
  console.log(`[Dispositivo Conectado] ${deviceData.deviceName} (Total: ${subs.length})`);
  res.json({ success: true, count: subs.length, deviceId: deviceData.id });
});

// Desuscribir dispositivo
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Falta endpoint' });

  let subs = readJSON(SUBS_FILE, []);
  const initialCount = subs.length;
  subs = subs.filter(s => s.subscription.endpoint !== endpoint);
  writeJSON(SUBS_FILE, subs);

  console.log(`[Dispositivo Desconectado] Total actual: ${subs.length}`);
  res.json({ success: true, removed: initialCount - subs.length });
});

// Listar dispositivos registrados
app.get('/api/subscriptions', (req, res) => {
  const subs = readJSON(SUBS_FILE, []);
  // Devolvemos información segura sin exponer claves privadas
  const safeList = subs.map(s => ({
    id: s.id,
    deviceName: s.deviceName,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    endpointDomain: new URL(s.subscription.endpoint).hostname
  }));
  res.json({ total: safeList.length, devices: safeList });
});

// Listar recordatorios
app.get('/api/reminders', (req, res) => {
  const reminders = readJSON(REMINDERS_FILE, []);
  // Ordenar por fecha programada (los más cercanos primero)
  reminders.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
  res.json(reminders);
});

// Crear nuevo recordatorio programado
app.post('/api/reminders', (req, res) => {
  const { title, body, scheduledTime, category, priority } = req.body;

  if (!title || !scheduledTime) {
    return res.status(400).json({ error: 'Título y fecha/hora son obligatorios' });
  }

  const scheduledDate = new Date(scheduledTime);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: 'Formato de fecha/hora inválido' });
  }

  const reminder = {
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    title: title.trim(),
    body: (body || '').trim(),
    scheduledTime: scheduledDate.toISOString(),
    category: category || 'General',
    priority: priority || 'normal',
    status: 'pending', // 'pending' | 'sent' | 'cancelled'
    createdAt: new Date().toISOString(),
    sentAt: null,
    deliveryStats: null
  };

  const reminders = readJSON(REMINDERS_FILE, []);
  reminders.push(reminder);
  writeJSON(REMINDERS_FILE, reminders);

  console.log(`[Recordatorio Creado] "${reminder.title}" programado para ${reminder.scheduledTime}`);
  res.status(201).json(reminder);
});

// Eliminar recordatorio
app.delete('/api/reminders/:id', (req, res) => {
  const { id } = req.params;
  let reminders = readJSON(REMINDERS_FILE, []);
  const initialLen = reminders.length;
  reminders = reminders.filter(r => r.id !== id);

  if (reminders.length === initialLen) {
    return res.status(404).json({ error: 'Recordatorio no encontrado' });
  }

  writeJSON(REMINDERS_FILE, reminders);
  res.json({ success: true, message: 'Recordatorio eliminado' });
});

// Enviar un recordatorio inmediatamente (disparador manual)
app.post('/api/reminders/:id/send-now', async (req, res) => {
  const { id } = req.params;
  let reminders = readJSON(REMINDERS_FILE, []);
  const reminder = reminders.find(r => r.id === id);

  if (!reminder) {
    return res.status(404).json({ error: 'Recordatorio no encontrado' });
  }

  const payload = {
    title: reminder.title,
    body: reminder.body || '¡Recordatorio programado!',
    tag: `reminder-${reminder.id}`,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url: '/',
    timestamp: Date.now(),
    data: { reminderId: reminder.id }
  };

  const stats = await broadcastNotification(payload);
  reminder.status = 'sent';
  reminder.sentAt = new Date().toISOString();
  reminder.deliveryStats = stats;
  writeJSON(REMINDERS_FILE, reminders);

  res.json({ success: true, stats, reminder });
});

// BOTÓN DE PRUEBA: Enviar notificación inmediata a TODOS los dispositivos
app.post('/api/test-broadcast', async (req, res) => {
  const { title, body, deviceName } = req.body;

  const payload = {
    title: title || '🔔 ¡Notificación de Prueba Exitosa!',
    body: body || `Enviada desde "${deviceName || 'un dispositivo'}" a todos los equipos registrados.`,
    tag: 'test-broadcast-' + Date.now(),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url: '/',
    timestamp: Date.now(),
    vibrate: [200, 100, 200, 100, 200]
  };

  console.log(`[Broadcast de Prueba Iniciado] Destinatarios...`);
  const stats = await broadcastNotification(payload);
  res.json({
    success: true,
    message: 'Difusión completada',
    stats
  });
});

// Función central para enviar notificación a todas las suscripciones
async function broadcastNotification(payloadObj) {
  let subs = readJSON(SUBS_FILE, []);
  if (subs.length === 0) {
    return { total: 0, sent: 0, failed: 0, removedExpired: 0 };
  }

  const payloadStr = JSON.stringify(payloadObj);
  let sentCount = 0;
  let failedCount = 0;
  const expiredEndpoints = [];

  const promises = subs.map(async (device) => {
    try {
      await webpush.sendNotification(device.subscription, payloadStr);
      sentCount++;
    } catch (err) {
      failedCount++;
      console.error(`Error enviando a ${device.deviceName}:`, err.statusCode, err.message);
      // Códigos 404 o 410 indican que la suscripción expiró o el usuario revocó permisos
      if (err.statusCode === 404 || err.statusCode === 410) {
        expiredEndpoints.push(device.subscription.endpoint);
      }
    }
  });

  await Promise.all(promises);

  // Limpiar suscripciones inválidas o caducadas automáticamente
  if (expiredEndpoints.length > 0) {
    subs = subs.filter(s => !expiredEndpoints.includes(s.subscription.endpoint));
    writeJSON(SUBS_FILE, subs);
    console.log(`[Limpieza] ${expiredEndpoints.length} suscripciones inactivas eliminadas.`);
  }

  return {
    total: subs.length + expiredEndpoints.length,
    sent: sentCount,
    failed: failedCount,
    removedExpired: expiredEndpoints.length
  };
}

// 5. MOTOR DEL SCHEDULER (Verifica recordatorios en segundo plano)
const CHECK_INTERVAL_MS = 15000; // cada 15 segundos

setInterval(async () => {
  try {
    const reminders = readJSON(REMINDERS_FILE, []);
    const now = new Date();

    const dueReminders = reminders.filter(
      r => r.status === 'pending' && new Date(r.scheduledTime) <= now
    );

    if (dueReminders.length === 0) return;

    console.log(`[Scheduler] Procesando ${dueReminders.length} recordatorio(s) pendiente(s)...`);

    for (const reminder of dueReminders) {
      const payload = {
        title: `⏰ ${reminder.title}`,
        body: reminder.body || '¡Es momento de tu recordatorio!',
        tag: `reminder-${reminder.id}`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        url: '/',
        timestamp: Date.now(),
        data: { reminderId: reminder.id }
      };

      const stats = await broadcastNotification(payload);
      reminder.status = 'sent';
      reminder.sentAt = new Date().toISOString();
      reminder.deliveryStats = stats;
      console.log(`[Scheduler] Recordatorio "${reminder.title}" enviado. Éxito: ${stats.sent}/${stats.total}`);
    }

    writeJSON(REMINDERS_FILE, reminders);
  } catch (err) {
    console.error('[Scheduler Error]:', err);
  }
}, CHECK_INTERVAL_MS);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(` Servidor de Recordatorios Web Push ACTIVO`);
  console.log(` Puerto: http://localhost:${PORT}`);
  console.log(` Clave Pública VAPID: ${vapidKeys.publicKey.substring(0, 20)}...`);
  console.log(`===================================================`);
});
