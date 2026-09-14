import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/producto.dart';
import '../services/db_helper.dart';
import '../state/cotizacion_state.dart';
import '../widgets/producto_thumbnail.dart';
import 'config_screen.dart';

/// Pestaña "Productos": lista de categorías tipo acordeón — al presionar
/// una categoría, se despliegan sus productos con checkbox justo debajo,
/// sin navegar a otra pantalla.
class ProductosScreen extends StatefulWidget {
  const ProductosScreen({super.key});

  @override
  State<ProductosScreen> createState() => _ProductosScreenState();
}

class _ProductosScreenState extends State<ProductosScreen> {
  Map<String, List<Producto>> _porCategoria = {};
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    final agrupado = await DbHelper.instance.getTodosAgrupados();
    if (!mounted) return;
    setState(() {
      _porCategoria = agrupado;
      _cargando = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final cotizacion = context.watch<CotizacionState>();
    final categorias = _porCategoria.keys.toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Productos'),
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
          : categorias.isEmpty
              ? const Center(child: Text('No hay productos cargados todavía.'))
              : ListView.builder(
                  itemCount: categorias.length,
                  itemBuilder: (context, index) {
                    final categoria = categorias[index];
                    final productos = _porCategoria[categoria]!;
                    return _CategoriaExpandible(
                      categoria: categoria,
                      productos: productos,
                      cotizacion: cotizacion,
                    );
                  },
                ),
    );
  }
}

class _CategoriaExpandible extends StatelessWidget {
  final String categoria;
  final List<Producto> productos;
  final CotizacionState cotizacion;

  const _CategoriaExpandible({
    required this.categoria,
    required this.productos,
    required this.cotizacion,
  });

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      title: Text(categoria),
      subtitle: Text('${productos.length} productos'),
      children: productos.map((p) => _filaProducto(context, p)).toList(),
    );
  }

  Widget _filaProducto(BuildContext context, Producto p) {
    final seleccionado = cotizacion.estaEnCotizacion(p);
    final cantidad = cotizacion.cantidadDe(p);

    return CheckboxListTile(
      value: seleccionado,
      onChanged: (_) => cotizacion.toggle(p),
      title: Text(p.nombre),
      subtitle: Text(
        [
          if ((p.referenciaInterna ?? '').isNotEmpty) p.referenciaInterna!,
          if (p.precioVenta != null) 'S/ ${p.precioVenta!.toStringAsFixed(2)}',
        ].join(' · '),
      ),
      secondary: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ProductoThumbnail(archivoImagen: p.archivoImagen),
          if (seleccionado) ...[
            IconButton(
              icon: const Icon(Icons.remove_circle_outline),
              onPressed: () => cotizacion.setCantidad(p, cantidad - 1),
            ),
            Text('$cantidad'),
            IconButton(
              icon: const Icon(Icons.add_circle_outline),
              onPressed: () => cotizacion.setCantidad(p, cantidad + 1),
            ),
          ],
        ],
      ),
    );
  }
}
