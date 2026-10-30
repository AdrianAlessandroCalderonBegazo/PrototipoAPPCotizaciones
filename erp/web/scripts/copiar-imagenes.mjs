// Copia las fotos del catálogo inicial (las mismas de Logística, assets/productos) a public/productos para que el ERP las
// sirva en /productos/archivo.jpg. No se guardan dos veces en git: public/productos está en .gitignore.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = join(aqui, '..', '..', '..', 'assets', 'productos');
const destino = join(aqui, '..', 'public', 'productos');
if (!existsSync(origen)) {
  console.log('Sin assets/productos: el catálogo se verá sin las fotos iniciales.');
} else {
  mkdirSync(destino, { recursive: true });
  cpSync(origen, destino, { recursive: true });
  console.log(`Fotos del catálogo copiadas: ${readdirSync(destino).length}`);
}
