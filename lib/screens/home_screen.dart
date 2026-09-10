import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/db_helper.dart';
import '../state/cotizacion_state.dart';
import 'categoria_screen.dart';
import 'config_screen.dart';
import 'cotizacion_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<String> _categorias = [];
  final Map<String, int> _conteo = {};
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    final categorias = await DbHelper.instance.getCategorias();
    for (final c in categorias) {
      final productos = await DbHelper.instance.getProductosPorCategoria(c);
      _conteo[c] = productos.length;
    }
    if (!mounted) return;
    setState(() {
      _categorias = categorias;
      _cargando = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final cotizacion = context.watch<CotizacionState>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Categorías'),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'Sincronizar / configurar',
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ConfigScreen()),
              );
              _cargar();
            },
          ),
        ],
      ),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : _categorias.isEmpty
              ? const Center(child: Text('No hay productos cargados todavía.'))
              : ListView.separated(
                  itemCount: _categorias.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final cat = _categorias[index];
                    return ListTile(
                      title: Text(cat),
                      subtitle: Text('${_conteo[cat] ?? 0} productos'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => CategoriaScreen(categoria: cat),
                        ),
                      ),
                    );
                  },
                ),
      floatingActionButton: cotizacion.totalItems > 0
          ? FloatingActionButton.extended(
              icon: const Icon(Icons.request_quote),
              label: Text('Cotización (${cotizacion.totalItems})'),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const CotizacionScreen()),
              ),
            )
          : null,
    );
  }
}
