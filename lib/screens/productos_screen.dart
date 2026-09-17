import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../models/producto.dart';
import '../services/db_helper.dart';
import '../state/cotizacion_state.dart';
import '../theme/app_text_styles.dart';
import '../theme/brand_colors.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/producto_thumbnail.dart';
import 'config_screen.dart';
import 'generar_cotizacion_screen.dart';

/// Pestaña "Cotizar": categorías como píldoras horizontales — al tocar una
/// se muestran sus productos, cada uno con un casillero (como en el
/// checklist) que al marcarlo revela un stepper de cantidad. La búsqueda
/// filtra tanto por nombre de categoría como por nombre/referencia de
/// producto. Al elegir productos, "Generar cotización" empuja el
/// formulario final.
class ProductosScreen extends StatefulWidget {
  const ProductosScreen({super.key});

  @override
  State<ProductosScreen> createState() => _ProductosScreenState();
}

class _ProductosScreenState extends State<ProductosScreen> {
  Map<String, List<Producto>> _porCategoria = {};
  bool _cargando = true;
  String _busqueda = '';
  final _busquedaController = TextEditingController();
  String? _categoriaActiva;

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

  Widget _encabezado(BuildContext context) {
    final activo = _busqueda.trim().isNotEmpty;
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: BrandColors.cian,
        borderRadius: BorderRadius.only(bottomLeft: Radius.circular(28), bottomRight: Radius.circular(28)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 8, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('COTIZACIONES', style: AppTextStyles.etiqueta.copyWith(color: Colors.white70)),
                        const SizedBox(height: 4),
                        Text(
                          'Selecciona productos',
                          style: AppTextStyles.titulo.copyWith(color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.sync, color: Colors.white),
                    tooltip: 'Sincronizar / configurar',
                    onPressed: () async {
                      await Navigator.push(context, MaterialPageRoute(builder: (_) => const ConfigScreen()));
                      _cargar();
                    },
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _busquedaController,
                onChanged: (v) => setState(() => _busqueda = v),
                style: const TextStyle(color: Colors.white, fontSize: 14),
                cursorColor: Colors.white,
                decoration: InputDecoration(
                  hintText: 'Buscar producto',
                  hintStyle: const TextStyle(color: Colors.white70),
                  prefixIcon: const Icon(Icons.search, size: 20, color: Colors.white70),
                  suffixIcon: activo
                      ? IconButton(
                          icon: const Icon(Icons.clear, size: 18, color: Colors.white70),
                          onPressed: () => setState(() {
                            _busqueda = '';
                            _busquedaController.clear();
                          }),
                        )
                      : null,
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: 0.15),
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cotizacion = context.watch<CotizacionState>();
    final activoBusqueda = _busqueda.trim().isNotEmpty;
    final categoriasFiltradas = _filtrado;
    final categorias = categoriasFiltradas.keys.toList();
    final categoriaActiva =
        categoriasFiltradas.containsKey(_categoriaActiva) ? _categoriaActiva : (categorias.isNotEmpty ? categorias.first : null);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: Column(
          children: [
            _encabezado(context),
            if (!_cargando && categorias.isNotEmpty)
              _FilaCategorias(
                categorias: categorias,
                activa: categoriaActiva,
                onSeleccionar: (c) => setState(() => _categoriaActiva = c),
              ),
            Expanded(
              child: _cargando
                  ? const Center(child: CircularProgressIndicator())
                  : categorias.isEmpty || categoriaActiva == null
                      ? Center(
                          child: Text(
                            activoBusqueda
                                ? 'No se encontró nada para "$_busqueda".'
                                : 'No hay productos cargados todavía.',
                            textAlign: TextAlign.center,
                          ),
                        )
                      : _ListaProductosCategoria(
                          key: ValueKey(categoriaActiva),
                          categoria: categoriaActiva,
                          productos: categoriasFiltradas[categoriaActiva]!,
                          cotizacion: cotizacion,
                        ),
            ),
          ],
        ),
        bottomNavigationBar: cotizacion.items.isNotEmpty
            ? _BarraResumen(
                cotizacion: cotizacion,
                onGenerar: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const GenerarCotizacionScreen()),
                ),
              )
            : null,
      ),
    );
  }
}

