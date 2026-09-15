import 'package:flutter/material.dart';
import '../theme/brand_colors.dart';
import 'categoria_estilo.dart';

/// Ícono + color por cada una de las 10 categorías fijas del checklist de
/// obra (a diferencia de las categorías de producto, acá se sabe de
/// antemano cuáles son las 10, así que se mapea directo por posición).
const List<CategoriaEstilo> _estilosChecklist = [
  CategoriaEstilo(Icons.health_and_safety_outlined, Color(0xFFEF4444)),
  CategoriaEstilo(Icons.electrical_services, Color(0xFFF59E0B)),
  CategoriaEstilo(Icons.content_cut, Color(0xFF0891B2)),
  CategoriaEstilo(Icons.build_outlined, Color(0xFF57534E)),
  CategoriaEstilo(Icons.view_in_ar_outlined, Color(0xFF6366F1)),
  CategoriaEstilo(Icons.solar_power, BrandColors.azulOscuro),
  CategoriaEstilo(Icons.battery_charging_full, Color(0xFF10B981)),
  CategoriaEstilo(Icons.electric_bolt, Color(0xFFCA8A04)),
  CategoriaEstilo(Icons.cable, Color(0xFF475569)),
  CategoriaEstilo(Icons.inventory_2_outlined, BrandColors.azulMarino),
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
