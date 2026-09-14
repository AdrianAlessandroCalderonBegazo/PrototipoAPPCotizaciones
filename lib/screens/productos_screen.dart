import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/producto.dart';
import '../services/db_helper.dart';
import '../state/cotizacion_state.dart';
import '../theme/brand_colors.dart';
import '../utils/categoria_estilo.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/brand_app_bar_title.dart';
import '../widgets/producto_thumbnail.dart';
import 'config_screen.dart';

/// Pestaña "Productos": lista de categorías tipo acordeón — al presionar
/// una categoría, se despliegan sus productos con checkbox justo debajo,
/// sin navegar a otra pantalla. La búsqueda filtra tanto por nombre de
/// categoría como por nombre/referencia de producto.
class ProductosScreen extends StatefulWidget {
  final VoidCallback? onVerCotizacion;

  const ProductosScreen({super.key, this.onVerCotizacion});

  @override
  State<ProductosScreen> createState() => _ProductosScreenState();
}

class _ProductosScreenState extends State<ProductosScreen> {
  Map<String, List<Producto>> _porCategoria = {};
  bool _cargando = true;
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
        title: const BrandAppBarTitle(subtitulo: 'Catálogo de productos'),
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
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _busquedaController,
              decoration: InputDecoration(
                hintText: 'Buscar por nombre o categoría...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: activo
                    ? IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => setState(() {
                          _busqueda = '';
                          _busquedaController.clear();
                        }),
                      )
                    : null,
                filled: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
              ),
              onChanged: (v) => setState(() => _busqueda = v),
            ),
          ),
          Expanded(
            child: _cargando
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
                        padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
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
          ),
        ],
      ),
      bottomNavigationBar: cotizacion.totalItems > 0
          ? _ResumenParcialBar(cotizacion: cotizacion, onTap: widget.onVerCotizacion)
          : null,
    );
  }
}

class _ResumenParcialBar extends StatelessWidget {
  final CotizacionState cotizacion;
  final VoidCallback? onTap;

  const _ResumenParcialBar({required this.cotizacion, this.onTap});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: AnimatedPressable(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          decoration: BoxDecoration(
            color: BrandColors.azulMarino,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.18),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.shopping_cart, color: BrandColors.cian, size: 20),
                  const SizedBox(width: 10),
                  Text(
                    'Resumen parcial (${cotizacion.totalItems} items)',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  Text(
                    'S/ ${cotizacion.totalGeneral.toStringAsFixed(2)}',
                    style: const TextStyle(
                      color: BrandColors.cian,
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_right, color: Colors.white70, size: 18),
                ],
              ),
            ],
          ),
        ),
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
    final estilo = estiloDeCategoria(categoria);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: expandidaInicial,
          tilePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          leading: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: estilo.color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(estilo.icono, color: estilo.color),
          ),
          title: Text(categoria, style: const TextStyle(fontWeight: FontWeight.bold)),
          subtitle: Text('${productos.length} productos'),
          children: productos.map((p) => _FilaProducto(producto: p, cotizacion: cotizacion)).toList(),
        ),
      ),
    );
  }
}

class _FilaProducto extends StatelessWidget {
  final Producto producto;
  final CotizacionState cotizacion;

  const _FilaProducto({required this.producto, required this.cotizacion});

  @override
  Widget build(BuildContext context) {
    final seleccionado = cotizacion.estaEnCotizacion(producto);
    final cantidad = cotizacion.cantidadDe(producto);
    final precio = producto.precioVenta ?? 0;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: seleccionado
            ? BrandColors.cian.withValues(alpha: 0.06)
            : Colors.transparent,
        border: const Border(top: BorderSide(color: Color(0x14000000))),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ProductoThumbnail(archivoImagen: producto.archivoImagen, size: 52),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  producto.nombre,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    if ((producto.referenciaInterna ?? '').isNotEmpty)
                      'SKU: ${producto.referenciaInterna}',
                    'Unit: S/ ${precio.toStringAsFixed(2)}',
                  ].join(' · '),
                  style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          seleccionado
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _botonStepper(
                          Icons.remove,
                          () => cotizacion.setCantidad(producto, cantidad - 1),
                        ),
                        SizedBox(
                          width: 22,
                          child: Text(
                            '$cantidad',
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ),
                        _botonStepper(
                          Icons.add,
                          () => cotizacion.setCantidad(producto, cantidad + 1),
                        ),
                      ],
                    ),
                    Text(
                      'S/ ${(precio * cantidad).toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                        color: BrandColors.azulMarino,
                      ),
                    ),
                  ],
                )
              : AnimatedPressable(
                  onTap: () => cotizacion.toggle(producto),
                  borderRadius: BorderRadius.circular(20),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: BrandColors.cian,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.add, size: 16, color: Colors.white),
                        SizedBox(width: 4),
                        Text(
                          'Añadir',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
        ],
      ),
    );
  }

  Widget _botonStepper(IconData icono, VoidCallback onTap) {
    return AnimatedPressable(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          color: BrandColors.azulMarino.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Icon(icono, size: 15, color: BrandColors.azulMarino),
      ),
    );
  }
}
