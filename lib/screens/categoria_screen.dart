import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/producto.dart';
import '../services/db_helper.dart';
import '../state/cotizacion_state.dart';

class CategoriaScreen extends StatefulWidget {
  final String categoria;
  const CategoriaScreen({super.key, required this.categoria});

  @override
  State<CategoriaScreen> createState() => _CategoriaScreenState();
}

class _CategoriaScreenState extends State<CategoriaScreen> {
  List<Producto> _productos = [];
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    final productos =
        await DbHelper.instance.getProductosPorCategoria(widget.categoria);
    if (!mounted) return;
    setState(() {
      _productos = productos;
      _cargando = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final cotizacion = context.watch<CotizacionState>();

    return Scaffold(
      appBar: AppBar(title: Text(widget.categoria)),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              itemCount: _productos.length,
              itemBuilder: (context, index) {
                final p = _productos[index];
                final seleccionado = cotizacion.estaEnCotizacion(p);
                final cantidad = cotizacion.cantidadDe(p);

                return CheckboxListTile(
                  value: seleccionado,
                  onChanged: (_) => cotizacion.toggle(p),
                  title: Text(p.nombre),
                  subtitle: Text(
                    [
                      if ((p.referenciaInterna ?? '').isNotEmpty)
                        p.referenciaInterna!,
                      if (p.precioVenta != null)
                        'S/ ${p.precioVenta!.toStringAsFixed(2)}',
                    ].join(' · '),
                  ),
                  secondary: seleccionado
                      ? SizedBox(
                          width: 104,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.remove_circle_outline),
                                onPressed: () =>
                                    cotizacion.setCantidad(p, cantidad - 1),
                              ),
                              Text('$cantidad'),
                              IconButton(
                                icon: const Icon(Icons.add_circle_outline),
                                onPressed: () =>
                                    cotizacion.setCantidad(p, cantidad + 1),
                              ),
                            ],
                          ),
                        )
                      : null,
                );
              },
            ),
    );
  }
}
