import 'package:flutter/material.dart';

/// Título de dos líneas para las barras superiores: el nombre de la
/// empresa arriba y el nombre de la pantalla actual debajo, en chico.
class BrandAppBarTitle extends StatelessWidget {
  final String subtitulo;

  const BrandAppBarTitle({super.key, required this.subtitulo});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text(
          'Inversiones ICR',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
        ),
        Text(
          subtitulo,
          style: TextStyle(
            fontSize: 12,
            color: Colors.white.withValues(alpha: 0.75),
          ),
        ),
      ],
    );
  }
}
