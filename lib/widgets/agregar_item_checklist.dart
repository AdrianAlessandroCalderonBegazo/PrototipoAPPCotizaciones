import 'package:flutter/material.dart';
import '../models/producto.dart';
import '../state/checklist_state.dart';
import '../theme/brand_colors.dart';
import 'buscador_productos.dart';

/// Hoja para agregar un ítem a una categoría del checklist — a mano o
/// buscando en el catálogo. La usan tanto la pantalla de cada categoría
/// como el resumen final, así que vive en un solo lugar.
Future<void> mostrarAgregarItemChecklist(
  BuildContext context, {
  required ChecklistState checklist,
  required int categoriaIndex,
  required String nombreCategoria,
}) {
  final controller = TextEditingController();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Agregar ítem a "$nombreCategoria"',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: BrandColors.azulMarino),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              autofocus: true,
              onSubmitted: (texto) {
                if (texto.trim().isEmpty) return;
                checklist.agregarItemEn(categoriaIndex, texto);
                Navigator.pop(ctx);
              },
              decoration: InputDecoration(
                hintText: 'Nombre del ítem',
                filled: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      final producto = await showModalBottomSheet<Producto>(
                        context: ctx,
                        isScrollControlled: true,
                        backgroundColor: Colors.transparent,
                        builder: (_) => const BuscadorProductos(titulo: 'Buscar en el catálogo'),
                      );
                      if (producto != null) {
                        checklist.agregarItemEn(categoriaIndex, producto.nombre, esProducto: true);
                        if (ctx.mounted) Navigator.pop(ctx);
                      }
                    },
                    icon: const Icon(Icons.search, size: 18),
                    label: const Text('Del catálogo'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      side: const BorderSide(color: BrandColors.cian),
                      foregroundColor: BrandColors.azulMarino,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () {
                      if (controller.text.trim().isEmpty) return;
                      checklist.agregarItemEn(categoriaIndex, controller.text);
                      Navigator.pop(ctx);
                    },
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('Agregar'),
                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 13)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}
