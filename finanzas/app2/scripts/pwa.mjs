/**
 * Convierte la exportación web de Expo en una PWA instalable y con modo sin conexión:
 *   1. genera dist/sw.js con la lista de todos los archivos (y una versión que cambia si cambia cualquiera),
 *   2. agrega al index.html el manifest, los metadatos para instalarla y el registro del service worker.
 * Uso: node scripts/pwa.mjs dist
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(process.argv[2] || "dist");
const aqui = path.dirname(fileURLToPath(import.meta.url));
if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error(`No hay ${dist}/index.html: corre antes "expo export -p web".`);

for (const f of ["manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"])
  if (!fs.existsSync(path.join(dist, f))) throw new Error(`Falta ${f} en ${dist}: debe estar en app/public/.`);

const SALTAR = new Set(["sw.js", "metadata.json"]);
const archivos = [];
(function recorrer(dir) {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, n.name);
    if (n.isDirectory()) recorrer(p);
    else {
      const rel = path.relative(dist, p).split(path.sep).join("/");
      if (!SALTAR.has(rel) && !rel.endsWith(".map")) archivos.push(rel);
    }
  }
})(dist);
archivos.sort();

const hash = createHash("sha1");
for (const rel of archivos) hash.update(rel).update(fs.readFileSync(path.join(dist, rel)));
const version = hash.digest("hex").slice(0, 12);

// "/" y "/index.html" son el mismo archivo; el resto, tal cual (con los caracteres raros escapados)
const urls = ["/", ...archivos.map((r) => "/" + r.split("/").map(encodeURIComponent).join("/"))];
// replaceAll con función: el comentario de la plantilla también nombra los marcadores, y un "$" en una ruta no debe interpretarse
const sw = fs
  .readFileSync(path.join(aqui, "sw.template.js"), "utf8")
  .replaceAll("__VERSION__", () => version)
  .replaceAll("__PRECACHE__", () => JSON.stringify(urls, null, 2));
if (/__(VERSION|PRECACHE)__/.test(sw)) throw new Error("sw.js quedó con marcadores sin reemplazar.");
fs.writeFileSync(path.join(dist, "sw.js"), sw);

const REGISTRO = `<script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    var habiaControl = !!navigator.serviceWorker.controller;
    var arranque = Date.now();
    var recargando = false;
    // Una versión nueva se aplica solo al abrir la app (en los primeros segundos), para no cortar a nadie a mitad de un formulario.
    function aplicar(w) {
      try {
        if (sessionStorage.getItem("icr-sw-recarga")) return;
        sessionStorage.setItem("icr-sw-recarga", "1");
        setTimeout(function () { try { sessionStorage.removeItem("icr-sw-recarga"); } catch (e) {} }, 15000);
      } catch (e) {}
      w.postMessage("SKIP_WAITING");
    }
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!habiaControl || recargando) return; // la primera instalación no necesita recargar
      recargando = true;
      location.reload();
    });
    navigator.serviceWorker.register("/sw.js").then(function (reg) {
      if (reg.waiting && habiaControl) aplicar(reg.waiting);
      reg.addEventListener("updatefound", function () {
        var nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener("statechange", function () {
          if (nuevo.state === "installed" && navigator.serviceWorker.controller && Date.now() - arranque < 20000) aplicar(nuevo);
        });
      });
      document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") reg.update().catch(function () {}); });
    }).catch(function () {});
  });
}
</script>`;

const META = `<link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#0E7490" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Finanzas 2" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`;

const ruta = path.join(dist, "index.html");
let html = fs.readFileSync(ruta, "utf8");
if (html.includes("manifest.webmanifest")) throw new Error("index.html ya tiene el manifest: no lo corras dos veces sobre la misma carpeta.");
const antes = html;
html = html.replace('<html lang="en">', '<html lang="es">').replace("</head>", `  ${META}\n  </head>`).replace("</body>", `  ${REGISTRO}\n</body>`);
if (html === antes || !html.includes("manifest.webmanifest") || !html.includes("serviceWorker")) throw new Error("No se pudo parchear index.html (¿cambió su estructura?).");
fs.writeFileSync(ruta, html);

console.log(`PWA lista: ${urls.length} archivos precacheados · versión ${version}`);
