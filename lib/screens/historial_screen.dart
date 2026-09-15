import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import '../models/checklist_guardado.dart';
import '../models/cotizacion_guardada.dart';
import '../services/db_helper.dart';
import '../theme/brand_colors.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/brand_app_bar_title.dart';
import '../widgets/fade_slide_in.dart';
import '../widgets/pulsing_dot.dart';

enum _FiltroHistorial { cotizaciones, checklists }

/// Pestaña "Historial": cotizaciones y checklists de obra ya generados,
/// más recientes primero, con un selector arriba para ver uno u otro tipo.
/// Cada tarjeta se puede abrir (toca la tarjeta) y el botón flotante
/// arranca uno nuevo en blanco, del tipo que esté seleccionado.
class HistorialScreen extends StatefulWidget {
  final VoidCallback? onIrAProductos;
  final VoidCallback? onNuevaCotizacion;
  final VoidCallback? onNuevoChecklist;

  const HistorialScreen({
    super.key,
    this.onIrAProductos,
    this.onNuevaCotizacion,
    this.onNuevoChecklist,
  });

  @override
  State<HistorialScreen> createState() => _HistorialScreenState();
}

class _HistorialScreenState extends State<HistorialScreen> {
  _FiltroHistorial _filtro = _FiltroHistorial.cotizaciones;
  List<CotizacionGuardada> _cotizaciones = [];
  List<ChecklistGuardado> _checklists = [];
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    final cotizaciones = await DbHelper.instance.getCotizacionesGuardadas();
    final checklists = await DbHelper.instance.getChecklistsGuardados();
    if (!mounted) return;
    setState(() {
      _cotizaciones = cotizaciones;
      _checklists = checklists;
      _cargando = false;
    });
  }

  Future<bool> _verificarArchivo(String ruta) async {
    final existe = await File(ruta).exists();
    if (!existe && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ese PDF ya no está disponible en el celular.')),
      );
    }
    return existe;
  }

  Future<void> _previsualizarCotizacion(CotizacionGuardada c) async {
    if (!await _verificarArchivo(c.archivoPdf)) return;
    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _VistaPreviaScreen(archivoPdf: c.archivoPdf, titulo: 'Cotización ${c.numero}'),
      ),
    );
  }

  Future<void> _compartirCotizacion(CotizacionGuardada c) async {
    if (!await _verificarArchivo(c.archivoPdf)) return;
    final archivo = File(c.archivoPdf);
    await Printing.sharePdf(
      bytes: await archivo.readAsBytes(),
      filename: 'cotizacion_${c.numero}.pdf',
    );
  }

  Future<void> _eliminarCotizacion(CotizacionGuardada c) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('¿Eliminar esta cotización?'),
        content: Text(
          '"${c.cliente.isEmpty ? 'Cliente sin nombre' : c.cliente}" se eliminará del historial. '
          'Esta acción no se puede deshacer.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Eliminar')),
        ],
      ),
    );
    if (confirmar != true) return;
    await DbHelper.instance.eliminarCotizacion(c.id!);
    try {
      final archivo = File(c.archivoPdf);
      if (await archivo.exists()) await archivo.delete();
    } catch (_) {
      // No pasa nada si el archivo ya no está o no se puede borrar.
    }
    if (mounted) _cargar();
  }

  Future<void> _eliminarChecklist(ChecklistGuardado c) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('¿Eliminar este checklist?'),
        content: const Text('Se eliminará del historial. Esta acción no se puede deshacer.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Eliminar')),
        ],
      ),
    );
    if (confirmar != true) return;
    await DbHelper.instance.eliminarChecklist(c.id!);
    final ruta = c.archivoPdf;
    if (ruta != null) {
      try {
        final archivo = File(ruta);
        if (await archivo.exists()) await archivo.delete();
      } catch (_) {
        // No pasa nada si el archivo ya no está o no se puede borrar.
      }
    }
    if (mounted) _cargar();
  }

  Future<void> _mostrarGestionar() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '¿Qué quieres crear?',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: BrandColors.azulMarino),
            ),
            const SizedBox(height: 14),
            _OpcionGestionar(
              icono: Icons.request_quote_outlined,
              color: BrandColors.cian,
              titulo: 'Gestionar Cotización',
              subtitulo: 'Crear una cotización nueva',
              onTap: () {
                Navigator.pop(ctx);
                setState(() => _filtro = _FiltroHistorial.cotizaciones);
                widget.onNuevaCotizacion?.call();
              },
            ),
            const SizedBox(height: 10),
            _OpcionGestionar(
              icono: Icons.checklist,
              color: BrandColors.azulOscuro,
              titulo: 'Gestionar Checklist',
              subtitulo: 'Crear un checklist de obra nuevo',
              onTap: () {
                Navigator.pop(ctx);
                setState(() => _filtro = _FiltroHistorial.checklists);
                widget.onNuevoChecklist?.call();
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final formatoFecha = DateFormat('dd/MM/yyyy · HH:mm');
    final esCotizaciones = _filtro == _FiltroHistorial.cotizaciones;

    return Scaffold(
      appBar: AppBar(title: const BrandAppBarTitle(subtitulo: 'Historial')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: _SelectorFiltro(
              filtro: _filtro,
              onChanged: (f) => setState(() => _filtro = f),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _cargar,
              child: _cargando
                  ? const Center(child: CircularProgressIndicator())
                  : esCotizaciones
                      ? _listaCotizaciones(formatoFecha)
                      : _listaChecklists(formatoFecha),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _mostrarGestionar,
        icon: const Icon(Icons.add),
        label: const Text('Gestionar'),
      ),
    );
  }

  Widget _listaCotizaciones(DateFormat formatoFecha) {
    if (_cotizaciones.isEmpty) {
      return _EstadoVacio(
        icono: Icons.receipt_long_outlined,
        titulo: 'Aún no generaste ninguna cotización',
        subtitulo: 'Ve a Productos, elige lo que necesitas y genera tu primera cotización.',
        textoBoton: 'Ir a Productos',
        onBoton: widget.onIrAProductos,
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
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
              onPreview: () => _previsualizarCotizacion(c),
              onShare: () => _compartirCotizacion(c),
              onDelete: () => _eliminarCotizacion(c),
            ),
          ),
        );
      },
    );
  }

  Widget _listaChecklists(DateFormat formatoFecha) {
    if (_checklists.isEmpty) {
      return _EstadoVacio(
        icono: Icons.checklist,
        titulo: 'Aún no completaste ningún checklist',
        subtitulo: 'Ve a Checklist y recorre las categorías antes de salir a obra.',
        textoBoton: 'Ir a Checklist',
        onBoton: widget.onNuevoChecklist,
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
      itemCount: _checklists.length,
      itemBuilder: (context, index) {
        final c = _checklists[index];
        return FadeSlideIn(
          index: index,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _TarjetaChecklist(
              checklist: c,
              formatoFecha: formatoFecha,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => _ChecklistDetalleScreen(checklist: c)),
              ),
              onDelete: () => _eliminarChecklist(c),
            ),
          ),
        );
      },
    );
  }
}

