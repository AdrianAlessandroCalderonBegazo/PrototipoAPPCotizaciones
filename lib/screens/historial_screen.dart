import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import '../models/checklist_guardado.dart';
import '../models/cotizacion_guardada.dart';
import '../services/db_helper.dart';
import '../state/checklist_state.dart';
import '../theme/app_text_styles.dart';
import '../theme/brand_colors.dart';
import '../utils/checklist_estilo.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/brand_app_bar_title.dart';
import '../widgets/fade_slide_in.dart';
import '../widgets/pulsing_dot.dart';

enum _FiltroHistorial { cotizaciones, checklists }

// DateFormat('d MMM', 'es') depende de datos de locale que la app no
// inicializa (para no encarecer el arranque solo por esto); además, el
// mes abreviado que trae esa tabla para setiembre es "sept", no "sep"
// como se usa en el diseño — con esta lista chica alcanza y queda exacto.
const _mesesCorto = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

String _fechaCorta(DateTime fecha) => '${fecha.day} ${_mesesCorto[fecha.month - 1]}';

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

  final _busquedaController = TextEditingController();
  String _busqueda = '';
  DateTimeRange? _rangoFecha;

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

  bool _coincideFecha(DateTime fecha) {
    final rango = _rangoFecha;
    if (rango == null) return true;
    final inicio = DateTime(rango.start.year, rango.start.month, rango.start.day);
    final fin = DateTime(rango.end.year, rango.end.month, rango.end.day + 1);
    return !fecha.isBefore(inicio) && fecha.isBefore(fin);
  }

  List<CotizacionGuardada> get _cotizacionesFiltradas {
    final busqueda = _busqueda.trim().toLowerCase();
    return _cotizaciones.where((c) {
      final coincideNombre = busqueda.isEmpty || c.cliente.toLowerCase().contains(busqueda);
      return coincideNombre && _coincideFecha(c.fecha);
    }).toList();
  }

  List<ChecklistGuardado> get _checklistsFiltrados {
    final busqueda = _busqueda.trim().toLowerCase();
    return _checklists.where((c) {
      final coincideNombre = busqueda.isEmpty || c.responsable.toLowerCase().contains(busqueda);
      return coincideNombre && _coincideFecha(c.fecha);
    }).toList();
  }

  Future<void> _elegirRangoFecha() async {
    final ahora = DateTime.now();
    final rango = await showDateRangePicker(
      context: context,
      firstDate: DateTime(ahora.year - 5),
      lastDate: DateTime(ahora.year + 1),
      initialDateRange: _rangoFecha,
      helpText: 'Filtrar por fecha',
      cancelText: 'Cancelar',
      confirmText: 'Aplicar',
      saveText: 'Aplicar',
    );
    if (rango != null) setState(() => _rangoFecha = rango);
  }

  String _etiquetaRango(DateTimeRange rango) {
    if (rango.start.year == rango.end.year &&
        rango.start.month == rango.end.month &&
        rango.start.day == rango.end.day) {
      return _fechaCorta(rango.start);
    }
    return '${_fechaCorta(rango.start)} - ${_fechaCorta(rango.end)}';
  }

  void _limpiarFiltros() {
    setState(() {
      _busqueda = '';
      _busquedaController.clear();
      _rangoFecha = null;
    });
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

  void _abrirCotizacion(CotizacionGuardada c) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => _CotizacionDetalleScreen(cotizacion: c)),
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

  Future<void> _compartirChecklist(ChecklistGuardado c) async {
    final ruta = c.archivoPdf;
    if (ruta == null || !await _verificarArchivo(ruta)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Este checklist no tiene PDF. Ábrelo y usa "Copiar como mensaje".')),
      );
      return;
    }
    final archivo = File(ruta);
    await Printing.sharePdf(bytes: await archivo.readAsBytes(), filename: 'checklist_de_obra.pdf');
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

  Widget _encabezado(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: BrandColors.azulMarino,
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(28),
          bottomRight: Radius.circular(28),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('HISTORIAL', style: AppTextStyles.etiqueta.copyWith(color: Colors.white70)),
              const SizedBox(height: 4),
              Text('Cotizaciones y checklists', style: AppTextStyles.titulo.copyWith(color: Colors.white)),
              const SizedBox(height: 16),
              TextField(
                controller: _busquedaController,
                onChanged: (v) => setState(() => _busqueda = v),
                style: const TextStyle(color: Colors.white, fontSize: 14),
                cursorColor: Colors.white,
                decoration: InputDecoration(
                  hintText: 'Buscar por nombre',
                  hintStyle: const TextStyle(color: Colors.white54),
                  prefixIcon: const Icon(Icons.search, size: 20, color: Colors.white54),
                  suffixIcon: _busqueda.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.clear, size: 18, color: Colors.white54),
                          onPressed: () => setState(() {
                            _busqueda = '';
                            _busquedaController.clear();
                          }),
                        ),
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: 0.1),
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _PildoraFiltro(
                      texto: 'Cotizaciones',
                      activo: _filtro == _FiltroHistorial.cotizaciones,
                      onTap: () => setState(() => _filtro = _FiltroHistorial.cotizaciones),
                    ),
                    const SizedBox(width: 8),
                    _PildoraFiltro(
                      texto: 'Checklists',
                      activo: _filtro == _FiltroHistorial.checklists,
                      onTap: () => setState(() => _filtro = _FiltroHistorial.checklists),
                    ),
                    const SizedBox(width: 8),
                    _PildoraFiltro(
                      texto: _rangoFecha == null ? 'Fecha' : _etiquetaRango(_rangoFecha!),
                      activo: _rangoFecha != null,
                      icono: Icons.calendar_month_outlined,
                      onTap: _elegirRangoFecha,
                      onClear: _rangoFecha == null ? null : () => setState(() => _rangoFecha = null),
                    ),
                  ],
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
    final formatoFecha = DateFormat('dd/MM/yyyy · HH:mm');
    final esCotizaciones = _filtro == _FiltroHistorial.cotizaciones;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: Column(
          children: [
            _encabezado(context),
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
      ),
    );
  }

  Widget _listaCotizaciones(DateFormat formatoFecha) {
    if (_cotizaciones.isEmpty) {
      return _EstadoVacio(
        icono: Icons.receipt_long_outlined,
        titulo: 'Aún no generaste ninguna cotización',
        subtitulo: 'Ve a Cotizar, elige lo que necesitas y genera tu primera cotización.',
        textoBoton: 'Ir a Cotizar',
        onBoton: widget.onIrAProductos,
      );
    }
    final lista = _cotizacionesFiltradas;
    if (lista.isEmpty) {
      return _EstadoVacio(
        icono: Icons.search_off,
        titulo: 'Ninguna cotización coincide',
        subtitulo: 'Prueba con otro nombre o cambia el rango de fechas.',
        textoBoton: 'Quitar filtros',
        onBoton: _limpiarFiltros,
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
      itemCount: lista.length + 1,
      itemBuilder: (context, index) {
        if (index == lista.length) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Center(
              child: Text(
                'toca una tarjeta para ver el detalle',
                style: AppTextStyles.apoyo,
              ),
            ),
          );
        }
        final c = lista[index];
        return FadeSlideIn(
          index: index,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _TarjetaCotizacion(
              cotizacion: c,
              onPreview: () => _abrirCotizacion(c),
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
    final lista = _checklistsFiltrados;
    if (lista.isEmpty) {
      return _EstadoVacio(
        icono: Icons.search_off,
        titulo: 'Ningún checklist coincide',
        subtitulo: 'Prueba con otro nombre o cambia el rango de fechas.',
        textoBoton: 'Quitar filtros',
        onBoton: _limpiarFiltros,
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
      itemCount: lista.length,
      itemBuilder: (context, index) {
        final c = lista[index];
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
              onShare: () => _compartirChecklist(c),
              onDelete: () => _eliminarChecklist(c),
            ),
          ),
        );
      },
    );
  }
}

