/* CatatanKu service worker — offline-first app shell */
const CACHE_VERSION = 'v2';
const CACHE_NAME = `catatanku-static-${CACHE_VERSION}`;
const BASE_URL = new URL('./', self.location.href);
const INDEX_URL = new URL('index.html', BASE_URL).href;
const TAILWIND_URL = 'https://cdn.tailwindcss.com/';

const CORE_ASSETS = [
  new URL('./', BASE_URL).href,
  INDEX_URL,
  new URL('manifest.json', BASE_URL).href,
  new URL('icon.svg', BASE_URL).href
];

async function cacheTailwind(cache) {
  try {
    const response = await fetch(TAILWIND_URL, { cache: 'reload' });
    if (response && response.ok) {
      await cache.put(TAILWIND_URL, response.clone());
    }
  } catch (error) {
    try {
      const opaqueResponse = await fetch(TAILWIND_URL, { mode: 'no-cors', cache: 'reload' });
      if (opaqueResponse) await cache.put(TAILWIND_URL, opaqueResponse);
    } catch (fallbackError) {
      // Tailwind akan tetap dicoba lagi saat ada koneksi pada kunjungan berikutnya.
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(
      CORE_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
    );
    await cacheTailwind(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

async function getAppShell(request) {
  const cache = await caches.open(CACHE_NAME);
  return (
    (await cache.match(request)) ||
    (await cache.match(INDEX_URL)) ||
    (await cache.match(BASE_URL.href))
  );
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      const copy = response.clone();
      await cache.put(INDEX_URL, copy.clone());
      await cache.put(request, copy);
      return response;
    }

    const cached = await getAppShell(request);
    if (cached) return cached;
    return response;
  } catch (error) {
    const cached = await getAppShell(request);
    return (
      cached ||
      new Response(
        '<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CatatanKu Offline</title><body style="font-family:system-ui;padding:2rem;background:#FFFAF0;color:#44403c"><h1>CatatanKu</h1><p>Aplikasi belum tersimpan untuk mode offline. Buka sekali saat online, lalu coba lagi.</p></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    );
  }
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;
  return new Response('', { status: 504, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.origin === self.location.origin || url.hostname === 'cdn.tailwindcss.com') {
    event.respondWith(handleAsset(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