class _SelectorFiltro extends StatelessWidget {
  final _FiltroHistorial filtro;
  final ValueChanged<_FiltroHistorial> onChanged;

  const _SelectorFiltro({required this.filtro, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Expanded(
            child: _opcion(
              context,
              'Cotizaciones',
              Icons.request_quote_outlined,
              _FiltroHistorial.cotizaciones,
            ),
          ),
          Expanded(
            child: _opcion(context, 'Checklists', Icons.checklist, _FiltroHistorial.checklists),
          ),
        ],
      ),
    );
  }

  Widget _opcion(BuildContext context, String texto, IconData icono, _FiltroHistorial valor) {
    final activo = filtro == valor;
    final colorScheme = Theme.of(context).colorScheme;
    return AnimatedPressable(
      onTap: () => onChanged(valor),
      borderRadius: BorderRadius.circular(11),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: activo ? BrandColors.azulMarino : Colors.transparent,
          borderRadius: BorderRadius.circular(11),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icono, size: 16, color: activo ? Colors.white : colorScheme.onSurfaceVariant),
            const SizedBox(width: 6),
            Text(
              texto,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: activo ? Colors.white : colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OpcionGestionar extends StatelessWidget {
  final IconData icono;
  final Color color;
  final String titulo;
  final String subtitulo;
  final VoidCallback onTap;

  const _OpcionGestionar({
    required this.icono,
    required this.color,
    required this.titulo,
    required this.subtitulo,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedPressable(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icono, color: color, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titulo,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      color: BrandColors.azulMarino,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(subtitulo, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: color),
          ],
        ),
      ),
    );
  }
}

class _TarjetaCotizacion extends StatelessWidget {
  final CotizacionGuardada cotizacion;
  final DateFormat formatoFecha;
  final VoidCallback onPreview;
  final VoidCallback onShare;
  final VoidCallback onDelete;