/// Píldora de filtro del encabezado de Historial — dos son un toggle
/// (Cotizaciones/Checklists, siempre una activa) y la tercera (Fecha) es
/// un filtro independiente que se puede limpiar con su propia "x".
class _PildoraFiltro extends StatelessWidget {
  final String texto;
  final bool activo;
  final IconData? icono;
  final VoidCallback onTap;
  final VoidCallback? onClear;

  const _PildoraFiltro({
    required this.texto,
    required this.activo,
    required this.onTap,
    this.icono,
    this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedPressable(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: activo ? BrandColors.cian : Colors.white.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icono != null) ...[
              Icon(icono, size: 14, color: Colors.white),
              const SizedBox(width: 6),
            ],
            Text(
              texto,
              style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600),
            ),
            if (onClear != null) ...[
              const SizedBox(width: 6),
              GestureDetector(
                onTap: onClear,
                child: const Icon(Icons.close, size: 14, color: Colors.white),
              ),
            ],
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
                  Text(subtitulo, style: AppTextStyles.apoyo),
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
  final VoidCallback onPreview;
  final VoidCallback onShare;
  final VoidCallback onDelete;

  const _TarjetaCotizacion({
    required this.cotizacion,
    required this.onPreview,
    required this.onShare,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final moneda = NumberFormat.currency(locale: 'en_US', symbol: 'S/ ', decimalDigits: 0);
    final fecha = _fechaCorta(cotizacion.fecha);
    final cliente = cotizacion.cliente.isEmpty ? 'Cliente sin nombre' : cotizacion.cliente;
    final productos = cotizacion.items.length;
    final subtitulo = productos > 0 ? '$fecha · $cliente · $productos productos' : '$fecha · $cliente';

    return AnimatedPressable(
      onTap: onPreview,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: BorderRadius.circular(18),
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
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: BrandColors.menta.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.receipt_long_outlined, color: BrandColors.azulOscuro, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Cotización ${cotizacion.numero}',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: BrandColors.azulMarino),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitulo,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  moneda.format(cotizacion.total),
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: BrandColors.cian),
                ),
              ],
            ),
            const SizedBox(height: 10),
            _AccionesTexto(onShare: onShare, onDelete: onDelete),
          ],
        ),
      ),
    );
  }
}

