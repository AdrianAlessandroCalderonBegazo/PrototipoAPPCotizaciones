import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../models/checklist_guardado.dart';
import '../services/db_helper.dart';
import '../services/pdf_service.dart';
import '../state/checklist_state.dart';
import '../theme/app_text_styles.dart';
import '../theme/brand_colors.dart';
import '../utils/checklist_estilo.dart';
import '../widgets/lottie_gate_screen.dart';
import '../widgets/porcentaje_animado.dart';
import '../widgets/seccion_card.dart';
import 'checklist_guardado_screen.dart';

/// Resumen final del checklist, después de pasar por las categorías: un
/// vistazo por categoría (tocar una vuelve a ella para revisar o agregar
/// algo). No hay noción de "pendientes" — es una revisión de qué llevar,
/// no siempre se lleva todo el catálogo. Una vez conforme, "Guardar
/// checklist" lo manda al historial, genera el PDF y lleva a la pantalla
/// de confirmación con la vista previa.
class ChecklistResumenScreen extends StatefulWidget {
  const ChecklistResumenScreen({super.key});

  @override
  State<ChecklistResumenScreen> createState() => _ChecklistResumenScreenState();
}

class _ChecklistResumenScreenState extends State<ChecklistResumenScreen> {
  final _responsableController = TextEditingController();
  bool _guardando = false;

  @override
  void dispose() {
    _responsableController.dispose();
    super.dispose();
  }

  ChecklistGuardado _construirRegistro(ChecklistState checklist, {String? archivoPdf}) {
    return ChecklistGuardado(
      responsable: _responsableController.text.trim(),
      fecha: DateTime.now(),
      totalItems: checklist.totalItems,
      itemsMarcados: checklist.totalMarcados,
      resumenTexto: checklist.generarTextoResumen(responsable: _responsableController.text),
      archivoPdf: archivoPdf,
      categoriasJson: checklist.categoriasAJson(),
    );
  }

  Future<(Uint8List, String)> _procesoDeGuardado(ChecklistState checklist) async {
    final bytes = await PdfService.generarChecklist(
      categorias: checklist.categorias,
      responsable: _responsableController.text,
    );
    final ruta = await PdfService.guardarChecklistEnDisco(bytes);
    await DbHelper.instance.guardarChecklist(_construirRegistro(checklist, archivoPdf: ruta));
    return (bytes, ruta);
  }

