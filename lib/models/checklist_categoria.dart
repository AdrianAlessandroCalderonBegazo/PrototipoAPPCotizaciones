/// Una categoría base del checklist de obra, tal como viene del catálogo
/// semilla (assets/checklist_seed.json), extraído del Excel real de la
/// empresa (herramientas y materiales para instalación Victron — 5
/// categorías, 89 ítems en total).
class ChecklistCategoriaSeed {
  final int orden;
  final String categoria;
  final List<String> items;

  ChecklistCategoriaSeed({
    required this.orden,
    required this.categoria,
    required this.items,
  });

  factory ChecklistCategoriaSeed.fromMap(Map<String, dynamic> map) {
    return ChecklistCategoriaSeed(
      orden: map['orden'] as int,
      categoria: map['categoria'] as String,
      items: List<String>.from(map['items'] as List),
    );
  }
}
