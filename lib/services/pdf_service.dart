import 'dart:typed_data';
import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:shared_preferences/shared_preferences.dart';
import '../state/cotizacion_state.dart';
import '../theme/brand_colors.dart';

const _logoAsset = 'assets/icon/icon.png';

/// Genera la cotización en PDF con el formato oficial de Inversiones ICR
/// (el mismo de las cotizaciones que emite su Odoo): encabezado con
/// logo/RUC/Nro, fila de cliente/total/fecha, vendedor/email, tabla con
/// foto de cada producto y IGV, y el bloque de totales al final.
class PdfService {
  static const _empresa = 'INVERSIONES ICR S.R.L.';
  static const _direccion =
      'AV. PIZARRO 325-C_CERCADO, Mariscal Nieto 180101, Arequipa, Perú.';
  static const _ruc = '20605309489';
  static const _email = 'inversionesicr@hotmail.com';

  // Los precios del catálogo son con IGV incluido (18%, Perú); "Price" en la
  // tabla es el neto de esa línea, igual que en las cotizaciones de Odoo.
  static const _igv = 0.18;

  static Future<Uint8List> generar({
    required List<ItemCotizacion> items,
    String cliente = '',
    String vendedor = '',
  }) async {
    final numero = await _siguienteNumero();
    final imagenes = await _cargarImagenes(items);
    final logo = pw.MemoryImage(
      (await rootBundle.load(_logoAsset)).buffer.asUint8List(),
    );

    // locale 'en_US' solo para el agrupado de miles/decimales (1,234.56);
    // el símbolo "S/ " es el de la cotización real de Inversiones ICR.
    final moneda = NumberFormat.currency(locale: 'en_US', symbol: 'S/ ');
    final fecha = DateFormat('dd/MM/yyyy').format(DateTime.now());

    final totalBruto = items.fold<double>(0, (s, i) => s + i.subtotal);
    final subtotalNeto = totalBruto / (1 + _igv);
    final impuestos = totalBruto - subtotalNeto;

    final doc = pw.Document();
    doc.addPage(
      pw.MultiPage(
        margin: const pw.EdgeInsets.all(24),
        header: (context) => _encabezado(
          context: context,
          logo: logo,
          cliente: cliente,
          vendedor: vendedor,
          fecha: fecha,
          numero: numero,
          totalBruto: totalBruto,
          moneda: moneda,
        ),
        build: (context) => [
          ...items.asMap().entries.map(
            (e) => _filaProducto(
              index: e.key,
              item: e.value,
              moneda: moneda,
              imagen: imagenes[e.value.producto.archivoImagen],
            ),
          ),
          pw.SizedBox(height: 16),
          _bancoYTotales(
            moneda: moneda,
            subtotal: subtotalNeto,
            impuestos: impuestos,
            total: totalBruto,
          ),
        ],
      ),
    );

    return doc.save();
  }

  static Future<int> _siguienteNumero() async {
    final prefs = await SharedPreferences.getInstance();
    final siguiente = (prefs.getInt('cotizacion_correlativo') ?? 0) + 1;
    await prefs.setInt('cotizacion_correlativo', siguiente);
    return siguiente;
  }

  /// Las fotos van empaquetadas en la propia app (assets/productos/), así
  /// que esto no depende de red ni de servidor: si un producto puntual no
  /// trae imagen, o el archivo no está en el bundle, esa celda simplemente
  /// queda en blanco — no debe impedir que se genere el resto del PDF.
  static Future<Map<String, Uint8List>> _cargarImagenes(
    List<ItemCotizacion> items,
  ) async {
    final resultado = <String, Uint8List>{};

    final archivos = items
        .map((i) => i.producto.archivoImagen)
        .whereType<String>()
        .where((a) => a.isNotEmpty)
        .toSet();

    await Future.wait(
      archivos.map((archivo) async {
        try {
          final data = await rootBundle.load('assets/productos/$archivo');
          resultado[archivo] = data.buffer.asUint8List();
        } catch (_) {
          // No está empaquetada esta foto en particular: se omite.
        }
      }),
    );
    return resultado;
  }