  Future<void> _guardarChecklist(ChecklistState checklist) async {
    setState(() => _guardando = true);
    final texto = checklist.generarTextoResumen(responsable: _responsableController.text);
    final totalMarcados = checklist.totalMarcados;
    final totalItems = checklist.totalItems;

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LottieGateScreen<(Uint8List, String)>(
          lottieAsset: 'assets/animations/verification.lottie',
          mensaje: 'Guardando tu checklist...',
          proceso: () => _procesoDeGuardado(checklist),
          alTerminar: (context, resultado) {
            final (bytes, _) = resultado;
            Navigator.of(context).pop();
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (_) => ChecklistGuardadoScreen(
                  bytes: bytes,
                  textoResumen: texto,
                  totalMarcados: totalMarcados,
                  totalItems: totalItems,
                ),
              ),
            );
          },
          alFallar: (context, error) {
            Navigator.of(context).pop();
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('No se pudo guardar el checklist: $error')),
            );
          },
        ),
      ),
    );
    if (mounted) setState(() => _guardando = false);
  }

  Future<void> _empezarNuevo(ChecklistState checklist) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('¿Empezar un checklist nuevo?'),
        content: const Text('Se limpiará este checklist y volverás a la primera categoría.'),
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
    if (mounted) Navigator.of(context).pop();
  }

  Widget _encabezado(BuildContext context, ChecklistState checklist, int total, int porcentaje) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: BrandColors.azulMarino,
        borderRadius: BorderRadius.only(bottomLeft: Radius.circular(28), bottomRight: Radius.circular(28)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 16, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('PASO $total DE $total · RESUMEN', style: AppTextStyles.etiqueta.copyWith(color: Colors.white70)),
                  Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.refresh, color: Colors.white70, size: 20),
                        tooltip: 'Empezar checklist nuevo',
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () => _empezarNuevo(checklist),
                      ),
                      const SizedBox(width: 10),
                      PorcentajeAnimado(valor: porcentaje),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: List.generate(
                  total,
                  (i) => Expanded(
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      height: 5,
                      decoration: BoxDecoration(color: BrandColors.cian, borderRadius: BorderRadius.circular(3)),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                '${checklist.totalMarcados} de ${checklist.totalItems} ítems revisados',
                style: AppTextStyles.subtitulo.copyWith(color: Colors.white),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final checklist = context.watch<ChecklistState>();
    final responsable = _responsableController.text.trim();
    final total = checklist.categorias.length;
    final porcentaje = checklist.porcentajeAvance;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: Column(
          children: [
            _encabezado(context, checklist, total, porcentaje),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                children: [
                  SeccionCard(
                    icono: Icons.edit_outlined,
                    color: BrandColors.azulOscuro,
                    titulo: 'Responsable en terreno',
                    children: [
                      TextField(
                        controller: _responsableController,
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          labelText: 'Nombre (opcional)',
                          prefixIcon: const Icon(Icons.person_outline, size: 20),
                          filled: true,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                      if (responsable.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              responsable,
                              style: const TextStyle(
                                fontFamily: 'Dancing Script',
                                fontSize: 32,
                                fontWeight: FontWeight.bold,
                                color: BrandColors.azulMarino,
                              ),
                            ),
                            Container(
                              width: 170,
                              height: 1,
                              margin: const EdgeInsets.only(top: 2, bottom: 4),
                              color: Theme.of(context).colorScheme.outlineVariant,
                            ),
                            Text(
                              'Firma digitalizada',
                              style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 18),
                  Padding(
                    padding: const EdgeInsets.only(left: 4, bottom: 10),
                    child: Text('RESUMEN POR CATEGORÍA', style: AppTextStyles.etiqueta.copyWith(color: BrandColors.azulMarino)),
                  ),
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      children: [
                        for (final entry in checklist.categorias.asMap().entries)
                          _FilaResumenCategoria(
                            categoria: entry.value,
                            esUltima: entry.key == checklist.categorias.length - 1,
                            onTap: () {
                              checklist.irACategoria(entry.key);
                              Navigator.of(context).pop();
                            },
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: Column(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _guardando ? null : () => _guardarChecklist(checklist),
                        style: FilledButton.styleFrom(
                          backgroundColor: BrandColors.cian,
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          shape: const StadiumBorder(),
                        ),
                        child: _guardando
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('GUARDAR CHECKLIST', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.6)),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(context).pop(),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          foregroundColor: BrandColors.azulMarino,
                          side: const BorderSide(color: BrandColors.azulMarino),
                          shape: const StadiumBorder(),
                        ),
                        child: const Text('Volver al paso anterior'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Fila plana de una categoría en el resumen: nombre + fracción marcada,
/// coloreada según si ya está completa. Tocarla vuelve a esa categoría
/// (útil junto con "+ Añadir objeto a este paso" de cada pantalla).
class _FilaResumenCategoria extends StatelessWidget {
  final ChecklistCategoriaState categoria;
  final bool esUltima;
  final VoidCallback onTap;

  const _FilaResumenCategoria({required this.categoria, required this.esUltima, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final completo = categoria.items.isNotEmpty && categoria.totalMarcados == categoria.items.length;
    final colorScheme = Theme.of(context).colorScheme;

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          border: esUltima ? null : Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                quitarNumeroCategoria(categoria.nombre),
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5),
              ),
            ),
            Text(
              '${categoria.totalMarcados} / ${categoria.items.length}',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 13.5,
                color: completo ? BrandColors.cian : Colors.orange.shade800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