/// Acciones de la tarjeta en texto plano (sin caja), como en el diseño de
/// referencia — más liviano que un botón con borde para una tarjeta chica.
class _AccionesTexto extends StatelessWidget {
  final VoidCallback onShare;
  final VoidCallback onDelete;

  const _AccionesTexto({required this.onShare, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TextButton(
            onPressed: onShare,
            style: TextButton.styleFrom(
              foregroundColor: BrandColors.cian,
              padding: const EdgeInsets.symmetric(vertical: 6),
              alignment: Alignment.centerLeft,
            ),
            child: const Text('Compartir', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ),
        ),
        Expanded(
          child: TextButton(
            onPressed: onDelete,
            style: TextButton.styleFrom(
              foregroundColor: Colors.redAccent,
              padding: const EdgeInsets.symmetric(vertical: 6),
              alignment: Alignment.centerLeft,
            ),
            child: const Text('Eliminar', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ),
        ),
      ],
    );
  }
}

class _FilaAccionesTarjeta extends StatelessWidget {
  final VoidCallback onShare;
  final VoidCallback onDelete;

  const _FilaAccionesTarjeta({required this.onShare, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: onShare,
            icon: const Icon(Icons.share_outlined, size: 16),
            label: const Text('Compartir'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 11),
              foregroundColor: BrandColors.cian,
              side: const BorderSide(color: BrandColors.cian),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: onDelete,
            icon: const Icon(Icons.delete_outline, size: 16, color: Colors.redAccent),
            label: const Text('Eliminar', style: TextStyle(color: Colors.redAccent)),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 11),
              side: BorderSide(color: Colors.redAccent.withValues(alpha: 0.4)),
            ),
          ),
        ),
      ],
    );
  }
}

class _TarjetaChecklist extends StatelessWidget {
  final ChecklistGuardado checklist;
  final DateFormat formatoFecha;
  final VoidCallback onTap;
  final VoidCallback onShare;
  final VoidCallback onDelete;

