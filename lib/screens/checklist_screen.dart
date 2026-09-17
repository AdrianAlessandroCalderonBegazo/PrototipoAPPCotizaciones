import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import 'package:provider/provider.dart';
import '../state/checklist_state.dart';
import '../theme/brand_colors.dart';
import '../utils/checklist_estilo.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/brand_app_bar_title.dart';
import '../widgets/fade_slide_in.dart';
import 'checklist_resumen_screen.dart';

/// Pestaña "Checklist": recorrido obligatorio categoría por categoría (10
/// en total, tomadas del Excel real de la empresa) para que antes de salir
/// a obra no se quede nada por olvidar. Se puede retroceder libremente a
/// una categoría ya vista, pero avanzar es siempre de una en una. Agregar
/// o quitar ítems se hace en el resumen final, donde se ven las 10 juntas.
class ChecklistScreen extends StatefulWidget {
  const ChecklistScreen({super.key});

  @override
  State<ChecklistScreen> createState() => _ChecklistScreenState();
}

class _ChecklistScreenState extends State<ChecklistScreen> {
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
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const ChecklistResumenScreen()),
    );
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

    final porcentaje = checklist.totalItems == 0
        ? 0
        : ((checklist.totalMarcados / checklist.totalItems) * 100).round();

    return Scaffold(
      appBar: AppBar(
        title: const BrandAppBarTitle(subtitulo: 'Checklist de obra'),
      ),
      body: Column(
        children: [
          _BarraProgreso(
            total: checklist.categorias.length,
            actual: checklist.indice,
            porcentaje: porcentaje,
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
                ...categoria.items.asMap().entries.map((entry) {
                  final index = entry.key;
                  final item = entry.value;
                  return FadeSlideIn(
                    index: index,
                    child: _FilaItemChecklist(
                      item: item,
                      onTap: () => checklist.toggleItem(index),
                    ),
                  );
                }),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: _BarraAvanzar(
        esPrimera: checklist.esPrimeraCategoria,
        esUltima: checklist.esUltimaCategoria,
        onAnterior: checklist.retroceder,
        onSiguiente: () {
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
  final int porcentaje;
  final ValueChanged<int> onTap;

  const _BarraProgreso({
    required this.total,
    required this.actual,
    required this.porcentaje,
    required this.onTap,
  });

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
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Categoría ${actual + 1} de $total',
                style: TextStyle(
                  fontSize: 11,
                  color: colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                '$porcentaje% revisado',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: BrandColors.cian,
                ),
              ),
            ],
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
            if (item.esExtra) ...[
              const SizedBox(width: 8),
              Icon(
                item.esProducto ? Icons.inventory_2_outlined : Icons.edit_note_outlined,
                size: 16,
                color: colorScheme.outline,
              ),
            ],
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

/// Barra inferior de la pantalla: "Anterior" (oculto en la primera
/// categoría) y la acción de avanzar, que cambia a "Ir al resumen" en la
/// última — así siempre se sabe qué viene después sin adivinar.
class _BarraAvanzar extends StatelessWidget {
  final bool esPrimera;
  final bool esUltima;
  final VoidCallback onAnterior;
  final VoidCallback onSiguiente;

  const _BarraAvanzar({
    required this.esPrimera,
    required this.esUltima,
    required this.onAnterior,
    required this.onSiguiente,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Row(
          children: [
            if (!esPrimera) ...[
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onAnterior,
                  icon: const Icon(Icons.arrow_back, size: 18),
                  label: const Text('Anterior'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    foregroundColor: BrandColors.azulMarino,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              flex: esPrimera ? 1 : 2,
              child: FilledButton.icon(
                onPressed: onSiguiente,
                icon: Icon(esUltima ? Icons.task_alt : Icons.arrow_forward, size: 18),
                label: Text(esUltima ? 'Ir al resumen' : 'Siguiente paso'),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: BrandColors.cian,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                ),
              ),
            ),
          ],
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