  const _TarjetaCotizacion({
    required this.cotizacion,
    required this.formatoFecha,
    required this.onPreview,
    required this.onShare,
    required this.onDelete,
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
                const SizedBox(width: 10),
                InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: onDelete,
                  child: const Padding(
                    padding: EdgeInsets.all(2),
                    child: Icon(Icons.delete_outline, size: 16, color: Colors.redAccent),
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

class _TarjetaChecklist extends StatelessWidget {
  final ChecklistGuardado checklist;
  final DateFormat formatoFecha;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _TarjetaChecklist({
    required this.checklist,
    required this.formatoFecha,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final completo = checklist.totalItems > 0 && checklist.itemsMarcados == checklist.totalItems;

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
                Icon(Icons.checklist, size: 14, color: colorScheme.outline),
                const SizedBox(width: 4),
                Text(
                  'Checklist de obra',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: colorScheme.outline,
                    letterSpacing: 0.3,
                  ),
                ),
                const Spacer(),
                if (checklist.archivoPdf != null) ...[
                  const Icon(Icons.picture_as_pdf_outlined, size: 14, color: BrandColors.cian),
                  const SizedBox(width: 6),
                ],
                Icon(Icons.chevron_right, size: 16, color: colorScheme.outline),
                const SizedBox(width: 10),
                InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: onDelete,
                  child: const Padding(
                    padding: EdgeInsets.all(2),
                    child: Icon(Icons.delete_outline, size: 16, color: Colors.redAccent),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              checklist.responsable.isEmpty ? 'Sin responsable especificado' : checklist.responsable,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: BrandColors.azulMarino,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(Icons.schedule_outlined, size: 14, color: colorScheme.outline),
                const SizedBox(width: 4),
                Text(
                  formatoFecha.format(checklist.fecha),
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
                Text(
                  'Ítems marcados',
                  style: TextStyle(fontSize: 11, color: colorScheme.onSurfaceVariant),
                ),
                Text(
                  '${checklist.itemsMarcados} / ${checklist.totalItems}',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: completo ? BrandColors.cian : BrandColors.azulMarino,
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
/// desde ahí mismo también). Sirve tanto para cotizaciones como checklists.
class _VistaPreviaScreen extends StatelessWidget {
  final String archivoPdf;
  final String titulo;

  const _VistaPreviaScreen({required this.archivoPdf, required this.titulo});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: BrandColors.azulMarino,
        foregroundColor: Colors.white,
        title: Text(titulo),
      ),
      body: PdfPreview(
        build: (format) => File(archivoPdf).readAsBytes(),
        pdfFileName: '$titulo.pdf',
        canChangeOrientation: false,
        canChangePageFormat: false,
        canDebug: false,
      ),
    );
  }
}

/// Detalle de un checklist guardado: el texto tal como se copió (o se
/// hubiera copiado) para WhatsApp, y — si en su momento se generó — el
/// PDF correspondiente.
class _ChecklistDetalleScreen extends StatelessWidget {
  final ChecklistGuardado checklist;

  const _ChecklistDetalleScreen({required this.checklist});

  Future<void> _copiar(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: checklist.resumenTexto));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Checklist copiado.'), duration: Duration(seconds: 1)),
    );
  }

  Future<void> _verPdf(BuildContext context) async {
    final ruta = checklist.archivoPdf;
    if (ruta == null) return;
    if (!await File(ruta).exists()) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ese PDF ya no está disponible en el celular.')),
      );
      return;
    }
    if (!context.mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _VistaPreviaScreen(archivoPdf: ruta, titulo: 'Checklist de obra'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final formatoFecha = DateFormat('dd/MM/yyyy · HH:mm');
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const BrandAppBarTitle(subtitulo: 'Checklist de obra')),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              checklist.responsable.isEmpty ? 'Sin responsable especificado' : checklist.responsable,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: BrandColors.azulMarino),
            ),
            const SizedBox(height: 4),
            Text(
              '${formatoFecha.format(checklist.fecha)} · ${checklist.itemsMarcados} de ${checklist.totalItems} ítems marcados',
              style: TextStyle(fontSize: 12, color: colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: SingleChildScrollView(
                  child: Text(
                    checklist.resumenTexto,
                    style: const TextStyle(fontSize: 12.5, height: 1.5),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _copiar(context),
                  icon: const Icon(Icons.copy_outlined),
                  label: const Text('Copiar'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: const BorderSide(color: BrandColors.cian),
                    foregroundColor: BrandColors.azulMarino,
                  ),
                ),
              ),
              if (checklist.archivoPdf != null) ...[
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => _verPdf(context),
                    icon: const Icon(Icons.picture_as_pdf_outlined),
                    label: const Text('Ver PDF'),
                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _EstadoVacio extends StatelessWidget {
  final IconData icono;
  final String titulo;
  final String subtitulo;
  final String textoBoton;
  final VoidCallback? onBoton;

  const _EstadoVacio({
    required this.icono,
    required this.titulo,
    required this.subtitulo,
    required this.textoBoton,
    this.onBoton,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 32),
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
                child: Icon(icono, size: 44, color: BrandColors.azulMarino),
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
        Text(
          titulo,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BrandColors.azulMarino),
        ),
        const SizedBox(height: 8),
        Text(
          subtitulo,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: colorScheme.onSurfaceVariant),
        ),
        if (onBoton != null) ...[
          const SizedBox(height: 20),
          Center(
            child: AnimatedPressable(
              onTap: onBoton,
              borderRadius: BorderRadius.circular(28),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
                decoration: BoxDecoration(
                  color: BrandColors.cian,
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
                    const SizedBox(width: 8),
                    Text(
                      textoBoton,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
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
