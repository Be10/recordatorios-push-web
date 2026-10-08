// Service Worker para Notificaciones Push Multiplataforma

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Escuchar evento Push desde el servidor
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Recordatorio', body: event.data.text() };
    }
  }

  const title = data.title || '🔔 Recordatorio';
  const options = {
    body: data.body || 'Tienes un nuevo recordatorio programado.',
    icon: data.icon || './icons/icon-192.png',
    badge: data.badge || './icons/icon-192.png',
    tag: data.tag || 'general-reminder',
    renotify: true,
    requireInteraction: true, // Permanece en pantalla en Windows/Mac hasta que el usuario interactúe
    vibrate: data.vibrate || [200, 100, 200, 100, 200],
    data: {
      url: data.url || './',
      timestamp: data.timestamp || Date.now(),
      reminderId: data.data?.reminderId
    },
    actions: [
      { action: 'open', title: 'Abrir App' },
      { action: 'dismiss', title: 'Entendido' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Manejar clic en la notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si la app ya está abierta en alguna pestaña, enfocarla
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Si no está abierta, abrir una nueva ventana
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