/// Píldoras horizontales de categoría — reemplazan el acordeón: solo se
/// ven los productos de la categoría activa, más liviano con 40 categorías
/// reales en el catálogo.
class _FilaCategorias extends StatelessWidget {
  final List<String> categorias;
  final String? activa;
  final ValueChanged<String> onSeleccionar;

  const _FilaCategorias({required this.categorias, required this.activa, required this.onSeleccionar});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        itemCount: categorias.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final categoria = categorias[index];
          final esActiva = categoria == activa;
          return AnimatedPressable(
            onTap: () => onSeleccionar(categoria),
            borderRadius: BorderRadius.circular(20),
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: esActiva ? BrandColors.azulMarino : Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: esActiva ? null : Border.all(color: Theme.of(context).colorScheme.outlineVariant),
              ),
              child: Text(
                categoria,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.bold,
                  color: esActiva ? Colors.white : BrandColors.azulMarino,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ListaProductosCategoria extends StatelessWidget {
  final String categoria;
  final List<Producto> productos;
  final CotizacionState cotizacion;

  const _ListaProductosCategoria({
    super.key,
    required this.categoria,
    required this.productos,
    required this.cotizacion,
  });

  @override
  Widget build(BuildContext context) {
    final seleccionados = productos.where(cotizacion.estaEnCotizacion).length;

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      itemCount: productos.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    categoria,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: BrandColors.azulMarino),
                  ),
                ),
                if (seleccionados > 0)
                  Text(
                    '$seleccionados sel.',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: BrandColors.cian),
                  ),
              ],
            ),
          );
        }
        return _FilaProducto(producto: productos[index - 1], cotizacion: cotizacion);
      },
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
    final unidad = (producto.unidadMedida ?? '').trim();

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.6))),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _CasilleroProducto(marcado: seleccionado, onTap: () => cotizacion.toggle(producto)),
          const SizedBox(width: 10),
          ProductoThumbnail(archivoImagen: producto.archivoImagen, size: 44),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  producto.nombre,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTextStyles.cuerpo,
                ),
                const SizedBox(height: 2),
                Text(
                  unidad.isEmpty ? 'S/ ${precio.toStringAsFixed(2)}' : 'S/ ${precio.toStringAsFixed(2)} · $unidad',
                  style: AppTextStyles.apoyo,
                ),
              ],
            ),
          ),
          if (seleccionado) ...[
            const SizedBox(width: 6),
            _botonStepper(Icons.remove, () => cotizacion.setCantidad(producto, cantidad - 1)),
            SizedBox(
              width: 26,
              child: Text(
                '$cantidad',
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              ),
            ),
            _botonStepper(Icons.add, () => cotizacion.setCantidad(producto, cantidad + 1)),
          ],
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

/// Casillero de selección — mismo lenguaje visual que el del checklist
/// (cuadrado redondeado, se rellena de cian con un check al marcarlo).
class _CasilleroProducto extends StatelessWidget {
  final bool marcado;
  final VoidCallback onTap;

  const _CasilleroProducto({required this.marcado, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AnimatedPressable(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        width: 24,
        height: 24,
        decoration: BoxDecoration(
          color: marcado ? BrandColors.cian : Colors.transparent,
          borderRadius: BorderRadius.circular(7),
          border: Border.all(
            color: marcado ? BrandColors.cian : Theme.of(context).colorScheme.outline,
            width: 1.6,
          ),
        ),
        child: marcado ? const Icon(Icons.check, size: 16, color: Colors.white) : null,
      ),
    );
  }
}

/// Barra inferior: resumen de cuántos productos distintos hay elegidos y
/// el subtotal, más el botón para pasar al formulario final.
class _BarraResumen extends StatelessWidget {
  final CotizacionState cotizacion;
  final VoidCallback onGenerar;

  const _BarraResumen({required this.cotizacion, required this.onGenerar});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          border: Border(top: BorderSide(color: colorScheme.outlineVariant)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${cotizacion.items.length} productos · subtotal',
                  style: AppTextStyles.apoyo.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  'S/ ${cotizacion.totalGeneral.toStringAsFixed(2)}',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: BrandColors.azulMarino),
                ),
              ],
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: onGenerar,
                style: FilledButton.styleFrom(
                  backgroundColor: BrandColors.azulMarino,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  shape: const StadiumBorder(),
                ),
                child: const Text('GENERAR COTIZACIÓN', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.6)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
