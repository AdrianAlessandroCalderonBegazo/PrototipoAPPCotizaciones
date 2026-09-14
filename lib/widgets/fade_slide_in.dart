import 'package:flutter/material.dart';

/// Hace que un elemento de lista aparezca con un pequeño desvanecido +
/// deslizamiento hacia arriba, escalonado por [index] — le da vida a listas
/// que si no aparecen todas de golpe.
class FadeSlideIn extends StatelessWidget {
  final Widget child;
  final int index;

  const FadeSlideIn({super.key, required this.child, this.index = 0});

  @override
  Widget build(BuildContext context) {
    final duracion = Duration(milliseconds: 250 + (index * 50).clamp(0, 300));
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: duracion,
      curve: Curves.easeOutCubic,
      builder: (context, valor, hijo) => Opacity(
        opacity: valor,
        child: Transform.translate(
          offset: Offset(0, (1 - valor) * 14),
          child: hijo,
        ),
      ),
      child: child,
    );
  }
}
