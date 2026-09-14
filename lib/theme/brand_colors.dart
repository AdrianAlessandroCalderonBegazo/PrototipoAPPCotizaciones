import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';

/// Paleta de marca de Inversiones ICR, usada tanto en la UI (Material) como
/// en la cotización en PDF (paquete pdf, que tiene su propio tipo de color).
class BrandColors {
  BrandColors._();

  static const Color azulMarino = Color(0xFF00004C);
  static const Color azulOscuro = Color(0xFF000073);
  static const Color cian = Color(0xFF00B7C2);
  static const Color menta = Color(0xFF00FFC2);

  static final PdfColor pdfAzulMarino = PdfColor.fromHex('00004C');
  static final PdfColor pdfAzulOscuro = PdfColor.fromHex('000073');
  static final PdfColor pdfCian = PdfColor.fromHex('00B7C2');
  static final PdfColor pdfMenta = PdfColor.fromHex('00FFC2');

  /// Mezcla [color] hacia blanco en la proporción [amount] (0 = sin cambio,
  /// 1 = blanco puro). Se usa para el sombreado alterno de filas de la tabla.
  static PdfColor pdfTint(PdfColor color, double amount) {
    return PdfColor(
      color.red + (1 - color.red) * amount,
      color.green + (1 - color.green) * amount,
      color.blue + (1 - color.blue) * amount,
    );
  }
}