  const _TarjetaChecklist({
    required this.checklist,
    required this.formatoFecha,
    required this.onTap,
    required this.onShare,
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
                const Text(
                  'Ver detalle',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: BrandColors.cian),
                ),
                const SizedBox(width: 2),
                const Icon(Icons.chevron_right, size: 16, color: BrandColors.cian),
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
            const SizedBox(height: 12),
            _FilaAccionesTarjeta(onShare: onShare, onDelete: onDelete),
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

/// Detalle nativo de una cotización guardada: cliente, RUC/DNI, fecha,
/// vendedor/datos bancarios y el detalle completo de productos — con
/// opción de ver el PDF ya generado o compartirlo directamente.
class _CotizacionDetalleScreen extends StatefulWidget {
  final CotizacionGuardada cotizacion;

  const _CotizacionDetalleScreen({required this.cotizacion});

  @override
  State<_CotizacionDetalleScreen> createState() => _CotizacionDetalleScreenState();
}

class _CotizacionDetalleScreenState extends State<_CotizacionDetalleScreen> {
  bool _verTodos = false;

  CotizacionGuardada get cotizacion => widget.cotizacion;

  Future<bool> _verificarArchivo() async {
    if (await File(cotizacion.archivoPdf).exists()) return true;
    if (!mounted) return false;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Ese PDF ya no está disponible en el celular.')),
    );
    return false;
  }

  Future<void> _verPdf() async {
    if (!await _verificarArchivo()) return;
    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _VistaPreviaScreen(
          archivoPdf: cotizacion.archivoPdf,
          titulo: 'Cotización ${cotizacion.numero}',
        ),
      ),
    );
  }

  Future<void> _compartir() async {
    if (!await _verificarArchivo()) return;
    final bytes = await File(cotizacion.archivoPdf).readAsBytes();
    await Printing.sharePdf(bytes: bytes, filename: 'cotizacion_${cotizacion.numero}.pdf');
  }

  Widget _parDato(String etiqueta, String valor, {bool alinearDerecha = false}) {
    return Column(
      crossAxisAlignment: alinearDerecha ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(etiqueta, style: AppTextStyles.etiqueta),
        const SizedBox(height: 4),
        Text(valor, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: BrandColors.azulMarino)),
      ],
    );
  }

  Widget _filaTotal(String etiqueta, String valor, ColorScheme colorScheme, {bool destacado = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            etiqueta,
            style: TextStyle(
              fontSize: destacado ? 15 : 13,
              fontWeight: destacado ? FontWeight.bold : FontWeight.w500,
              color: destacado ? BrandColors.azulMarino : colorScheme.onSurfaceVariant,
            ),
          ),
          Text(
            valor,
            style: TextStyle(
              fontSize: destacado ? 20 : 14,
              fontWeight: FontWeight.bold,
              color: destacado ? BrandColors.cian : colorScheme.onSurface,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final moneda = NumberFormat.currency(locale: 'en_US', symbol: 'S/ ', decimalDigits: 0);
    final formatoFecha = DateFormat('dd/MM/yyyy');
    final colorScheme = Theme.of(context).colorScheme;

    final totalBruto = cotizacion.total;
    final subtotal = totalBruto / 1.18;
    final igv = totalBruto - subtotal;

    final items = cotizacion.items;
    final mostrados = _verTodos ? items : items.take(2).toList();
    final restantes = items.length - mostrados.length;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: Column(
          children: [
            Container(
              width: double.infinity,
              color: BrandColors.cian,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 20, 20),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white, size: 18),
                      ),
                      const SizedBox(width: 4),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('COTIZACIÓN', style: AppTextStyles.etiqueta.copyWith(color: Colors.white70)),
                          Text(cotizacion.numero, style: AppTextStyles.titulo.copyWith(color: Colors.white)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: _parDato(
                          'CLIENTE',
                          cotizacion.cliente.isEmpty ? 'Cliente sin nombre' : cotizacion.cliente,
                        ),
                      ),
                      Expanded(
                        child: _parDato('FECHA', formatoFecha.format(cotizacion.fecha), alinearDerecha: true),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: _parDato('RUC / DNI', (cotizacion.rucDni ?? '').isEmpty ? '-' : cotizacion.rucDni!),
                      ),
                      Expanded(
                        child: _parDato(
                          'VENDEDOR',
                          (cotizacion.vendedor ?? '').isEmpty ? '-' : cotizacion.vendedor!,
                          alinearDerecha: true,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  Text('PRODUCTOS · ${items.length}', style: AppTextStyles.etiqueta),
                  const SizedBox(height: 10),
                  if (items.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Text(
                        'Esta cotización se guardó antes de registrar el detalle de productos.',
                        style: TextStyle(fontSize: 12, color: colorScheme.onSurfaceVariant),
                      ),
                    )
                  else ...[
                    ...mostrados.map((item) => _FilaProductoDetalle(item: item, moneda: moneda)),
                    if (restantes > 0)
                      GestureDetector(
                        onTap: () => setState(() => _verTodos = true),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Text(
                            '+ $restantes productos más',
                            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: BrandColors.cian),
                          ),
                        ),
                      )
                    else if (_verTodos && items.length > 2)
                      GestureDetector(
                        onTap: () => setState(() => _verTodos = false),
                        child: const Padding(
                          padding: EdgeInsets.symmetric(vertical: 4),
                          child: Text(
                            'Ver menos',
                            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: BrandColors.cian),
                          ),
                        ),
                      ),
                  ],
                  const SizedBox(height: 16),
                  Divider(color: colorScheme.outlineVariant),
                  const SizedBox(height: 8),
                  _filaTotal('Subtotal', moneda.format(subtotal), colorScheme),
                  _filaTotal('IGV 18%', moneda.format(igv), colorScheme),
                  const SizedBox(height: 6),
                  _filaTotal('TOTAL', moneda.format(totalBruto), colorScheme, destacado: true),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                child: Column(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _verPdf,
                        style: FilledButton.styleFrom(
                          backgroundColor: BrandColors.azulMarino,
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          shape: const StadiumBorder(),
                        ),
                        child: const Text('EXPORTAR PDF', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.6)),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: _compartir,
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          foregroundColor: BrandColors.azulMarino,
                          side: const BorderSide(color: BrandColors.azulMarino),
                          shape: const StadiumBorder(),
                        ),
                        child: const Text('Compartir cotización'),
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

String _cantidadCorta(double n) => n == n.truncateToDouble() ? n.toStringAsFixed(0) : n.toStringAsFixed(2);

class _FilaProductoDetalle extends StatelessWidget {
  final ItemCotizacionGuardado item;
  final NumberFormat moneda;

  const _FilaProductoDetalle({required this.item, required this.moneda});

  @override
  Widget build(BuildContext context) {
    final unidad = (item.unidadMedida ?? '').trim();
    final cantidadTexto = unidad.isEmpty ? _cantidadCorta(item.cantidad) : '${_cantidadCorta(item.cantidad)} $unidad';

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.nombre,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
                const SizedBox(height: 2),
                Text(
                  '$cantidadTexto × S/ ${item.precioUnitario.toStringAsFixed(2)}',
                  style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(moneda.format(item.subtotal), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        ],
      ),
    );
  }
}

