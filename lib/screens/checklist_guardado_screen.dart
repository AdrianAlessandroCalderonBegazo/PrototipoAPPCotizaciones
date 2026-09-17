import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../state/navegacion_state.dart';
import '../theme/brand_colors.dart';

/// Pantalla de confirmación al guardar un checklist: banner de éxito,
/// vista previa embebida del PDF ya creado, y las salidas naturales —
/// copiarlo como mensaje, compartir el PDF, o volver al inicio.
class ChecklistGuardadoScreen extends StatelessWidget {
  final Uint8List bytes;
  final String textoResumen;
  final int totalMarcados;
  final int totalItems;

  const ChecklistGuardadoScreen({
    super.key,
    required this.bytes,
    required this.textoResumen,
    required this.totalMarcados,
    required this.totalItems,
  });

  Future<void> _compartir() {
    return Printing.sharePdf(bytes: bytes, filename: 'checklist_de_obra.pdf');
  }

  Future<void> _copiarMensaje(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: textoResumen));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Checklist copiado — pégalo donde quieras enviarlo.')),
    );
  }

  void _volverAlInicio(BuildContext context) {
    Navigator.of(context).popUntil((route) => route.isFirst);
    context.read<NavegacionState>().irA(TabsApp.home);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
              color: BrandColors.cian,
              child: Column(
                children: [
                  Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.25),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.check_rounded, color: Colors.white, size: 32),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Checklist guardado',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$totalMarcados de $totalItems ítems marcados',
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Vista previa del PDF',
                      style: TextStyle(fontWeight: FontWeight.bold, color: BrandColors.azulMarino, fontSize: 13),
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: Container(
                          decoration: BoxDecoration(
                            border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: PdfPreview(
                            build: (format) async => bytes,
                            canChangeOrientation: false,
                            canChangePageFormat: false,
                            canDebug: false,
                            useActions: false,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Column(
                children: [
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _compartir,
                      icon: const Icon(Icons.share_outlined),
                      label: const Text('Compartir checklist'),
                      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () => _copiarMensaje(context),
                      icon: const Icon(Icons.chat_outlined),
                      label: const Text('Copiar como mensaje'),
                      style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _volverAlInicio(context),
                      style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: const Text('Volver al inicio'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
