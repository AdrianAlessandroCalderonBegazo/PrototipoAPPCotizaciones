import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';
import '../models/cotizacion_guardada.dart';
import '../services/db_helper.dart';

/// Pestaña "Historial": las cotizaciones que ya generaste, más recientes
/// primero, con el nombre del cliente y la fecha para ubicarlas rápido.
class HistorialScreen extends StatefulWidget {
  const HistorialScreen({super.key});

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
    final formatoFecha = DateFormat('dd/MM/yyyy HH:mm');

    return Scaffold(
      appBar: AppBar(title: const Text('Historial')),
      body: RefreshIndicator(
        onRefresh: _cargar,
        child: _cargando
            ? const Center(child: CircularProgressIndicator())
            : _cotizaciones.isEmpty
                ? ListView(
                    children: const [
                      Padding(
                        padding: EdgeInsets.all(32),
                        child: Text(
                          'Todavía no generaste ninguna cotización.',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  )
                : ListView.separated(
                    itemCount: _cotizaciones.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final c = _cotizaciones[index];
                      return ListTile(
                        leading: const Icon(Icons.picture_as_pdf_outlined),
                        title: Text(c.cliente.isEmpty ? 'Cliente sin nombre' : c.cliente),
                        subtitle: Text(
                          '${formatoFecha.format(c.fecha)} · Nro ${c.numero} · S/ ${c.total.toStringAsFixed(2)}',
                        ),
                        trailing: const Icon(Icons.share_outlined),
                        onTap: () => _abrir(c),
                      );
                    },
                  ),
      ),
    );
  }
}