  static const _flexItem = 1;
  static const _flexImagen = 2;
  static const _flexDescripcion = 6;
  static const _flexCantidad = 2;
  static const _flexPUnit = 2;
  static const _flexImpuestos = 2;
  static const _flexPrice = 2;

  static pw.Widget _encabezado({
    required pw.Context context,
    required pw.MemoryImage logo,
    required String cliente,
    required String vendedor,
    required String fecha,
    required int numero,
    required double totalBruto,
    required NumberFormat moneda,
  }) {
    final numeroFmt = 'S${numero.toString().padLeft(5, '0')}';

    final tarjetaEmpresa = pw.Row(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Expanded(
          child: pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.center,
            children: [
              pw.Image(logo, height: 34, fit: pw.BoxFit.contain),
              pw.SizedBox(width: 10),
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      _empresa,
                      style: pw.TextStyle(
                        fontSize: 15,
                        fontWeight: pw.FontWeight.bold,
                        color: BrandColors.pdfAzulMarino,
                      ),
                    ),
                    pw.SizedBox(height: 3),
                    pw.Text(
                      _direccion,
                      style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        pw.Container(
          padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: pw.BoxDecoration(
            border: pw.Border.all(color: PdfColors.grey400),
            borderRadius: pw.BorderRadius.circular(4),
          ),
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.end,
            children: [
              pw.Text(
                'RUC: $_ruc',
                style: const pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold),
              ),
              pw.SizedBox(height: 2),
              pw.Text(
                'COTIZACIÓN',
                style: pw.TextStyle(
                  fontSize: 10,
                  fontWeight: pw.FontWeight.bold,
                  color: BrandColors.pdfCian,
                ),
              ),
              pw.SizedBox(height: 2),
              pw.Text(
                'Nro $numeroFmt',
                style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
              ),
            ],
          ),
        ),
      ],
    );

    final filaTablaHeader = pw.Container(
      color: BrandColors.pdfCian,
      padding: const pw.EdgeInsets.symmetric(vertical: 6, horizontal: 4),
      child: pw.Row(
        children: [
          _celdaHeader('Item.', _flexItem),
          _celdaHeader('Imagen', _flexImagen),
          _celdaHeader('Descripción del Artículo', _flexDescripcion),
          _celdaHeader('Cantidad', _flexCantidad),
          _celdaHeader('P. Unit.', _flexPUnit),
          _celdaHeader('Impuestos', _flexImpuestos),
          _celdaHeader('Price', _flexPrice),
        ],
      ),
    );

