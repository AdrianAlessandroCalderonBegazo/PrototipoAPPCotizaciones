import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'checklist_categoria.dart';

/// Una herramienta dentro de una maleta armada. [imagen] es el nombre del
/// archivo dentro de la carpeta de la maleta (algunas no tienen foto).
class ItemMaleta {
  final String nombre;
  final String? imagen;

  const ItemMaleta({required this.nombre, this.imagen});
}

/// Un nivel / compartimento de la maleta, con lo que lleva.
class CategoriaMaleta {
  final String nombre;
  final List<ItemMaleta> items;

  const CategoriaMaleta({required this.nombre, required this.items});
}

/// Maleta de herramientas ya armada (ej. "Maleta 1"): sale completa a obra,
/// sin tener que recorrer el checklist ítem por ítem. Viene de
/// assets/maletas/maletas.json (armado desde el CSV de la empresa) y sus
/// fotos de assets/maletas/<carpeta>/.
class Maleta {
  final String nombre;
  final String carpeta;
  final List<CategoriaMaleta> categorias;

  const Maleta({required this.nombre, required this.carpeta, required this.categorias});

  int get totalItems => categorias.fold(0, (s, c) => s + c.items.length);

  String? rutaImagen(ItemMaleta item) => item.imagen == null ? null : 'assets/maletas/$carpeta/${item.imagen}';

  /// Lo que se guarda en el checklist de herramientas: cada herramienta de
  /// la maleta con cantidad 1 y su foto, agrupada por nivel.
  List<ChecklistCategoriaState> comoCategoriasChecklist() => [
        for (final c in categorias)
          ChecklistCategoriaState(
            nombre: c.nombre,
            items: [
              for (final i in c.items) ChecklistItemEntry(texto: i.nombre, cantidad: 1, imagen: rutaImagen(i)),
            ],
          ),
      ];

  factory Maleta.fromMap(Map<String, dynamic> map) => Maleta(
        nombre: (map['nombre'] ?? '').toString(),
        carpeta: (map['carpeta'] ?? '').toString(),
        categorias: [
          for (final c in (map['categorias'] as List? ?? []))
            CategoriaMaleta(
              nombre: (c['nombre'] ?? '').toString(),
              items: [
                for (final i in (c['items'] as List? ?? []))
                  ItemMaleta(nombre: (i['nombre'] ?? '').toString(), imagen: i['imagen'] as String?),
              ],
            ),
        ],
      );
}

Future<List<Maleta>> cargarMaletas() async {
  final raw = await rootBundle.loadString('assets/maletas/maletas.json');
  return [for (final m in jsonDecode(raw) as List) Maleta.fromMap(Map<String, dynamic>.from(m))];
}
