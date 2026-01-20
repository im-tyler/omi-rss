// Service Worker for Web Push Notifications
// This file should be served at /sw.js in the client application

declare const self: ServiceWorkerGlobalScope;

interface NotificationData {
  type: string;
  action?: string;
  articleId?: string;
  feedId?: string;
  teamId?: string;
  url?: string;
}

// Install event
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(clients.claim());
});

// Push event
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received');

  if (!event.data) {
    console.log('[Service Worker] No data in push event');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {
      title: 'Omi RSS',
      body: event.data.text(),
    };
  }

  const options: NotificationOptions = {
    body: payload.body,
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/badge-72.png',
    image: payload.image,
    tag: payload.tag,
    data: payload.data || {},
    vibrate: payload.vibrate || [200, 100, 200],
    requireInteraction: payload.requireInteraction || false,
    actions: payload.actions || [],
    silent: payload.silent || false,
    renotify: payload.renotify || false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked');
  event.notification.close();

  const data = event.notification.data as NotificationData;
  let url = '/';

  // Handle action clicks
  if (event.action) {
    switch (event.action) {
      case 'accept':
        url = '/teams?action=accept';
        break;
      case 'decline':
        url = '/teams?action=decline';
        break;
      case 'try_now':
        url = '/features/new';
        break;
      case 'learn_more':
        url = '/help';
        break;
      default:
        url = `/?action=${event.action}`;
    }
  } else {
    // Handle notification body clicks based on type
    switch (data.type) {
      case 'new_articles':
        url = data.feedId ? `/feeds/${data.feedId}` : '/articles';
        break;
      case 'price_alert':
        url = `/market/${data.symbol || ''}`;
        break;
      case 'team_invite':
        url = '/teams';
        break;
      case 'new_comment':
      case 'mention':
      case 'reading_buddy':
        url = data.articleId ? `/articles/${data.articleId}` : '/articles';
        break;
      case 'shared_folder':
        url = data.folderId ? `/folders/${data.folderId}` : '/folders';
        break;
      case 'daily_digest':
        url = '/stats';
        break;
      case 'security_alert':
        url = '/settings/security';
        break;
      default:
        url = data.url || '/';
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Check if a window is already open
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if needed
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync for failed notifications
self.addEventListener('sync', (event) => {
  if (event.tag === 'retry-notifications') {
    event.waitUntil(retryFailedNotifications());
  }
});

async function retryFailedNotifications() {
  // Implement retry logic for failed notifications
  console.log('[Service Worker] Retrying failed notifications...');
}

// Message event for client communication
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

export {};