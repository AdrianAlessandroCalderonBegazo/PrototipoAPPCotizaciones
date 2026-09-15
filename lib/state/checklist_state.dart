import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/intl.dart';
import '../models/checklist_categoria.dart';

/// Un ítem dentro de una categoría del checklist: puede venir del catálogo
/// base (Excel) o haberse agregado a mano desde "¿Te olvidaste de algo?"
/// (en cuyo caso [esExtra] es true, y [esProducto] indica si vino del
/// buscador del catálogo de productos en vez de ser una nota libre).
class ChecklistItemEntry {
  final String texto;
  bool marcado;
  final bool esExtra;
  final bool esProducto;

  ChecklistItemEntry({
    required this.texto,
    this.marcado = false,
    this.esExtra = false,
    this.esProducto = false,
  });
}

class ChecklistCategoriaState {
  final String nombre;
  final List<ChecklistItemEntry> items;

  ChecklistCategoriaState({required this.nombre, required this.items});

  int get totalMarcados => items.where((i) => i.marcado).length;
}

/// Estado del checklist de obra: carga las 10 categorías base una sola vez
/// y controla el avance secuencial (categoría por categoría, obligatorio
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
              items: c.items.map((texto) => ChecklistItemEntry(texto: texto)).toList(),
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
    item.marcado = !item.marcado;
    notifyListeners();
  }

  /// Agrega un ítem nuevo a una categoría cualquiera (no solo la actual) —
  /// lo usa el resumen final, donde se ven y editan las 10 a la vez.
  void agregarItemEn(int categoriaIndex, String texto, {bool esProducto = false}) {
    final limpio = texto.trim();
    if (limpio.isEmpty) return;
    _categorias[categoriaIndex].items.add(
      ChecklistItemEntry(texto: limpio, marcado: true, esExtra: true, esProducto: esProducto),
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
        buffer.writeln('${item.marcado ? '✅' : '⬜'} ${item.texto}');
      }
      for (final item in cat.items.where((i) => i.esExtra)) {
        buffer.writeln('➕ ${item.texto}${item.esProducto ? ' (catálogo)' : ''}');
      }
    }
    return buffer.toString().trim();
  }
}
