import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../services/pdf_service.dart';
import '../services/server_config.dart';
import '../state/cotizacion_state.dart';
import '../widgets/producto_thumbnail.dart';

class CotizacionScreen extends StatefulWidget {
  const CotizacionScreen({super.key});
  @override
  State<CotizacionScreen> createState() => _CotizacionScreenState();
}

class _CotizacionScreenState extends State<CotizacionScreen> {
  final _clienteController = TextEditingController();
  final _vendedorController = TextEditingController();
  bool _generando = false;
  String? _baseUrl;

  @override
  void initState() {
    super.initState();
    ServerConfig.baseUrl().then((url) {
      if (mounted) setState(() => _baseUrl = url);
    });
  }

  @override
  void dispose() {
    _clienteController.dispose();
    _vendedorController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cotizacion = context.watch<CotizacionState>();
    final items = cotizacion.items;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cotización'),
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
      body: items.isEmpty
          ? const Center(child: Text('Aún no agregaste productos.'))
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      TextField(
                        controller: _clienteController,
                        decoration: const InputDecoration(
                          labelText: 'Cliente (opcional)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _vendedorController,
                        decoration: const InputDecoration(
                          labelText: 'Vendedor (opcional)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      final item = items[index];
                      return ListTile(
                        leading: ProductoThumbnail(
                          url: ServerConfig.imageUrl(
                            _baseUrl,
                            item.producto.archivoImagen,
                          ),
                        ),
                        title: Text(item.producto.nombre),
                        subtitle: Text(
                          'Cant. ${item.cantidad} · S/ ${(item.producto.precioVenta ?? 0).toStringAsFixed(2)} c/u',
                        ),
                        trailing: Text(
                          'S/ ${item.subtotal.toStringAsFixed(2)}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      );
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'TOTAL: S/ ${cotizacion.totalGeneral.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
                  child: FilledButton.icon(
                    icon: _generando
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.picture_as_pdf),
                    label: Text(_generando ? 'Generando...' : 'Generar y compartir PDF'),
                    onPressed: _generando
                        ? null
                        : () async {
                            setState(() => _generando = true);
                            final bytes = await PdfService.generar(
                              items: items,
                              cliente: _clienteController.text.trim(),
                              vendedor: _vendedorController.text.trim(),
                              baseUrl: _baseUrl,
                            );
                            if (!mounted) return;
                            setState(() => _generando = false);
                            await Printing.sharePdf(
                              bytes: bytes,
                              filename: 'cotizacion.pdf',
                            );
                          },
                  ),
                ),
              ],
            ),
    );
  }
}
