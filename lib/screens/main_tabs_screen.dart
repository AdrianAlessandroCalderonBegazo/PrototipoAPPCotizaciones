import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/cotizacion_state.dart';
import 'cotizacion_screen.dart';
import 'historial_screen.dart';
import 'productos_screen.dart';

/// Barra de navegación de abajo con las tres pestañas de la app. Usa
/// IndexedStack para que cada pestaña conserve su estado (lo que escribiste
/// en el formulario, qué categorías tenías desplegadas) al cambiar de una
/// a otra.
class MainTabsScreen extends StatefulWidget {
  const MainTabsScreen({super.key});

  @override
  State<MainTabsScreen> createState() => _MainTabsScreenState();
}

class _MainTabsScreenState extends State<MainTabsScreen> {
  int _indice = 0;

  late final List<Widget> _pantallas = [
    ProductosScreen(onVerCotizacion: () => setState(() => _indice = 1)),
    const CotizacionScreen(),
    HistorialScreen(
      onIrAProductos: () => setState(() => _indice = 0),
      onNuevaCotizacion: _iniciarNuevaCotizacion,
    ),
  ];

  Future<void> _iniciarNuevaCotizacion() async {
    final cotizacion = context.read<CotizacionState>();
    if (cotizacion.totalItems > 0) {
      final confirmar = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('¿Empezar una cotización nueva?'),
          content: const Text('Se vaciará la cotización que tienes armada ahora.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Empezar nueva'),
            ),
          ],
        ),
      );
      if (confirmar != true) return;
      cotizacion.limpiar();
    }
    if (mounted) setState(() => _indice = 1);
  }

  @override
  Widget build(BuildContext context) {
    final totalItems = context.watch<CotizacionState>().totalItems;

    return Scaffold(
      body: IndexedStack(index: _indice, children: _pantallas),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _indice,
        onDestinationSelected: (i) => setState(() => _indice = i),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.inventory_2_outlined),
            selectedIcon: Icon(Icons.inventory_2),
            label: 'Productos',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: totalItems > 0,
              label: Text('$totalItems'),
              child: const Icon(Icons.request_quote_outlined),
            ),
            selectedIcon: const Icon(Icons.request_quote),
            label: 'Cotización',
          ),
          const NavigationDestination(
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history),
            label: 'Historial',
          ),
        ],
      ),
    );
  }
}
