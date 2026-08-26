// Service Worker do Xaphires - cache básico dos assets estáticos (JS/CSS/
// imagens com nome hasheado, gerados pelo Vite) para abrir mais rápido da
// segunda vez em diante. Nunca cacheia /api/* (dado dinâmico, multiempresa,
// atrás de cookie de sessão) nem a navegação em si (o HTML) - cachear a
// página inteira faria o app instalado ficar preso numa versão velha do
// bundle depois de um deploy, sem forma óbvia de perceber.
const CACHE_NAME = "xaphires-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  // Navegação (o próprio documento HTML): sempre rede, nunca cache - ver
  // comentário no topo do arquivo.
  if (request.mode === "navigate") return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok && response.type === "basic") cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
