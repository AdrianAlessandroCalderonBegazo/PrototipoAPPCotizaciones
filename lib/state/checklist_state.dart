import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/intl.dart';
import '../models/checklist_categoria.dart';

/// Estándar de formato para el nombre de un ítem: mayúscula inicial, resto
/// tal cual — así se vean parejos sin importar cómo vengan del catálogo
/// base o de lo que haya tipeado quien agrega uno a mano.
String _capitalizarPrimeraLetra(String texto) {
  if (texto.isEmpty) return texto;
  return texto[0].toUpperCase() + texto.substring(1);
}

/// Un ítem dentro de una categoría del checklist: puede venir del catálogo
/// base (Excel) o haberse agregado a mano desde "¿Te olvidaste de algo?"
/// (en cuyo caso [esExtra] es true, y [esProducto] indica si vino del
/// buscador del catálogo de productos en vez de ser una nota libre).
///
/// Esta es una lista de "qué llevar a la obra", no de "qué ya se revisó":
/// marcar un ítem lo deja en [cantidad] 1 (se va a llevar al menos uno) y
/// desde ahí se puede subir o bajar con un stepper — no siempre se lleva
/// todo el catálogo. [marcado] queda como getter derivado (cantidad > 0)
/// para no duplicar el estado.
class ChecklistItemEntry {
  final String texto;
  int cantidad;
  final bool esExtra;
  final bool esProducto;

  ChecklistItemEntry({
    required this.texto,
    this.cantidad = 0,
    this.esExtra = false,
    this.esProducto = false,
  });

  bool get marcado => cantidad > 0;

