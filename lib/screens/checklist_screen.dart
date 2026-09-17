import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lottie/lottie.dart';
import 'package:provider/provider.dart';
import '../state/checklist_state.dart';
import '../theme/app_text_styles.dart';
import '../theme/brand_colors.dart';
import '../utils/checklist_estilo.dart';
import '../widgets/agregar_item_checklist.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/fade_slide_in.dart';
import 'checklist_resumen_screen.dart';

/// Pestaña "Checklist": recorrido obligatorio categoría por categoría (10
/// en total, tomadas del Excel real de la empresa) para que antes de salir
/// a obra no se quede nada por olvidar. Se puede retroceder libremente a
/// una categoría ya vista, pero avanzar es siempre de una en una. Cada
/// categoría permite agregar un ítem que se le haya olvidado; el resumen
/// final (al terminar la última) muestra las categorías juntas.
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

  Widget _encabezado(BuildContext context, ChecklistState checklist, ChecklistCategoriaState categoria, int porcentaje) {
    final total = checklist.categorias.length;
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: BrandColors.azulMarino,
        borderRadius: BorderRadius.only(bottomLeft: Radius.circular(28), bottomRight: Radius.circular(28)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('PASO ${checklist.indice + 1} DE $total', style: AppTextStyles.etiqueta.copyWith(color: Colors.white70)),
                  Text('$porcentaje%', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: List.generate(total, (i) {
                  final alcanzado = i <= checklist.indice;
                  return Expanded(
                    child: GestureDetector(
                      onTap: alcanzado ? () => checklist.irACategoria(i) : null,
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        height: 5,
                        decoration: BoxDecoration(
                          color: alcanzado ? BrandColors.cian : Colors.white.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 16),
              Text(quitarNumeroCategoria(categoria.nombre), style: AppTextStyles.titulo.copyWith(color: Colors.white)),
              const SizedBox(height: 4),
              Text('Marca lo que ya está verificado', style: AppTextStyles.apoyo.copyWith(color: Colors.white70)),
            ],
          ),
        ),
      ),
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
    final porcentaje = checklist.totalItems == 0
        ? 0
        : ((checklist.totalMarcados / checklist.totalItems) * 100).round();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: Column(
          children: [
            _encabezado(context, checklist, categoria, porcentaje),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                children: [
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
                  const SizedBox(height: 12),
                  AnimatedPressable(
                    onTap: () => mostrarAgregarItemChecklist(
                      context,
                      checklist: checklist,
                      categoriaIndex: checklist.indice,
                      nombreCategoria: quitarNumeroCategoria(categoria.nombre),
                    ),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: BrandColors.cian, width: 1.4),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.add, size: 18, color: BrandColors.cian),
                          SizedBox(width: 8),
                          Text(
                            'Añadir objeto a este paso',
                            style: TextStyle(color: BrandColors.cian, fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (!checklist.esUltimaCategoria) ...[
                    const SizedBox(height: 14),
                    Center(
                      child: Text(
                        'Siguiente paso: ${quitarNumeroCategoria(checklist.categorias[checklist.indice + 1].nombre)}',
                        textAlign: TextAlign.center,
                        style: AppTextStyles.apoyo,
                      ),
                    ),
                  ],
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
                  color: item.marcado ? colorScheme.onSurfaceVariant : colorScheme.onSurface,
                  decoration: item.marcado ? TextDecoration.lineThrough : TextDecoration.none,
                  decorationColor: colorScheme.onSurfaceVariant,
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
                child: OutlinedButton(
                  onPressed: onAnterior,
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    foregroundColor: BrandColors.azulMarino,
                    shape: const StadiumBorder(),
                  ),
                  child: const Text('Anterior'),
                ),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              flex: esPrimera ? 1 : 2,
              child: FilledButton(
                onPressed: onSiguiente,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: BrandColors.cian,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text(
                  esUltima ? 'IR AL RESUMEN' : 'SIGUIENTE PASO',
                  style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.4),
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
