import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../models/checklist_guardado.dart';
import '../services/db_helper.dart';
import '../services/pdf_service.dart';
import '../state/checklist_state.dart';
import '../theme/brand_colors.dart';
import '../utils/checklist_estilo.dart';
import '../widgets/brand_app_bar_title.dart';
import '../widgets/lottie_gate_screen.dart';
import '../widgets/seccion_card.dart';

/// Resumen final del checklist, después de pasar por las 10 categorías:
/// el detalle consolidado, la firma del responsable, y las dos formas de
/// entregarlo — generar PDF o copiar el texto para WhatsApp (ninguna de
/// las dos es obligatoria).
class ChecklistResumenScreen extends StatefulWidget {
  const ChecklistResumenScreen({super.key});

  @override
  State<ChecklistResumenScreen> createState() => _ChecklistResumenScreenState();
}

class _ChecklistResumenScreenState extends State<ChecklistResumenScreen> {
  final _responsableController = TextEditingController();
  bool _generando = false;
  int? _idGuardado;

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
    );
  }

  /// La primera vez que se genera el PDF o se copia el texto, se guarda un
  /// registro nuevo en el historial; si se hace la otra acción después,
  /// se actualiza ese mismo registro en vez de duplicarlo.
  Future<void> _guardarOActualizar(ChecklistState checklist, {String? archivoPdf}) async {
    final registro = _construirRegistro(checklist, archivoPdf: archivoPdf);
    if (_idGuardado == null) {
      _idGuardado = await DbHelper.instance.guardarChecklist(registro);
    } else {
      await DbHelper.instance.actualizarChecklist(_idGuardado!, registro);
    }
  }

  Future<(Uint8List, String)> _procesoDeGeneracion(ChecklistState checklist) async {
    final bytes = await PdfService.generarChecklist(
      categorias: checklist.categorias,
      responsable: _responsableController.text,
    );
    final ruta = await PdfService.guardarChecklistEnDisco(bytes);
    await _guardarOActualizar(checklist, archivoPdf: ruta);
    return (bytes, ruta);
  }

  Future<void> _generarPdf(ChecklistState checklist) async {
    setState(() => _generando = true);
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LottieGateScreen<(Uint8List, String)>(
          lottieAsset: 'assets/animations/verification.lottie',
          mensaje: 'Generando tu checklist...',
          proceso: () => _procesoDeGeneracion(checklist),
          alTerminar: (context, resultado) async {
            final (bytes, _) = resultado;
            Navigator.of(context).pop();
            await Printing.sharePdf(bytes: bytes, filename: 'checklist_de_obra.pdf');
          },
          alFallar: (context, error) {
            Navigator.of(context).pop();
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('No se pudo generar el PDF: $error')),
            );
          },
        ),
      ),
    );
    if (mounted) setState(() => _generando = false);
  }

  Future<void> _copiarWhatsapp(ChecklistState checklist) async {
    final texto = checklist.generarTextoResumen(responsable: _responsableController.text);
    await Clipboard.setData(ClipboardData(text: texto));
    await _guardarOActualizar(checklist);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Checklist copiado — pégalo donde quieras enviarlo.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final checklist = context.watch<ChecklistState>();
    final responsable = _responsableController.text.trim();

    return Scaffold(
      appBar: AppBar(title: const BrandAppBarTitle(subtitulo: 'Resumen del checklist')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: BrandColors.azulMarino,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                const Icon(Icons.task_alt, color: BrandColors.menta, size: 32),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Checklist completado',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${checklist.totalMarcados} de ${checklist.totalItems} ítems marcados',
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
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
          const SizedBox(height: 4),
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              'Detalle por categoría',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: BrandColors.azulMarino),
            ),
          ),
          ...checklist.categorias.asMap().entries.map(
                (e) => _TarjetaCategoriaResumen(indice: e.key, categoria: e.value),
              ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _copiarWhatsapp(checklist),
                  icon: const Icon(Icons.chat_outlined),
                  label: const Text('Copiar'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: const BorderSide(color: BrandColors.cian),
                    foregroundColor: BrandColors.azulMarino,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _generando ? null : () => _generarPdf(checklist),
                  icon: _generando
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.picture_as_pdf_outlined),
                  label: Text(_generando ? 'Generando...' : 'Generar PDF'),
                  style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TarjetaCategoriaResumen extends StatelessWidget {
  final int indice;
  final ChecklistCategoriaState categoria;

  const _TarjetaCategoriaResumen({required this.indice, required this.categoria});

  @override
  Widget build(BuildContext context) {
    final estilo = estiloDeCategoriaChecklist(indice);
    final completo = categoria.items.isNotEmpty && categoria.totalMarcados == categoria.items.length;
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          leading: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: estilo.color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(estilo.icono, color: estilo.color, size: 20),
          ),
          title: Text(
            quitarNumeroCategoria(categoria.nombre),
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
          ),
          subtitle: Text(
            '${categoria.totalMarcados} de ${categoria.items.length}',
            style: TextStyle(
              color: completo ? BrandColors.cian : colorScheme.onSurfaceVariant,
              fontWeight: completo ? FontWeight.bold : FontWeight.normal,
              fontSize: 12,
            ),
          ),
          children: categoria.items
              .map(
                (item) => ListTile(
                  dense: true,
                  leading: Icon(
                    item.marcado ? Icons.check_circle : Icons.radio_button_unchecked,
                    size: 18,
                    color: item.marcado ? BrandColors.cian : colorScheme.outline,
                  ),
                  title: Text(
                    item.texto,
                    style: TextStyle(
                      fontSize: 13,
                      color: item.marcado ? null : colorScheme.onSurfaceVariant,
                    ),
                  ),
                  trailing: item.esExtra
                      ? Icon(
                          item.esProducto ? Icons.inventory_2_outlined : Icons.edit_note_outlined,
                          size: 16,
                          color: colorScheme.outline,
                        )
                      : null,
                ),
              )
              .toList(),
        ),
      ),
    );
  }
}
