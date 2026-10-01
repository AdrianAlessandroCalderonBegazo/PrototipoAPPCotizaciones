import 'checklist_categoria.dart';

/// Recorrido de una salida de herramientas: se registra con el checklist,
/// almacén confirma que salieron (desde ahí quedan pendientes de devolución)
/// y, cuando vuelven todas, un encargado confirma la devolución: "conforme".
enum EstadoHerramientas { registrado, pendiente, conforme }

extension EstadoHerramientasTexto on EstadoHerramientas {
  String get etiqueta => switch (this) {
        EstadoHerramientas.registrado => 'Registrado',
        EstadoHerramientas.pendiente => 'Pendiente devolución',
        EstadoHerramientas.conforme => 'Conforme',
      };
}

/// Registro de una salida de herramientas armado con el checklist de
/// siempre. [categoriasJson] guarda solo lo que salió, con su cantidad.
class ChecklistHerramientas {
  final int? id;
  final String numero;
  final String obra;
  final String responsable;

  /// Si salió una maleta armada (ej. "Maleta 1") en vez del checklist.
  final String? maleta;
  final EstadoHerramientas estado;

  /// Cuándo se registró el checklist (antes de que salgan las herramientas).
  final DateTime fechaSalida;

  /// Cuándo almacén confirmó que las herramientas salieron, y quién.
  final DateTime? fechaConfirmacionSalida;
  final String? salidaConfirmadaPor;
  final DateTime? fechaDevolucion;
  final String? encargado;
  final String? observaciones;
  final String? observacionesDevolucion;
  final String categoriasJson;

  ChecklistHerramientas({
    this.id,
    required this.numero,
    required this.obra,
    required this.responsable,
    this.maleta,
    this.estado = EstadoHerramientas.registrado,
    required this.fechaSalida,
    this.fechaConfirmacionSalida,
    this.salidaConfirmadaPor,
    this.fechaDevolucion,
    this.encargado,
    this.observaciones,
    this.observacionesDevolucion,
    required this.categoriasJson,
  });

  late final List<ChecklistCategoriaState> categorias = soloMarcados(categoriasDesdeJson(categoriasJson));
  late final int totalItems = categorias.fold(0, (s, c) => s + c.items.length);
  late final int totalUnidades = categorias.fold(0, (s, c) => s + c.totalUnidades);

  bool get conforme => estado == EstadoHerramientas.conforme;

  /// Ya salieron a obra (pendientes de devolución o devueltas).
  bool get salidaConfirmada => estado != EstadoHerramientas.registrado;

  ChecklistHerramientas copyWith({
    int? id,
    EstadoHerramientas? estado,
    DateTime? fechaConfirmacionSalida,
    String? salidaConfirmadaPor,
    DateTime? fechaDevolucion,
    String? encargado,
    String? observacionesDevolucion,
  }) {
    return ChecklistHerramientas(
      id: id ?? this.id,
      numero: numero,
      obra: obra,
      responsable: responsable,
      maleta: maleta,
      estado: estado ?? this.estado,
      fechaSalida: fechaSalida,
      fechaConfirmacionSalida: fechaConfirmacionSalida ?? this.fechaConfirmacionSalida,
      salidaConfirmadaPor: salidaConfirmadaPor ?? this.salidaConfirmadaPor,
      fechaDevolucion: fechaDevolucion ?? this.fechaDevolucion,
      encargado: encargado ?? this.encargado,
      observaciones: observaciones,
      observacionesDevolucion: observacionesDevolucion ?? this.observacionesDevolucion,
      categoriasJson: categoriasJson,
    );
  }

  factory ChecklistHerramientas.fromMap(Map<String, dynamic> map) {
    return ChecklistHerramientas(
      id: map['id'] as int?,
      numero: (map['numero'] ?? '').toString(),
      obra: (map['obra'] ?? '').toString(),
      responsable: (map['responsable'] ?? '').toString(),
      maleta: map['maleta'] as String?,
      estado: EstadoHerramientas.values.firstWhere(
        (e) => e.name == map['estado'],
        orElse: () => EstadoHerramientas.pendiente,
      ),
      fechaSalida: DateTime.parse(map['fecha_salida'] as String),
      fechaConfirmacionSalida: DateTime.tryParse((map['fecha_confirmacion_salida'] ?? '').toString()),
      salidaConfirmadaPor: map['salida_confirmada_por'] as String?,
      fechaDevolucion: DateTime.tryParse((map['fecha_devolucion'] ?? '').toString()),
      encargado: map['encargado'] as String?,
      observaciones: map['observaciones'] as String?,
      observacionesDevolucion: map['observaciones_devolucion'] as String?,
      categoriasJson: (map['categorias_json'] ?? '[]').toString(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'numero': numero,
      'obra': obra,
      'responsable': responsable,
      'maleta': maleta,
      'estado': estado.name,
      'fecha_salida': fechaSalida.toIso8601String(),
      'fecha_confirmacion_salida': fechaConfirmacionSalida?.toIso8601String(),
      'salida_confirmada_por': salidaConfirmadaPor,
      'fecha_devolucion': fechaDevolucion?.toIso8601String(),
      'encargado': encargado,
      'observaciones': observaciones,
      'observaciones_devolucion': observacionesDevolucion,
      'categorias_json': categoriasJson,
    };
  }
}