  factory ChecklistItemEntry.fromJson(Map<String, dynamic> json) {
    final cantidadJson = json['cantidad'];
    return ChecklistItemEntry(
      texto: (json['texto'] ?? '').toString(),
      // Checklists guardados antes de que existiera "cantidad" solo tenían
      // 'marcado' (true/false) — se traduce a cantidad 1/0 para no perder
      // el detalle histórico.
      cantidad: cantidadJson is num ? cantidadJson.toInt() : (json['marcado'] == true ? 1 : 0),
      esExtra: json['es_extra'] == true,
      esProducto: json['es_producto'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
        'texto': texto,
        'cantidad': cantidad,
        'es_extra': esExtra,
        'es_producto': esProducto,
      };
}

class ChecklistCategoriaState {
  final String nombre;
  final List<ChecklistItemEntry> items;

  ChecklistCategoriaState({required this.nombre, required this.items});

  factory ChecklistCategoriaState.fromJson(Map<String, dynamic> json) {
    return ChecklistCategoriaState(
      nombre: (json['nombre'] ?? '').toString(),
      items: (json['items'] as List<dynamic>? ?? [])
          .map((e) => ChecklistItemEntry.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
        'nombre': nombre,
        'items': items.map((i) => i.toJson()).toList(),
      };

  int get totalMarcados => items.where((i) => i.marcado).length;
}

/// Reconstruye las categorías guardadas de un checklist histórico (para su
/// pantalla de detalle) — si el registro es viejo y no tiene este detalle,
/// o el JSON está corrupto, devuelve una lista vacía en vez de fallar.
List<ChecklistCategoriaState> categoriasDesdeJson(String json) {
  if (json.trim().isEmpty) return [];
  try {
    final decoded = jsonDecode(json) as List<dynamic>;
    return decoded
        .map((e) => ChecklistCategoriaState.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  } catch (_) {
    return [];
  }
}

/// Estado del checklist de obra: carga las categorías base una sola vez y
/// controla el avance secuencial (categoría por categoría, obligatorio
/// hacia adelante, libre hacia atrás) para que no se pase nada por alto.
class ChecklistState extends ChangeNotifier {
  List<ChecklistCategoriaState> _categorias = [];
  int _indice = 0;
  bool _cargando = true;
  String? _error;

  List<ChecklistCategoriaState> get categorias => _categorias;
  int get indice => _indice;
  bool get cargando => _cargando;
  String? get error => _error;

  ChecklistCategoriaState get categoriaActual => _categorias[_indice];
  bool get esPrimeraCategoria => _indice == 0;
  bool get esUltimaCategoria => _indice == _categorias.length - 1;

  /// Si ya avanzó de categoría, marcó algo, o agregó algún extra — para
  /// decidir si hace falta confirmar antes de empezar un checklist nuevo.
  bool get tieneProgreso =>
      _indice > 0 || totalMarcados > 0 || _categorias.any((c) => c.items.any((i) => i.esExtra));

  int get totalItems => _categorias.fold(0, (s, c) => s + c.items.length);
  int get totalMarcados =>
      _categorias.fold(0, (s, c) => s + c.totalMarcados);

  /// Avance por CATEGORÍAS ya completadas, no por ítems marcados: esto es
  /// una revisión de qué llevar (no siempre se lleva todo), así que pasar
  /// de categoría sube el % aunque no se haya marcado nada en ella. Arranca
  /// en 0% en la primera categoría y solo llega a 100% al terminar la
  /// última (en el resumen), no mientras aún se está en ella.
  int get porcentajeAvance =>
      _categorias.isEmpty ? 0 : ((_indice / _categorias.length) * 100).round();

  Future<void> cargar() async {
    if (_categorias.isNotEmpty) return;
    await _cargarDesdeAssets();
  }

  Future<void> _cargarDesdeAssets() async {
    try {
      final raw = await rootBundle.loadString('assets/checklist_seed.json');
      final List<dynamic> data = jsonDecode(raw);
      final seed = data
          .map((e) => ChecklistCategoriaSeed.fromMap(Map<String, dynamic>.from(e)))
          .toList()
        ..sort((a, b) => a.orden.compareTo(b.orden));

      _categorias = seed
          .map(
            (c) => ChecklistCategoriaState(
              nombre: c.categoria,
              items: c.items.map((texto) => ChecklistItemEntry(texto: _capitalizarPrimeraLetra(texto))).toList(),
            ),
          )
          .toList();
      _indice = 0;
      _error = null;
    } catch (e) {
      // Sin este catch, un catálogo de checklist corrupto deja la pestaña
      // girando en el spinner para siempre, sin ninguna pista de qué falló.
      _error = 'No se pudo cargar el checklist.\n\n$e';
    }
    _cargando = false;
    notifyListeners();
  }

  void toggleItem(int itemIndex) {
    final item = categoriaActual.items[itemIndex];
    item.cantidad = item.marcado ? 0 : 1;
    notifyListeners();
  }

  /// Ajusta cuántas unidades de un ítem se van a llevar — lo usa el stepper
  /// que aparece junto al casillero una vez marcado. Bajar a 0 equivale a
  /// desmarcarlo (sigue en la lista, solo que no se lleva).
  void setCantidad(int categoriaIndex, int itemIndex, int cantidad) {
    _categorias[categoriaIndex].items[itemIndex].cantidad = cantidad < 0 ? 0 : cantidad;
    notifyListeners();
  }

  /// Agrega un ítem nuevo a una categoría cualquiera (no solo la actual) —
  /// lo usa el resumen final, donde se ven y editan todas a la vez.
  void agregarItemEn(int categoriaIndex, String texto, {bool esProducto = false}) {
    final limpio = texto.trim();
    if (limpio.isEmpty) return;
    _categorias[categoriaIndex].items.add(
      ChecklistItemEntry(texto: _capitalizarPrimeraLetra(limpio), cantidad: 1, esExtra: true, esProducto: esProducto),
    );
    notifyListeners();
  }

  /// Elimina cualquier ítem de cualquier categoría (del Excel o agregado a
  /// mano) — quien llama es responsable de confirmar antes con el usuario.
  void eliminarItemEn(int categoriaIndex, int itemIndex) {
    _categorias[categoriaIndex].items.removeAt(itemIndex);
    notifyListeners();
  }

  void avanzar() {
    if (esUltimaCategoria) return;
    _indice++;
    notifyListeners();
  }

  void retroceder() {
    if (esPrimeraCategoria) return;
    _indice--;
    notifyListeners();
  }

  /// Solo permite saltar a categorías ya visitadas (hacia atrás) — avanzar
  /// siempre pasa por [avanzar], una por una, para no saltarse ninguna.
  void irACategoria(int i) {
    if (i < 0 || i > _indice) return;
    _indice = i;
    notifyListeners();
  }

  /// Serializa el estado actual de las categorías (con las cantidades y los
  /// extras) para guardarlo junto con el registro del historial.
  String categoriasAJson() => jsonEncode(_categorias.map((c) => c.toJson()).toList());

  /// Vuelve a armar todas las categorías desde cero (sin marcar, sin
  /// extras) para empezar un checklist nuevo.
  Future<void> reiniciar() async {
    _categorias = [];
    _cargando = true;
    notifyListeners();
    await _cargarDesdeAssets();
  }

  /// Texto plano listo para copiar y enviar por WhatsApp: un resumen con
  /// cada categoría, sus ítems (marcados o no) y las notas/productos que
  /// se hayan agregado aparte.
  String generarTextoResumen({String responsable = ''}) {
    final buffer = StringBuffer();
    final fecha = DateFormat('dd/MM/yyyy HH:mm').format(DateTime.now());
    buffer.writeln('✅ CHECKLIST DE OBRA — Inversiones ICR');
    if (responsable.trim().isNotEmpty) {
      buffer.writeln('Responsable: ${responsable.trim()}');
    }
    buffer.writeln('Fecha: $fecha');
    buffer.writeln('Total: $totalMarcados/$totalItems ítems marcados');

    for (final cat in _categorias) {
      buffer.writeln();
      buffer.writeln('${cat.nombre} (${cat.totalMarcados}/${cat.items.length})');
      for (final item in cat.items.where((i) => !i.esExtra)) {
        final cantidad = item.marcado ? ' × ${item.cantidad}' : '';
        buffer.writeln('${item.marcado ? '✅' : '⬜'} ${item.texto}$cantidad');
      }
      for (final item in cat.items.where((i) => i.esExtra)) {
        final cantidad = item.marcado ? ' × ${item.cantidad}' : '';
        buffer.writeln('➕ ${item.texto}$cantidad${item.esProducto ? ' (catálogo)' : ''}');
      }
    }
    return buffer.toString().trim();
  }
}