/// Detalle de un checklist guardado: cada categoría con lo que se marcó y
/// lo que no (si el registro tiene ese detalle guardado — [categoriasJson]
/// — o si no, el texto plano tal como se hubiera copiado), más "copiar
/// como mensaje" y, si en su momento se generó, el PDF correspondiente.
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
    final categorias = categoriasDesdeJson(checklist.categoriasJson);

    return Scaffold(
      appBar: AppBar(title: const BrandAppBarTitle(subtitulo: 'Checklist de obra')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
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
          if (categorias.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                checklist.resumenTexto,
                style: const TextStyle(fontSize: 12.5, height: 1.5),
              ),
            )
          else
            ...categorias.asMap().entries.map(
                  (e) => _TarjetaCategoriaDetalle(indice: e.key, categoria: e.value),
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
                  onPressed: () => _copiar(context),
                  icon: const Icon(Icons.copy_outlined),
                  label: const Text('Copiar como mensaje'),
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

class _TarjetaCategoriaDetalle extends StatelessWidget {
  final int indice;
  final ChecklistCategoriaState categoria;

  const _TarjetaCategoriaDetalle({required this.indice, required this.categoria});

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
          children: categoria.items.map((item) {
            return ListTile(
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
              trailing: (item.marcado || item.esExtra)
                  ? Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (item.marcado)
                          Text(
                            '× ${item.cantidad}',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: BrandColors.cian),
                          ),
                        if (item.esExtra) ...[
                          const SizedBox(width: 6),
                          Icon(
                            item.esProducto ? Icons.inventory_2_outlined : Icons.edit_note_outlined,
                            size: 16,
                            color: colorScheme.outline,
                          ),
                        ],
                      ],
                    )
                  : null,
            );
          }).toList(),
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
