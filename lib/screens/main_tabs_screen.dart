import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/notificaciones_service.dart';
import '../state/almacen_state.dart';
import '../state/navegacion_state.dart';
import '../widgets/brand_icon.dart';
import 'almacen_screen.dart';
import 'inicio_screen.dart';
import 'requerimiento_detalle_screen.dart';

/// Barra de navegación de abajo con dos pestañas: Inicio y Almacén (la
/// cotización pasó al ERP). Usa IndexedStack para
/// que cada pestaña conserve su estado (lo marcado, lo buscado) al cambiar
/// de una a otra. El índice activo vive en NavegacionState para que una
/// pantalla empujada en profundidad pueda pedir "volver al inicio".
class MainTabsScreen extends StatefulWidget {
  const MainTabsScreen({super.key});

  @override
  State<MainTabsScreen> createState() => _MainTabsScreenState();
}

class _MainTabsScreenState extends State<MainTabsScreen> {
  static const _pantallas = [
    InicioScreen(),
    AlmacenScreen(),
  ];

  @override
  void initState() {
    super.initState();
    NotificacionesService.requerimientoTocado.addListener(_abrirRequerimientoTocado);
    // Si la app se abrió justamente tocando la notificación, ya viene
    // anotado cuál requerimiento mostrar.
    WidgetsBinding.instance.addPostFrameCallback((_) => _abrirRequerimientoTocado());
  }

  @override
  void dispose() {
    NotificacionesService.requerimientoTocado.removeListener(_abrirRequerimientoTocado);
    super.dispose();
  }

  void _abrirRequerimientoTocado() {
    final id = NotificacionesService.requerimientoTocado.value;
    if (id == null || !mounted) return;
    NotificacionesService.requerimientoTocado.value = null;
    context.read<NavegacionState>().irA(TabsApp.almacen);
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => RequerimientoDetalleScreen(id: id)));
  }

  @override
  Widget build(BuildContext context) {
    final porAprobar = context.watch<AlmacenState>().pendientesAprobacion.length;
    final indice = context.watch<NavegacionState>().indice;
    final colorInactivo = Theme.of(context).colorScheme.onSurfaceVariant;

    return Scaffold(
      body: IndexedStack(index: indice, children: _pantallas),
      bottomNavigationBar: NavigationBar(
        selectedIndex: indice,
        onDestinationSelected: (i) => context.read<NavegacionState>().irA(i),
        destinations: [
          NavigationDestination(
            icon: BrandIcon('home_add.svg', color: colorInactivo),
            selectedIcon: const BrandIcon('home_add.svg', color: Colors.white),
            label: 'Inicio',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: porAprobar > 0,
              label: Text('$porAprobar'),
              child: Icon(Icons.warehouse_outlined, color: colorInactivo),
            ),
            selectedIcon: const Icon(Icons.warehouse, color: Colors.white),
            label: 'Almacén',
          ),
        ],
      ),
    );
  }
}
