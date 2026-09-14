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
class HistorialScreen extends StatefulWidget {
  final VoidCallback? onIrAProductos;

  const HistorialScreen({super.key, this.onIrAProductos});

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

  Future<void> _abrir(CotizacionGuardada c) async {
    final archivo = File(c.archivoPdf);
    if (!await archivo.exists()) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ese PDF ya no está disponible en el celular.')),
      );
      return;
    }
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
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
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
                            onTap: () => _abrir(c),
                          ),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}

class _TarjetaCotizacion extends StatelessWidget {
  final CotizacionGuardada cotizacion;
  final DateFormat formatoFecha;
  final VoidCallback onTap;

  const _TarjetaCotizacion({
    required this.cotizacion,
    required this.formatoFecha,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return AnimatedPressable(
      onTap: onTap,
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
                  onTap: onTap,
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
