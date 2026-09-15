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
import '../widgets/buscador_productos.dart';
import '../widgets/lottie_gate_screen.dart';
import '../widgets/producto_thumbnail.dart';
import '../widgets/seccion_card.dart';

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
      builder: (_) => const BuscadorProductos(),
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
          SeccionCard(
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
          SeccionCard(
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
          SeccionCard(
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
