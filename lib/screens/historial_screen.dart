import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import '../models/cotizacion_guardada.dart';
import '../services/db_helper.dart';
import '../theme/brand_colors.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/brand_app_bar_title.dart';
import '../widgets/fade_slide_in.dart';
import '../widgets/pulsing_dot.dart';

/// Pestaña "Historial": las cotizaciones que ya generaste, más recientes
/// primero, con el nombre del cliente y la fecha para ubicarlas rápido.
/// Cada tarjeta se puede previsualizar (toca la tarjeta) o compartir de
/// nuevo (el botón "Compartir"), y el botón flotante arranca una
/// cotización nueva en blanco.
class HistorialScreen extends StatefulWidget {
  final VoidCallback? onIrAProductos;
  final VoidCallback? onNuevaCotizacion;

  const HistorialScreen({super.key, this.onIrAProductos, this.onNuevaCotizacion});

  @override
  State<HistorialScreen> createState() => _HistorialScreenState();
}

class _HistorialScreenState extends State<HistorialScreen> {
  List<CotizacionGuardada> _cotizaciones = [];
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    final lista = await DbHelper.instance.getCotizacionesGuardadas();
    if (!mounted) return;
    setState(() {
      _cotizaciones = lista;
      _cargando = false;
    });
  }

  Future<bool> _verificarArchivo(CotizacionGuardada c) async {
    final existe = await File(c.archivoPdf).exists();
    if (!existe && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ese PDF ya no está disponible en el celular.')),
      );
    }
    return existe;
  }

  Future<void> _previsualizar(CotizacionGuardada c) async {
    if (!await _verificarArchivo(c)) return;
    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => _VistaPreviaScreen(cotizacion: c)),
    );
  }

  Future<void> _compartir(CotizacionGuardada c) async {
    if (!await _verificarArchivo(c)) return;
    final archivo = File(c.archivoPdf);
    await Printing.sharePdf(
      bytes: await archivo.readAsBytes(),
      filename: 'cotizacion_${c.numero}.pdf',
    );
  }

  @override
  Widget build(BuildContext context) {
    final formatoFecha = DateFormat('dd/MM/yyyy · HH:mm');

    return Scaffold(
      appBar: AppBar(title: const BrandAppBarTitle(subtitulo: 'Historial de cotizaciones')),
      body: RefreshIndicator(
        onRefresh: _cargar,
        child: _cargando
            ? const Center(child: CircularProgressIndicator())
            : _cotizaciones.isEmpty
                ? _EstadoVacio(onIrAProductos: widget.onIrAProductos)
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
                    itemCount: _cotizaciones.length,
                    itemBuilder: (context, index) {
                      final c = _cotizaciones[index];
                      return FadeSlideIn(
                        index: index,
                        child: Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _TarjetaCotizacion(
                            cotizacion: c,
                            formatoFecha: formatoFecha,
                            onPreview: () => _previsualizar(c),
                            onShare: () => _compartir(c),
                          ),
                        ),
                      );
                    },
                  ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: widget.onNuevaCotizacion,
        icon: const Icon(Icons.add),
        label: const Text('Nueva cotización'),
      ),
    );
  }
}

class _TarjetaCotizacion extends StatelessWidget {
  final CotizacionGuardada cotizacion;
  final DateFormat formatoFecha;
  final VoidCallback onPreview;
  final VoidCallback onShare;

  const _TarjetaCotizacion({
    required this.cotizacion,
    required this.formatoFecha,
    required this.onPreview,
    required this.onShare,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return AnimatedPressable(
      onTap: onPreview,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: colorScheme.outlineVariant),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.receipt_long_outlined, size: 14, color: colorScheme.outline),
                const SizedBox(width: 4),
                Text(
                  'Nro ${cotizacion.numero}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: colorScheme.outline,
                    letterSpacing: 0.3,
                  ),
                ),
                const Spacer(),
                const Icon(Icons.visibility_outlined, size: 15, color: BrandColors.cian),
                const SizedBox(width: 3),
                const Text(
                  'Ver',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: BrandColors.cian),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              cotizacion.cliente.isEmpty ? 'Cliente sin nombre' : cotizacion.cliente,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: BrandColors.azulMarino,
              ),
            ),
            if ((cotizacion.rucDni ?? '').isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                'RUC/DNI: ${cotizacion.rucDni}',
                style: TextStyle(fontSize: 12, color: colorScheme.onSurfaceVariant),
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(Icons.schedule_outlined, size: 14, color: colorScheme.outline),
                const SizedBox(width: 4),
                Text(
                  formatoFecha.format(cotizacion.fecha),
                  style: TextStyle(fontSize: 12, color: colorScheme.onSurfaceVariant),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Divider(height: 1, color: colorScheme.outlineVariant),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Total',
                      style: TextStyle(fontSize: 11, color: colorScheme.onSurfaceVariant),
                    ),
                    Text(
                      'S/ ${cotizacion.total.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: BrandColors.azulMarino,
                      ),
                    ),
                  ],
                ),
                AnimatedPressable(
                  onTap: onShare,
                  borderRadius: BorderRadius.circular(24),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: BrandColors.cian,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.share_outlined, size: 16, color: Colors.white),
                        SizedBox(width: 6),
                        Text(
                          'Compartir',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Pantalla de previsualización del PDF ya generado — usa el visor propio
/// del paquete printing (zoom, cambiar de página, e imprimir/compartir
/// desde ahí mismo también).
class _VistaPreviaScreen extends StatelessWidget {
  final CotizacionGuardada cotizacion;

  const _VistaPreviaScreen({required this.cotizacion});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: BrandColors.azulMarino,
        foregroundColor: Colors.white,
        title: Text('Cotización ${cotizacion.numero}'),
      ),
      body: PdfPreview(
        build: (format) => File(cotizacion.archivoPdf).readAsBytes(),
        pdfFileName: 'cotizacion_${cotizacion.numero}.pdf',
        canChangeOrientation: false,
        canChangePageFormat: false,
        canDebug: false,
      ),
    );
  }
}

class _EstadoVacio extends StatelessWidget {
  final VoidCallback? onIrAProductos;

  const _EstadoVacio({this.onIrAProductos});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 40),
        Center(
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 88,
                height: 88,
                decoration: BoxDecoration(
                  color: colorScheme.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Icon(
                  Icons.receipt_long_outlined,
                  size: 44,
                  color: BrandColors.azulMarino,
                ),
              ),
              const Positioned(
                right: -2,
                bottom: -2,
                child: PulsingDot(color: BrandColors.cian, size: 20),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'Aún no generaste ninguna cotización',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: BrandColors.azulMarino,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Ve a Productos, elige lo que necesitas y genera tu primera cotización.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: colorScheme.onSurfaceVariant),
        ),
        if (onIrAProductos != null) ...[
          const SizedBox(height: 20),
          Center(
            child: AnimatedPressable(
              onTap: onIrAProductos,
              borderRadius: BorderRadius.circular(28),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
                decoration: BoxDecoration(
                  color: BrandColors.cian,
                  borderRadius: BorderRadius.circular(28),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.inventory_2_outlined, size: 18, color: Colors.white),
                    SizedBox(width: 8),
                    Text(
                      'Ir a Productos',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}
