import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProveedorAvisos } from "./componentes/Avisos";
import { Cargando } from "./componentes/Estado";
import { Shell } from "./componentes/Shell";
import { CONFIGURACION, TODAS, puede, type EntradaMenu } from "./modulos";
import { Almacen } from "./paginas/Almacen";
import { Configuracion } from "./paginas/configuracion/Configuracion";
import { Inicio } from "./paginas/Inicio";
import { Login } from "./paginas/Login";
import { Pendiente, SinAcceso } from "./paginas/Pendiente";
import { ProveedorSesion, useSesion } from "./sesion";

const CONSTRUIDOS: Partial<Record<EntradaMenu["clave"], () => JSX.Element>> = { inicio: Inicio, almacen: Almacen };

function Rutas() {
  const { usuario, cargando } = useSesion();
  if (cargando) return <div className="grid h-full place-items-center"><Cargando texto="Abriendo el ERP…" /></div>;
  if (!usuario) return <Login />;
  const conAcceso = (m: EntradaMenu, el: JSX.Element) => (puede(usuario, m.clave) ? el : <SinAcceso />);
  return (
    <Shell>
      <Routes>
        {TODAS.filter((m) => m.clave !== "configuracion").map((m) => {
          const C = CONSTRUIDOS[m.clave];
          return <Route key={m.clave} path={m.ruta} element={conAcceso(m, C ? <C /> : <Pendiente modulo={m} />)} />;
        })}
        <Route path="/configuracion" element={<Navigate to="/configuracion/usuarios" replace />} />
        <Route path="/configuracion/:seccion" element={conAcceso(CONFIGURACION, <Configuracion />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ProveedorAvisos>
        <ProveedorSesion>
          <Rutas />
        </ProveedorSesion>
      </ProveedorAvisos>
    </BrowserRouter>
  );
}
