import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProveedorAvisos } from "./componentes/Avisos";
import { Cargando } from "./componentes/Estado";
import { Shell } from "./componentes/Shell";
import { CONFIGURACION, TODAS, puede, type EntradaMenu } from "./modulos";
import { Almacen } from "./paginas/Almacen";
import { Contabilidad } from "./paginas/contabilidad/Contabilidad";
import { AsistenteIA } from "./paginas/ia/AsistenteIA";
import { CotizadorIA } from "./paginas/ia/CotizadorIA";
import { ComprobanteVer, Facturacion } from "./paginas/facturacion/Facturacion";
import { Comparador } from "./paginas/comparador/Comparador";
import { FlujoComprobante } from "./paginas/facturacion/Flujo";
import { Cotizacion } from "./paginas/cotizacion/Cotizacion";
import { CotizacionEditor } from "./paginas/cotizacion/CotizacionEditor";
import { CotizacionVer } from "./paginas/cotizacion/CotizacionVer";
import { ProyectoDetalle } from "./paginas/proyectos/ProyectoDetalle";
import { Proyectos } from "./paginas/proyectos/Proyectos";
import { Configuracion } from "./paginas/configuracion/Configuracion";
import { Inicio } from "./paginas/Inicio";
import { Login } from "./paginas/Login";
import { Pendiente, SinAcceso } from "./paginas/Pendiente";
import { ProveedorSesion, useSesion } from "./sesion";

const CONSTRUIDOS: Partial<Record<EntradaMenu["clave"], () => JSX.Element | null>> = { inicio: Inicio, almacen: Almacen, proyectos: Proyectos, contabilidad: Contabilidad, cotizacion: Cotizacion, facturacion: Facturacion, cotizador_ia: CotizadorIA, asistente_ia: AsistenteIA, comparador: Comparador };

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
        <Route path="/proyectos/:id" element={conAcceso(TODAS.find((m) => m.clave === "proyectos")!, <ProyectoDetalle />)} />
        <Route path="/cotizacion/nueva" element={puede(usuario, "cotizacion", "completo") ? <CotizacionEditor key="nueva" /> : <SinAcceso />} />
        <Route path="/cotizacion/:id/editar" element={puede(usuario, "cotizacion", "completo") ? <CotizacionEditor /> : <SinAcceso />} />
        <Route path="/cotizacion/:id" element={conAcceso(TODAS.find((m) => m.clave === "cotizacion")!, <CotizacionVer />)} />
        <Route path="/facturacion/nuevo" element={puede(usuario, "facturacion", "completo") ? <FlujoComprobante key="nuevo-cot" /> : <SinAcceso />} />
        <Route path="/facturacion/:id" element={conAcceso(TODAS.find((m) => m.clave === "facturacion")!, <ComprobanteVer />)} />
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
