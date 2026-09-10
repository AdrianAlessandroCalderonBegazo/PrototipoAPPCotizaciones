import 'dart:typed_data';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import '../state/cotizacion_state.dart';

class PdfService {
  static Future<Uint8List> generar({
    required List<ItemCotizacion> items,
    String cliente = '',
    String vendedor = '',
  }) async {
    final doc = pw.Document();
    final formatoFecha = DateFormat('dd/MM/yyyy');
    final moneda = NumberFormat.currency(locale: 'es_PE', symbol: 'S/ ');
    final total = items.fold<double>(0, (s, i) => s + i.subtotal);

    doc.addPage(
      pw.MultiPage(
        margin: const pw.EdgeInsets.all(28),
        build: (context) => [
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text(
                'COTIZACIÓN',
                style: const pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold),
              ),
              pw.Text(formatoFecha.format(DateTime.now())),
            ],
          ),
          pw.SizedBox(height: 6),
          if (cliente.isNotEmpty) pw.Text('Cliente: $cliente'),
          if (vendedor.isNotEmpty) pw.Text('Vendedor: $vendedor'),
          pw.SizedBox(height: 16),
          pw.Table(
            border: pw.TableBorder.all(color: PdfColors.grey400, width: 0.5),
            columnWidths: const {
              0: pw.FlexColumnWidth(4),
              1: pw.FlexColumnWidth(1.4),
              2: pw.FlexColumnWidth(1.1),
              3: pw.FlexColumnWidth(1.6),
              4: pw.FlexColumnWidth(1.8),
            },
            children: [
              pw.TableRow(
                decoration: const pw.BoxDecoration(color: PdfColors.teal100),
                children: [
                  _celda('Producto', bold: true),
                  _celda('Referencia', bold: true),
                  _celda('Cant.', bold: true),
                  _celda('P. Unit.', bold: true),
                  _celda('Subtotal', bold: true),
                ],
              ),
              ...items.map(
                (i) => pw.TableRow(
                  children: [
                    _celda(i.producto.nombre),
                    _celda(i.producto.referenciaInterna ?? '-'),
                    _celda('${i.cantidad}'),
                    _celda(moneda.format(i.producto.precioVenta ?? 0)),
                    _celda(moneda.format(i.subtotal)),
                  ],
                ),
              ),
            ],
          ),
          pw.SizedBox(height: 16),
          pw.Align(
            alignment: pw.Alignment.centerRight,
            child: pw.Text(
              'TOTAL: ${moneda.format(total)}',
              style: const pw.TextStyle(fontSize: 15, fontWeight: pw.FontWeight.bold),
            ),
          ),
        ],
      ),
    );

    return doc.save();
  }

  static pw.Widget _celda(String texto, {bool bold = false}) {
    return pw.Padding(
      padding: const pw.EdgeInsets.all(6),
      child: pw.Text(
        texto,
        style: pw.TextStyle(
          fontSize: 9,
          fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
        ),
      ),
    );
  }
}
