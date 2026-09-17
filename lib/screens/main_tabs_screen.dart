import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/checklist_state.dart';
import '../state/cotizacion_state.dart';
import '../state/navegacion_state.dart';
import 'chat_screen.dart';
import 'checklist_screen.dart';
import 'historial_screen.dart';
import 'home_screen.dart';
import 'productos_screen.dart';

/// Barra de navegación de abajo con las cinco pestañas de la app. Usa
/// IndexedStack para que cada pestaña conserve su estado (lo que
/// escribiste, qué categorías tenías desplegadas, en qué categoría del
/// checklist ibas) al cambiar de una a otra. El índice activo vive en
/// NavegacionState (no como estado local) para que una pantalla empujada
/// en profundidad — como la confirmación al crear una cotización o
/// guardar un checklist — pueda pedir "volver al inicio" sin necesitar un
/// callback pasado a mano por cada nivel de navegación.
class MainTabsScreen extends StatefulWidget {
  const MainTabsScreen({super.key});

  @override
  State<MainTabsScreen> createState() => _MainTabsScreenState();
}

class _MainTabsScreenState extends State<MainTabsScreen> {
  late final List<Widget> _pantallas = [
    HistorialScreen(
      onIrAProductos: () => context.read<NavegacionState>().irA(TabsApp.cotizar),
      onNuevaCotizacion: _iniciarNuevaCotizacion,
      onNuevoChecklist: _iniciarNuevoChecklist,
    ),
    const ProductosScreen(),
    const HomeScreen(),
    const ChecklistScreen(),
    const ChatScreen(),
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
    if (mounted) context.read<NavegacionState>().irA(TabsApp.cotizar);
  }

  Future<void> _iniciarNuevoChecklist() async {
    final checklist = context.read<ChecklistState>();
    if (checklist.tieneProgreso) {
      final confirmar = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('¿Empezar un checklist nuevo?'),
          content: const Text('Se perderá el progreso del checklist que tienes a medias ahora.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Empezar nuevo'),
            ),
          ],
        ),
      );
      if (confirmar != true) return;
      await checklist.reiniciar();
    }
    if (mounted) context.read<NavegacionState>().irA(TabsApp.checklist);
  }

  @override
  Widget build(BuildContext context) {
    final totalItems = context.watch<CotizacionState>().totalItems;
    final indice = context.watch<NavegacionState>().indice;

    return Scaffold(
      body: IndexedStack(index: indice, children: _pantallas),
      bottomNavigationBar: NavigationBar(
        selectedIndex: indice,
        onDestinationSelected: (i) => context.read<NavegacionState>().irA(i),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history),
            label: 'Historial',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: totalItems > 0,
              label: Text('$totalItems'),
              child: const Icon(Icons.request_quote_outlined),
            ),
            selectedIcon: const Icon(Icons.request_quote),
            label: 'Cotizar',
          ),
          const NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          const NavigationDestination(
            icon: Icon(Icons.checklist_outlined),
            selectedIcon: Icon(Icons.checklist),
            label: 'Checklist',
          ),
          const NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Chat',
          ),
        ],
      ),
    );
  }
}
