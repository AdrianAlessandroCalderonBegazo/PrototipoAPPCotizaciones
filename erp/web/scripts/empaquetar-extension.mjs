// Empaqueta la extensión de Chrome (carpeta extension/ del repositorio) en public/icr-autollenado-sunat.zip para que el ERP
// la ofrezca en Facturación › «Instalar extensión». Zip sin compresión, hecho a mano (sin dependencias). public/*.zip está en .gitignore.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = join(aqui, '..', '..', '..', 'extension');
const destino = join(aqui, '..', 'public', 'icr-autollenado-sunat.zip');

const TABLA = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = TABLA[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n);
    return statSync(r).isDirectory() ? archivos(r) : [r];
  });
}

if (!existsSync(origen)) {
  console.log('Sin la carpeta extension/: el ERP no ofrecerá la descarga de la extensión.');
} else {
  const partes = [];
  const central = [];
  let offset = 0;
  for (const ruta of archivos(origen).sort()) {
    const nombre = Buffer.from(`icr-autollenado-sunat/${relative(origen, ruta).split('\\').join('/')}`);
    const datos = readFileSync(ruta);
    const crc = crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(0, 8); local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(datos.length, 18); local.writeUInt32LE(datos.length, 22); local.writeUInt16LE(nombre.length, 26); local.writeUInt16LE(0, 28);
    partes.push(local, nombre, datos);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(datos.length, 20); c.writeUInt32LE(datos.length, 24);
    c.writeUInt16LE(nombre.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nombre);
    offset += local.length + nombre.length + datos.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(central.length / 2, 8); fin.writeUInt16LE(central.length / 2, 10);
  fin.writeUInt32LE(tamCentral, 12); fin.writeUInt32LE(offset, 16);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, Buffer.concat([...partes, ...central, fin]));
  console.log(`Extensión empaquetada: ${central.length / 2} archivos`);
}
