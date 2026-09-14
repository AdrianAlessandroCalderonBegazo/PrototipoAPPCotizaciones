import 'package:flutter/material.dart';

/// Miniatura de producto para las listas de categoría y de cotización.
/// Antes de sincronizar por primera vez no hay servidor conocido (por eso
/// [url] puede ser null), así que siempre cae a un ícono de reemplazo en
/// vez de intentar una petición de red inválida.
class ProductoThumbnail extends StatelessWidget {
  final String? url;
  final double size;

  const ProductoThumbnail({super.key, required this.url, this.size = 48});

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Icon(
        Icons.inventory_2_outlined,
        size: size * 0.5,
        color: Theme.of(context).colorScheme.outline,
      ),
    );

    final imageUrl = url;
    if (imageUrl == null) return placeholder;

    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: Image.network(
        imageUrl,
        width: size,
        height: size,
        fit: BoxFit.cover,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return SizedBox(
            width: size,
            height: size,
            child: const Center(
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        },
        errorBuilder: (context, error, stack) => placeholder,
      ),
    );
  }
}
