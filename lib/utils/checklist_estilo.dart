import 'package:flutter/material.dart';
import '../theme/brand_colors.dart';
import 'categoria_estilo.dart';

/// Ícono + color por cada una de las 5 categorías fijas del checklist de
/// obra (a diferencia de las categorías de producto, acá se sabe de
/// antemano cuáles son, así que se mapea directo por posición):
/// Conduit, Fotovoltaico, Eléctrico, Techo y Herramientas.
const List<CategoriaEstilo> _estilosChecklist = [
  CategoriaEstilo(Icons.plumbing, Color(0xFF475569)),
  CategoriaEstilo(Icons.solar_power, Color(0xFFF59E0B)),
  CategoriaEstilo(Icons.electrical_services, Color(0xFFCA8A04)),
  CategoriaEstilo(Icons.roofing, Color(0xFFB45309)),
  CategoriaEstilo(Icons.build_outlined, Color(0xFF57534E)),
];

CategoriaEstilo estiloDeCategoriaChecklist(int indice) {
  if (indice < 0 || indice >= _estilosChecklist.length) {
    return const CategoriaEstilo(Icons.checklist, BrandColors.azulMarino);
  }
  return _estilosChecklist[indice];
}

/// Quita el "N. " del inicio del nombre de categoría (que viene así del
/// Excel) para mostrarlo más limpio en pantalla — el número de categoría
/// ya se ve aparte, en la barra de progreso.
String quitarNumeroCategoria(String nombre) =>
    nombre.replaceFirst(RegExp(r'^\d+\.\s*'), '');
