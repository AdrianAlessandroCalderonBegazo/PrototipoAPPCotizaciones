import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import 'package:provider/provider.dart';
import '../models/producto.dart';
import '../state/checklist_state.dart';
import '../theme/brand_colors.dart';
import '../utils/checklist_estilo.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/brand_app_bar_title.dart';
import '../widgets/buscador_productos.dart';
import '../widgets/fade_slide_in.dart';
import 'checklist_resumen_screen.dart';

/// Pestaña "Checklist": recorrido obligatorio categoría por categoría (10
/// en total, tomadas del Excel real de la empresa) para que antes de salir
/// a obra no se quede nada por olvidar. Se puede retroceder libremente a
/// una categoría ya vista, pero avanzar es siempre de una en una.
class ChecklistScreen extends StatefulWidget {
  const ChecklistScreen({super.key});

  @override
  State<ChecklistScreen> createState() => _ChecklistScreenState();
}

class _ChecklistScreenState extends State<ChecklistScreen> {
  bool _mostrarPanel = false;

  @override
  void initState() {
    super.initState();
    context.read<ChecklistState>().cargar();
  }

  Future<void> _finalizar(ChecklistState checklist) async {
    await showGeneralDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 250),
      pageBuilder: (_, __, ___) => const _OverlayCompletado(),
      transitionBuilder: (_, animation, __, child) =>
          FadeTransition(opacity: animation, child: child),
    );
    if (!mounted) return;
    setState(() => _mostrarPanel = false);
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const ChecklistResumenScreen()),
    );
  }

  Future<void> _buscarProducto(ChecklistState checklist) async {
    final producto = await showModalBottomSheet<Producto>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const BuscadorProductos(titulo: 'Buscar en el catálogo'),
    );
    if (producto != null) checklist.agregarExtra(producto.nombre, esProducto: true);
  }

  @override
  Widget build(BuildContext context) {
    final checklist = context.watch<ChecklistState>();

    if (checklist.cargando) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (checklist.error != null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(checklist.error!, textAlign: TextAlign.center),
          ),
        ),
      );
    }

    final categoria = checklist.categoriaActual;
    final estilo = estiloDeCategoriaChecklist(checklist.indice);
    final itemsBase = <MapEntry<int, ChecklistItemEntry>>[];
    final itemsExtra = <MapEntry<int, ChecklistItemEntry>>[];
    for (var i = 0; i < categoria.items.length; i++) {
      final item = categoria.items[i];
      (item.esExtra ? itemsExtra : itemsBase).add(MapEntry(i, item));
    }

    return Scaffold(
      appBar: AppBar(
        leading: checklist.esPrimeraCategoria
            ? null
            : IconButton(
                icon: const Icon(Icons.arrow_back),
                tooltip: 'Categoría anterior',
                onPressed: checklist.retroceder,
              ),
        title: const BrandAppBarTitle(subtitulo: 'Checklist de obra'),
      ),
      body: Column(
        children: [
          _BarraProgreso(
            total: checklist.categorias.length,
            actual: checklist.indice,
            onTap: checklist.irACategoria,
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                Row(
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        color: estilo.color.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(estilo.icono, color: estilo.color, size: 26),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            quitarNumeroCategoria(categoria.nombre),
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                              color: BrandColors.azulMarino,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${categoria.totalMarcados} de ${categoria.items.length} ítems marcados',
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context).colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                ...itemsBase.asMap().entries.map((e) {
                  final posicion = e.key;
                  final entry = e.value;
                  return FadeSlideIn(
                    index: posicion,
                    child: _FilaItemChecklist(
                      item: entry.value,
                      onTap: () => checklist.toggleItem(entry.key),
                    ),
                  );
                }),
                const SizedBox(height: 14),
                AnimatedPressable(
                  onTap: () => setState(() => _mostrarPanel = !_mostrarPanel),
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: BrandColors.azulOscuro.withValues(alpha: 0.4),
                        width: 1.4,
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          _mostrarPanel ? Icons.expand_less : Icons.add_circle_outline,
                          size: 18,
                          color: BrandColors.azulOscuro,
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'Añadir observación / ítem a esta categoría',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: BrandColors.azulOscuro,
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (_mostrarPanel) ...[
                  const SizedBox(height: 12),
                  _PanelOlvidasteAlgo(
                    extras: itemsExtra,
                    onAgregarTexto: checklist.agregarExtra,
                    onAgregarProducto: () => _buscarProducto(checklist),
                    onQuitar: checklist.quitarExtra,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: _BarraAvanzar(
        esUltima: checklist.esUltimaCategoria,
        siguienteNombre: checklist.esUltimaCategoria
            ? null
            : quitarNumeroCategoria(checklist.categorias[checklist.indice + 1].nombre),
        onTap: () {
          if (checklist.esUltimaCategoria) {
            _finalizar(checklist);
          } else {
            checklist.avanzar();
          }
        },
      ),
    );
  }
}

class _BarraProgreso extends StatelessWidget {
  final int total;
  final int actual;
  final ValueChanged<int> onTap;

  const _BarraProgreso({required this.total, required this.actual, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: List.generate(total, (i) {
              final alcanzado = i <= actual;
              return Expanded(
                child: GestureDetector(
                  onTap: alcanzado ? () => onTap(i) : null,
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    height: 5,
                    decoration: BoxDecoration(
                      color: i == actual
                          ? BrandColors.cian
                          : alcanzado
                              ? BrandColors.cian.withValues(alpha: 0.4)
                              : colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 6),
          Text(
            'Categoría ${actual + 1} de $total',
            style: TextStyle(
              fontSize: 11,
              color: colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _FilaItemChecklist extends StatelessWidget {
  final ChecklistItemEntry item;
  final VoidCallback onTap;

  const _FilaItemChecklist({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return AnimatedPressable(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: colorScheme.outlineVariant.withValues(alpha: 0.6)),
          ),
        ),
        child: Row(
          children: [
            _Casillero(marcado: item.marcado),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                item.texto,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: item.marcado ? BrandColors.azulMarino : colorScheme.onSurface,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Casillero extends StatelessWidget {
  final bool marcado;
  const _Casillero({required this.marcado});

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
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
    );
  }
}

/// El bloque "¿Te olvidaste de algo?": notas libres o productos del
/// catálogo, agregados como ítems adicionales de la categoría actual.
class _PanelOlvidasteAlgo extends StatefulWidget {
  final List<MapEntry<int, ChecklistItemEntry>> extras;
  final void Function(String texto) onAgregarTexto;
  final VoidCallback onAgregarProducto;
  final void Function(int realIndex) onQuitar;

  const _PanelOlvidasteAlgo({
    required this.extras,
    required this.onAgregarTexto,
    required this.onAgregarProducto,
    required this.onQuitar,
  });

  @override
  State<_PanelOlvidasteAlgo> createState() => _PanelOlvidasteAlgoState();
}

class _PanelOlvidasteAlgoState extends State<_PanelOlvidasteAlgo> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _agregar() {
    if (_controller.text.trim().isEmpty) return;
    widget.onAgregarTexto(_controller.text);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: BrandColors.cian.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: BrandColors.cian.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: BrandColors.cian.withValues(alpha: 0.18),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.lightbulb_outline, size: 16, color: BrandColors.cian),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  '¿Te olvidaste de algo? Agrégalo aquí',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: BrandColors.azulMarino,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Añade herramientas, materiales o notas de último momento para esta categoría.',
            style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
          if (widget.extras.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: widget.extras.map((e) => _chipExtra(e.key, e.value)).toList(),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  onSubmitted: (_) => _agregar(),
                  decoration: InputDecoration(
                    hintText: 'Escribir ítem omitido o nota rápida',
                    filled: true,
                    fillColor: Colors.white,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              AnimatedPressable(
                onTap: _agregar,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                  decoration: BoxDecoration(
                    color: BrandColors.azulMarino,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.add, size: 16, color: Colors.white),
                      SizedBox(width: 4),
                      Text(
                        'Agregar',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            'AGREGAR DESDE EL CATÁLOGO',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 8),
          AnimatedPressable(
            onTap: widget.onAgregarProducto,
            borderRadius: BorderRadius.circular(20),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: BrandColors.cian.withValues(alpha: 0.5)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.search, size: 15, color: BrandColors.cian),
                  SizedBox(width: 6),
                  Text(
                    'Buscar en el catálogo',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: BrandColors.azulMarino),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _chipExtra(int realIndex, ChecklistItemEntry item) {
    return Container(
      padding: const EdgeInsets.only(left: 10, right: 4, top: 4, bottom: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: BrandColors.cian.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            item.esProducto ? Icons.inventory_2_outlined : Icons.edit_note_outlined,
            size: 14,
            color: BrandColors.cian,
          ),
          const SizedBox(width: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 180),
            child: Text(
              item.texto,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => widget.onQuitar(realIndex),
            child: const Padding(
              padding: EdgeInsets.all(4),
              child: Icon(Icons.close, size: 14, color: Colors.black45),
            ),
          ),
        ],
      ),
    );
  }
}

/// Barra inferior de la pantalla, en dos tonos: la acción de avanzar y,
/// aparte, el nombre de la categoría que sigue (o "Finalizar" si es la
/// última) — para que quede claro qué viene después sin adivinar.
class _BarraAvanzar extends StatelessWidget {
  final bool esUltima;
  final String? siguienteNombre;
  final VoidCallback onTap;

  const _BarraAvanzar({required this.esUltima, required this.siguienteNombre, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: AnimatedPressable(
        onTap: onTap,
        borderRadius: BorderRadius.circular(28),
        child: Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.15),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(28),
            child: Row(
              children: [
                Expanded(
                  flex: esUltima ? 1 : 3,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    color: BrandColors.cian,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          esUltima ? Icons.task_alt : Icons.arrow_forward,
                          color: Colors.white,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          esUltima ? 'Finalizar y Ver Resumen' : 'Pasar a Siguiente Categoría',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (!esUltima)
                  Expanded(
                    flex: 2,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
                      color: BrandColors.azulOscuro,
                      child: Text(
                        siguienteNombre ?? '',
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Overlay de transición al terminar la última categoría: difumina lo que
/// ya había en pantalla y reproduce el check hasta su fin natural, antes
/// de pasar al resumen final.
class _OverlayCompletado extends StatefulWidget {
  const _OverlayCompletado();

  @override
  State<_OverlayCompletado> createState() => _OverlayCompletadoState();
}

class _OverlayCompletadoState extends State<_OverlayCompletado>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
      child: Container(
        color: BrandColors.azulMarino.withValues(alpha: 0.4),
        child: Center(
          child: Lottie.asset(
            'assets/animations/checkmark.lottie',
            controller: _controller,
            onLoaded: (composicion) {
              _controller.duration = composicion.duration;
              _controller.forward().whenComplete(() {
                if (mounted) Navigator.of(context).pop();
              });
            },
            width: 180,
            height: 180,
            repeat: false,
          ),
        ),
      ),
    );
  }
}
