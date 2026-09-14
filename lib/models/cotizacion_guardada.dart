/// Registro de una cotización ya generada — lo que se muestra en la
/// pestaña "Historial" (cliente + fecha, para poder ubicarlas después).
class CotizacionGuardada {
  final int? id;
  final String numero;
  final String cliente;
  final String? rucDni;
  final DateTime fecha;
  final double total;
  final String archivoPdf;

  CotizacionGuardada({
    this.id,
    required this.numero,
    required this.cliente,
    this.rucDni,
    required this.fecha,
    required this.total,
    required this.archivoPdf,
  });

  factory CotizacionGuardada.fromMap(Map<String, dynamic> map) {
    return CotizacionGuardada(
      id: map['id'] as int?,
      numero: (map['numero'] ?? '').toString(),
      cliente: (map['cliente'] ?? '').toString(),
      rucDni: map['ruc_dni'] as String?,
      fecha: DateTime.parse(map['fecha'] as String),
      total: (map['total'] as num).toDouble(),
      archivoPdf: (map['archivo_pdf'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'numero': numero,
      'cliente': cliente,
      'ruc_dni': rucDni,
      'fecha': fecha.toIso8601String(),
      'total': total,
      'archivo_pdf': archivoPdf,
    };
  }
}
