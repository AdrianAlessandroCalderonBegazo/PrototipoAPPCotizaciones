import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/producto.dart';
import '../services/db_helper.dart';
import '../state/cotizacion_state.dart';
import '../widgets/brand_app_bar_title.dart';
import '../widgets/producto_thumbnail.dart';
import 'config_screen.dart';

/// Pestaña "Productos": lista de categorías tipo acordeón — al presionar
/// una categoría, se despliegan sus productos con checkbox justo debajo,
/// sin navegar a otra pantalla. La lupa busca tanto por nombre de
/// categoría como por nombre/referencia de producto.
class ProductosScreen extends StatefulWidget {
  const ProductosScreen({super.key});

  @override
  State<ProductosScreen> createState() => _ProductosScreenState();
}

class _ProductosScreenState extends State<ProductosScreen> {
  Map<String, List<Producto>> _porCategoria = {};
  bool _cargando = true;
  bool _buscando = false;
  String _busqueda = '';
  final _busquedaController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  @override
  void dispose() {
    _busquedaController.dispose();
    super.dispose();
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

  void _alternarBusqueda() {
    setState(() {
      _buscando = !_buscando;
      if (!_buscando) {
        _busqueda = '';
        _busquedaController.clear();
      }
    });
  }

  Map<String, List<Producto>> get _filtrado {
    final query = _busqueda.trim().toLowerCase();
    if (query.isEmpty) return _porCategoria;

    final resultado = <String, List<Producto>>{};
    for (final entry in _porCategoria.entries) {
      final categoriaCoincide = entry.key.toLowerCase().contains(query);
      final productos = categoriaCoincide
          ? entry.value
          : entry.value
              .where(
                (p) =>
                    p.nombre.toLowerCase().contains(query) ||
                    (p.referenciaInterna ?? '').toLowerCase().contains(query),
              )
              .toList();
      if (productos.isNotEmpty) {
        resultado[entry.key] = productos;
      }
    }
    return resultado;
  }

  @override
  Widget build(BuildContext context) {
    final cotizacion = context.watch<CotizacionState>();
    final activo = _busqueda.trim().isNotEmpty;
    final categoriasFiltradas = _filtrado;
    final categorias = categoriasFiltradas.keys.toList();

    return Scaffold(
      appBar: AppBar(
        title: _buscando
            ? TextField(
                controller: _busquedaController,
                autofocus: true,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  hintText: 'Buscar categoría o producto...',
                  hintStyle: TextStyle(color: Colors.white70),
                  border: InputBorder.none,
                ),
                onChanged: (v) => setState(() => _busqueda = v),
              )
            : const BrandAppBarTitle(subtitulo: 'Catálogo de productos'),
        actions: [
          IconButton(
            icon: Icon(_buscando ? Icons.close : Icons.search),
            tooltip: _buscando ? 'Cerrar búsqueda' : 'Buscar',
            onPressed: _alternarBusqueda,
          ),
          if (!_buscando)
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
              ? Center(
                  child: Text(
                    activo
                        ? 'No se encontró nada para "$_busqueda".'
                        : 'No hay productos cargados todavía.',
                    textAlign: TextAlign.center,
                  ),
                )
              : ListView.builder(
                  itemCount: categorias.length,
                  itemBuilder: (context, index) {
                    final categoria = categorias[index];
                    final productos = categoriasFiltradas[categoria]!;
                    return _CategoriaExpandible(
                      key: ValueKey('$categoria|$activo'),
                      categoria: categoria,
                      productos: productos,
                      cotizacion: cotizacion,
                      expandidaInicial: activo,
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
  final bool expandidaInicial;

  const _CategoriaExpandible({
    super.key,
    required this.categoria,
    required this.productos,
    required this.cotizacion,
    this.expandidaInicial = false,
  });

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      initiallyExpanded: expandidaInicial,
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
