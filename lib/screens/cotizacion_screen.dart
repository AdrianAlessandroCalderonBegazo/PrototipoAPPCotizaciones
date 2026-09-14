import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/cotizacion_guardada.dart';
import '../models/producto.dart';
import '../services/db_helper.dart';
import '../services/pdf_service.dart';
import '../state/cotizacion_state.dart';
import '../theme/brand_colors.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/brand_app_bar_title.dart';
import '../widgets/lottie_gate_screen.dart';
import '../widgets/producto_thumbnail.dart';

class CotizacionScreen extends StatefulWidget {
  const CotizacionScreen({super.key});
  @override
  State<CotizacionScreen> createState() => _CotizacionScreenState();
}

class _CotizacionScreenState extends State<CotizacionScreen> {
  final _clienteController = TextEditingController();
  final _rucDniController = TextEditingController();
  final _telefonoController = TextEditingController();
  final _vendedorController = TextEditingController();
  final _bancoController = TextEditingController();
  final _monedaController = TextEditingController();
  final _nroCuentaController = TextEditingController();
  final _cciController = TextEditingController();
  bool _generando = false;
  bool _consultandoSunat = false;

  @override
  void initState() {
    super.initState();
    _cargarDatosBancarios();
  }

  Future<void> _cargarDatosBancarios() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _bancoController.text = prefs.getString('cotizacion_banco') ?? '';
      _monedaController.text = prefs.getString('cotizacion_moneda') ?? 'Soles';
      _nroCuentaController.text = prefs.getString('cotizacion_nro_cuenta') ?? '';
      _cciController.text = prefs.getString('cotizacion_cci') ?? '';
    });
  }

  Future<void> _guardarDatosBancarios() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('cotizacion_banco', _bancoController.text.trim());
    await prefs.setString('cotizacion_moneda', _monedaController.text.trim());
    await prefs.setString('cotizacion_nro_cuenta', _nroCuentaController.text.trim());
    await prefs.setString('cotizacion_cci', _cciController.text.trim());
  }

  @override
  void dispose() {
    _clienteController.dispose();
    _rucDniController.dispose();
    _telefonoController.dispose();
    _vendedorController.dispose();
    _bancoController.dispose();
    _monedaController.dispose();
    _nroCuentaController.dispose();
    _cciController.dispose();
    super.dispose();
  }

  // Sin API oficial gratuita de SUNAT: se usa un wrapper de terceros bien
  // conocido, siempre con try/catch — si no responde (sin red, o caído),
  // el cliente simplemente se completa a mano, sin bloquear nada.
  Future<void> _consultarSunat() async {
    final ruc = _rucDniController.text.trim();
    if (ruc.length != 11) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ingresa un RUC de 11 dígitos para buscar en SUNAT.')),
      );
      return;
    }
    setState(() => _consultandoSunat = true);
    try {
      final resp = await http
          .get(Uri.parse('https://api.apis.net.pe/v2/sunat/ruc?numero=$ruc'))
          .timeout(const Duration(seconds: 6));
      if (resp.statusCode != 200) throw Exception('HTTP ${resp.statusCode}');

      final data = jsonDecode(resp.body) as Map<String, dynamic>;
      final razonSocial = (data['razonSocial'] ?? data['nombre'] ?? '').toString().trim();
      if (razonSocial.isEmpty) throw Exception('sin razón social');

      _clienteController.text = razonSocial;
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cliente completado desde SUNAT.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No se pudo consultar SUNAT ahora. Completa el nombre a mano.'),
        ),
      );
    } finally {
      if (mounted) setState(() => _consultandoSunat = false);
    }
  }

  void _copiar(String valor, String etiqueta) {
    if (valor.trim().isEmpty) return;
    Clipboard.setData(ClipboardData(text: valor));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$etiqueta copiado.'), duration: const Duration(seconds: 1)),
    );
  }

  Future<void> _agregarProducto() async {
    final producto = await showModalBottomSheet<Producto>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _BuscadorProductos(),
    );
    if (producto != null && mounted) {
      context.read<CotizacionState>().agregarUno(producto);
    }
  }

  Future<(Uint8List, int)> _procesoDeGeneracion(CotizacionState cotizacion) async {
    final numero = await PdfService.siguienteNumero();
    final cliente = _clienteController.text.trim();
    final rucDni = _rucDniController.text.trim();

    final bytes = await PdfService.generar(
      numero: numero,
      items: cotizacion.items,
      cliente: cliente,
      rucDni: rucDni,
      telefono: _telefonoController.text.trim(),
      vendedor: _vendedorController.text.trim(),
      banco: _bancoController.text.trim(),
      moneda: _monedaController.text.trim(),
      nroCuenta: _nroCuentaController.text.trim(),
      cci: _cciController.text.trim(),
    );

    final rutaArchivo = await PdfService.guardarEnDisco(bytes, numero);
    await DbHelper.instance.guardarCotizacion(
      CotizacionGuardada(
        numero: PdfService.formatearNumero(numero),
        cliente: cliente,
        rucDni: rucDni.isEmpty ? null : rucDni,
        fecha: DateTime.now(),
        total: cotizacion.totalGeneral,
        archivoPdf: rutaArchivo,
      ),
    );
    await _guardarDatosBancarios();
    return (bytes, numero);
  }

  Future<void> _generarYCompartir(CotizacionState cotizacion) async {
    setState(() => _generando = true);

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LottieGateScreen<(Uint8List, int)>(
          lottieAsset: 'assets/animations/verification.lottie',
          mensaje: 'Generando tu cotización...',
          proceso: () => _procesoDeGeneracion(cotizacion),
          alTerminar: (context, resultado) async {
            final (bytes, numero) = resultado;
            Navigator.of(context).pop();
            await Printing.sharePdf(
              bytes: bytes,
              filename: 'cotizacion_${PdfService.formatearNumero(numero)}.pdf',
            );
          },
          alFallar: (context, error) {
            Navigator.of(context).pop();
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('No se pudo generar la cotización: $error')),
            );
          },
        ),
      ),
    );

    if (mounted) setState(() => _generando = false);
  }

  InputDecoration _decoracion(String label, IconData icono, {Widget? suffix}) {
    return InputDecoration(
      labelText: label,
      prefixIcon: Icon(icono, size: 20),
      suffixIcon: suffix,
      filled: true,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cotizacion = context.watch<CotizacionState>();
    final items = cotizacion.items;
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const BrandAppBarTitle(subtitulo: 'Armar cotización'),
        actions: [
          if (items.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Vaciar',
              onPressed: () => showDialog(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('¿Vaciar cotización?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancelar'),
                    ),
                    TextButton(
                      onPressed: () {
                        cotizacion.limpiar();
                        Navigator.pop(context);
                      },
                      child: const Text('Vaciar'),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          _SeccionCard(
            icono: Icons.person_outline,
            color: BrandColors.azulOscuro,
            titulo: 'Datos del cliente',
            children: [
              TextField(
                controller: _clienteController,
                decoration: _decoracion('Cliente (opcional)', Icons.storefront_outlined),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _rucDniController,
                keyboardType: TextInputType.number,
                decoration: _decoracion(
                  'RUC / DNI (opcional)',
                  Icons.badge_outlined,
                  suffix: _consultandoSunat
                      ? const Padding(
                          padding: EdgeInsets.all(13),
                          child: SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : IconButton(
                          icon: const Icon(Icons.travel_explore, size: 20),
                          tooltip: 'Buscar en SUNAT',
                          onPressed: _consultarSunat,
                        ),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _telefonoController,
                keyboardType: TextInputType.phone,
                decoration: _decoracion('Teléfono (opcional)', Icons.phone_outlined),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _vendedorController,
                decoration: _decoracion('Vendedor (opcional)', Icons.support_agent_outlined),
              ),
            ],
          ),
          _SeccionCard(
            icono: Icons.account_balance_outlined,
            color: BrandColors.cian,
            titulo: 'Datos bancarios (opcional)',
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _bancoController,
                      decoration: _decoracion('Banco', Icons.account_balance_outlined),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _monedaController,
                      decoration: _decoracion('Moneda', Icons.payments_outlined),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _nroCuentaController,
                decoration: _decoracion(
                  'Nro de cuenta',
                  Icons.credit_card_outlined,
                  suffix: IconButton(
                    icon: const Icon(Icons.copy_outlined, size: 18),
                    tooltip: 'Copiar',
                    onPressed: () => _copiar(_nroCuentaController.text, 'Nro de cuenta'),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _cciController,
                decoration: _decoracion(
                  'CCI',
                  Icons.tag_outlined,
                  suffix: IconButton(
                    icon: const Icon(Icons.copy_outlined, size: 18),
                    tooltip: 'Copiar',
                    onPressed: () => _copiar(_cciController.text, 'CCI'),
                  ),
                ),
              ),
            ],
          ),
          _SeccionCard(
            icono: Icons.shopping_cart_outlined,
            color: BrandColors.azulMarino,
            titulo: 'Productos (${cotizacion.totalItems})',
            children: [
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                    'Aún no agregaste productos.',
                    style: TextStyle(color: colorScheme.onSurfaceVariant, fontSize: 13),
                  ),
                )
              else
                ...items.map((item) => _FilaCarrito(item: item, cotizacion: cotizacion)),
              const SizedBox(height: 4),
              AnimatedPressable(
                onTap: _agregarProducto,
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: BrandColors.cian, width: 1.4),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add_circle_outline, size: 18, color: BrandColors.cian),
                      SizedBox(width: 8),
                      Text(
                        'Agregar producto',
                        style: TextStyle(color: BrandColors.cian, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: colorScheme.surface,
            border: Border(top: BorderSide(color: colorScheme.outlineVariant)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'TOTAL',
                      style: TextStyle(
                        fontSize: 11,
                        color: colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      'S/ ${cotizacion.totalGeneral.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.bold,
                        color: BrandColors.azulMarino,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                ),
                icon: _generando
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.picture_as_pdf_outlined),
                label: Text(_generando ? 'Generando...' : 'Generar PDF'),
                onPressed: (items.isEmpty || _generando) ? null : () => _generarYCompartir(cotizacion),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Tarjeta redondeada con un ícono de cabecera — el mismo lenguaje visual
/// que las tarjetas de categoría de Productos, para que la pantalla se
/// sienta parte de la misma app.
class _SeccionCard extends StatelessWidget {
  final IconData icono;
  final Color color;
  final String titulo;
  final List<Widget> children;

  const _SeccionCard({
    required this.icono,
    required this.color,
    required this.titulo,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icono, size: 18, color: color),
              ),
              const SizedBox(width: 10),
              Text(
                titulo,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                  color: BrandColors.azulMarino,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }
}

/// Fila de un producto ya agregado al carrito: cantidad con stepper +/- y
/// un botón para quitarlo del todo, sin tener que bajarlo hasta cero.
class _FilaCarrito extends StatelessWidget {
  final ItemCotizacion item;
  final CotizacionState cotizacion;

  const _FilaCarrito({required this.item, required this.cotizacion});

  @override
  Widget build(BuildContext context) {
    final p = item.producto;
    final precio = p.precioVenta ?? 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ProductoThumbnail(archivoImagen: p.archivoImagen, size: 44),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.nombre,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                const SizedBox(height: 2),
                Text(
                  'S/ ${precio.toStringAsFixed(2)} c/u · Subt. S/ ${item.subtotal.toStringAsFixed(2)}',
                  style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(width: 4),
          _botonRedondo(
            Icons.remove,
            BrandColors.azulMarino.withValues(alpha: 0.08),
            BrandColors.azulMarino,
            () => cotizacion.setCantidad(p, item.cantidad - 1),
          ),
          SizedBox(
            width: 22,
            child: Text(
              '${item.cantidad}',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
            ),
          ),
          _botonRedondo(
            Icons.add,
            BrandColors.azulMarino.withValues(alpha: 0.08),
            BrandColors.azulMarino,
            () => cotizacion.setCantidad(p, item.cantidad + 1),
          ),
          const SizedBox(width: 2),
          _botonRedondo(
            Icons.delete_outline,
            Colors.red.withValues(alpha: 0.08),
            Colors.red,
            () => cotizacion.quitar(p),
          ),
        ],
      ),
    );
  }

  Widget _botonRedondo(IconData icono, Color fondo, Color iconoColor, VoidCallback onTap) {
    return AnimatedPressable(
      onTap: onTap,
      borderRadius: BorderRadius.circular(13),
      child: Container(
        width: 26,
        height: 26,
        margin: const EdgeInsets.symmetric(horizontal: 1),
        decoration: BoxDecoration(color: fondo, borderRadius: BorderRadius.circular(13)),
        child: Icon(icono, size: 14, color: iconoColor),
      ),
    );
  }
}

/// Buscador en hoja modal para agregar un producto sin salir de Cotización
/// — usa el mismo `buscar()` del catálogo local que ya tenía DbHelper.
class _BuscadorProductos extends StatefulWidget {
  const _BuscadorProductos();

  @override
  State<_BuscadorProductos> createState() => _BuscadorProductosState();
}

class _BuscadorProductosState extends State<_BuscadorProductos> {
  final _controller = TextEditingController();
  List<Producto> _resultados = [];
  bool _buscando = false;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String query) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _buscar(query));
  }

  Future<void> _buscar(String query) async {
    if (query.trim().isEmpty) {
      setState(() => _resultados = []);
      return;
    }
    setState(() => _buscando = true);
    final resultados = await DbHelper.instance.buscar(query.trim());
    if (!mounted) return;
    setState(() {
      _resultados = resultados;
      _buscando = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 8, 4),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Agregar producto',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 17,
                        color: BrandColors.azulMarino,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _controller,
                autofocus: true,
                onChanged: _onChanged,
                decoration: InputDecoration(
                  hintText: 'Buscar por nombre o código...',
                  prefixIcon: const Icon(Icons.search),
                  filled: true,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: _buscando
                  ? const Center(child: CircularProgressIndicator())
                  : _resultados.isEmpty
                      ? ListView(
                          controller: scrollController,
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(top: 60),
                              child: Center(
                                child: Text(
                                  _controller.text.trim().isEmpty
                                      ? 'Escribe para buscar en el catálogo.'
                                      : 'No se encontró nada para "${_controller.text}".',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(color: Colors.grey.shade600),
                                ),
                              ),
                            ),
                          ],
                        )
                      : ListView.builder(
                          controller: scrollController,
                          padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                          itemCount: _resultados.length,
                          itemBuilder: (context, index) {
                            final p = _resultados[index];
                            return ListTile(
                              leading: ProductoThumbnail(archivoImagen: p.archivoImagen),
                              title: Text(
                                p.nombre,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                              ),
                              subtitle: Text('S/ ${(p.precioVenta ?? 0).toStringAsFixed(2)}'),
                              trailing: const Icon(Icons.add_circle, color: BrandColors.cian),
                              onTap: () => Navigator.pop(context, p),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