    if (context.pageNumber == 1) {
      return pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          tarjetaEmpresa,
          pw.SizedBox(height: 14),
          pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text(
                cliente.isEmpty ? 'Cliente sin nombre' : cliente,
                style: const pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 11),
              ),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text(
                    'Total',
                    style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600),
                  ),
                  pw.Text(
                    moneda.format(totalBruto),
                    style: pw.TextStyle(
                      fontSize: 17,
                      fontWeight: pw.FontWeight.bold,
                      color: BrandColors.pdfCian,
                    ),
                  ),
                  pw.SizedBox(height: 4),
                  pw.Text(
                    'Fecha de cotización',
                    style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600),
                  ),
                  pw.Text(
                    fecha,
                    style: const pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10),
                  ),
                ],
              ),
            ],
          ),
          pw.SizedBox(height: 12),
          pw.Container(
            padding: const pw.EdgeInsets.all(8),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.grey300),
              borderRadius: pw.BorderRadius.circular(4),
            ),
            child: pw.Row(
              children: [
                pw.Expanded(
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(
                        'Vendedor(a):',
                        style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
                      ),
                      pw.Text(
                        vendedor.isEmpty ? '-' : vendedor,
                        style: const pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10),
                      ),
                    ],
                  ),
                ),
                pw.SizedBox(width: 12),
                pw.Expanded(
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(
                        'Email:',
                        style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
                      ),
                      pw.Text(
                        _email,
                        style: const pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 10),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 12),
          filaTablaHeader,
        ],
      );
    }

    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [tarjetaEmpresa, pw.SizedBox(height: 10), filaTablaHeader],
    );
  }

  static pw.Widget _celdaHeader(String texto, int flex) {
    return pw.Expanded(
      flex: flex,
      child: pw.Text(
        texto,
        style: const pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: PdfColors.white),
      ),
    );
  }

  static pw.Widget _filaProducto({
    required int index,
    required ItemCotizacion item,
    required NumberFormat moneda,
    Uint8List? imagen,
  }) {
    final p = item.producto;
    final ref = (p.referenciaInterna ?? '').isNotEmpty ? '[${p.referenciaInterna}] ' : '';
    final bruto = item.subtotal;
    final neto = bruto / (1 + _igv);

    return pw.Container(
      color: index.isEven ? PdfColors.white : BrandColors.pdfTint(BrandColors.pdfCian, 0.92),
      padding: const pw.EdgeInsets.symmetric(vertical: 6, horizontal: 4),
      child: pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.center,
        children: [
          pw.Expanded(
            flex: _flexItem,
            child: pw.Text('${index + 1}', style: const pw.TextStyle(fontSize: 9)),
          ),
          pw.Expanded(
            flex: _flexImagen,
            child: imagen != null
                ? pw.Image(pw.MemoryImage(imagen), height: 32, fit: pw.BoxFit.contain)
                : pw.SizedBox(height: 32),
          ),
          pw.Expanded(
            flex: _flexDescripcion,
            child: pw.Text('$ref${p.nombre}', style: const pw.TextStyle(fontSize: 9)),
          ),
          pw.Expanded(
            flex: _flexCantidad,
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(item.cantidad.toStringAsFixed(2), style: const pw.TextStyle(fontSize: 9)),
                pw.Text(
                  p.unidadMedida ?? '',
                  style: const pw.TextStyle(fontSize: 7, color: PdfColors.grey600),
                ),
              ],
            ),
          ),
          pw.Expanded(
            flex: _flexPUnit,
            child: pw.Text(
              (p.precioVenta ?? 0).toStringAsFixed(2),
              style: const pw.TextStyle(fontSize: 9),
            ),
          ),
          pw.Expanded(
            flex: _flexImpuestos,
            child: pw.Text('IGV', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
          ),
          pw.Expanded(
            flex: _flexPrice,
            child: pw.Text(moneda.format(neto), style: const pw.TextStyle(fontSize: 9)),
          ),
        ],
      ),
    );
  }

  static pw.Widget _bancoYTotales({
    required NumberFormat moneda,
    required double subtotal,
    required double impuestos,
    required double total,
  }) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Container(
          color: BrandColors.pdfCian,
          padding: const pw.EdgeInsets.symmetric(vertical: 5, horizontal: 6),
          child: pw.Row(
            children: [
              _celdaHeader('Banco', 1),
              _celdaHeader('Moneda', 1),
              _celdaHeader('Nro Cuenta', 1),
              _celdaHeader('CCI', 1),
            ],
          ),
        ),
        pw.SizedBox(height: 14),
        pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.SizedBox(
            width: 220,
            child: pw.Column(
              children: [
                _filaTotal('Subtotal', moneda.format(subtotal)),
                _filaTotal('Impuestos', moneda.format(impuestos)),
                _filaTotal('Total', moneda.format(total), destacado: true),
              ],
            ),
          ),
        ),
      ],
    );
  }

  static pw.Widget _filaTotal(String etiqueta, String valor, {bool destacado = false}) {
    return pw.Container(
      color: destacado ? BrandColors.pdfTint(BrandColors.pdfCian, 0.85) : null,
      padding: const pw.EdgeInsets.symmetric(vertical: 5, horizontal: 8),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(
            etiqueta,
            style: pw.TextStyle(
              fontSize: destacado ? 11 : 9,
              fontWeight: pw.FontWeight.bold,
              color: destacado ? BrandColors.pdfCian : PdfColors.black,
            ),
          ),
          pw.Text(
            valor,
            style: pw.TextStyle(
              fontSize: destacado ? 13 : 10,
              fontWeight: pw.FontWeight.bold,
              color: destacado ? BrandColors.pdfCian : PdfColors.black,
            ),
          ),
        ],
      ),
    );
  }
}
