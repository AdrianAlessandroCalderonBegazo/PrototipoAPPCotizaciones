import 'package:flutter/material.dart';

/// Envuelve cualquier widget tocable (tarjeta, botón) y le da un pequeño
/// "achicón" al presionar — el mismo feedback de press-state que se ve en
/// apps nativas modernas, para que la interfaz se sienta más viva.
class AnimatedPressable extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final BorderRadius? borderRadius;

  const AnimatedPressable({
    super.key,
    required this.child,
    this.onTap,
    this.borderRadius,
  });

  @override
  State<AnimatedPressable> createState() => _AnimatedPressableState();
}

class _AnimatedPressableState extends State<AnimatedPressable> {
  bool _presionado = false;

  void _setPresionado(bool v) {
    if (widget.onTap == null) return;
    setState(() => _presionado = v);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: (_) => _setPresionado(true),
      onTapUp: (_) => _setPresionado(false),
      onTapCancel: () => _setPresionado(false),
      child: AnimatedScale(
        scale: _presionado ? 0.97 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}
