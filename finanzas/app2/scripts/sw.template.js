/*
 * Service worker de ICR Finanzas (lo genera scripts/pwa.mjs al compilar: la versión y la lista de archivos se escriben donde dice abajo).
 *
 * Guarda toda la app (HTML, JS con hash, fuentes, íconos, OCR) al instalarse, así abre y funciona sin internet.
 * La app siempre sale de la caché y de una sola versión: el HTML y los JS que pide son del mismo despliegue.
 * Una versión nueva se instala aparte y se aplica al volver a abrir la app (ver el registro en index.html).
 *
 * Nunca toca: las llamadas a la API (otro origen, o /api), ni nada que no sea GET.
 */
const CACHE = "icr-finanzas2-__VERSION__";
const PRECACHE = __PRECACHE__;

// "@" y "%40" son la misma ruta (las fuentes viven bajo /assets/node_modules/@expo-google-fonts): se compara decodificado
// y se busca en la caché con la clave exacta con la que se guardó.
const decodificar = (p) => {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
};
const CLAVES = new Map(PRECACHE.map((u) => [decodificar(u), u]));

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // cache: "reload" salta la caché HTTP del navegador para no guardar una copia vieja
      Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })))),
    ),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("icr-finanzas2-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    e.respondWith(caches.open(CACHE).then((c) => c.match("/index.html")).then((r) => r || fetch(req)));
    return;
  }
  const clave = CLAVES.get(decodificar(url.pathname));
  if (clave) e.respondWith(caches.open(CACHE).then((c) => c.match(clave)).then((r) => r || fetch(req)));
});
