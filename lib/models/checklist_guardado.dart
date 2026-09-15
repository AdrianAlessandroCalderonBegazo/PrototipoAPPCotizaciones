/// Registro de un checklist de obra ya finalizado — lo que se muestra en
/// la pestaña "Historial" (filtrado junto a las cotizaciones).
class ChecklistGuardado {
  final int? id;
  final String responsable;
  final DateTime fecha;
  final int totalItems;
  final int itemsMarcados;
  final String resumenTexto;
  final String? archivoPdf;

  ChecklistGuardado({
    this.id,
    required this.responsable,
    required this.fecha,
    required this.totalItems,
    required this.itemsMarcados,
    required this.resumenTexto,
    this.archivoPdf,
  });

  factory ChecklistGuardado.fromMap(Map<String, dynamic> map) {
    return ChecklistGuardado(
      id: map['id'] as int?,
      responsable: (map['responsable'] ?? '').toString(),
      fecha: DateTime.parse(map['fecha'] as String),
      totalItems: (map['total_items'] as num).toInt(),
      itemsMarcados: (map['items_marcados'] as num).toInt(),
      resumenTexto: (map['resumen_texto'] ?? '').toString(),
      archivoPdf: map['archivo_pdf'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'responsable': responsable,
      'fecha': fecha.toIso8601String(),
      'total_items': totalItems,
      'items_marcados': itemsMarcados,
      'resumen_texto': resumenTexto,
      'archivo_pdf': archivoPdf,
    };
  }
}
