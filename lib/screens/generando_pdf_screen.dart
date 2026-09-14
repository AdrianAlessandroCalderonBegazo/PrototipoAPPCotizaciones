import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import '../theme/brand_colors.dart';

/// Pantalla de transición mientras se arma el PDF: bloquea el botón atrás
/// para no interrumpir el proceso a medio camino, y quien la llamó decide
/// cuánto tiempo mantenerla en pantalla (para que la animación se note
/// incluso si el PDF se genera casi al instante).
class GenerandoPdfScreen extends StatelessWidget {
  const GenerandoPdfScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: BrandColors.azulMarino,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Lottie.asset(
                'assets/animations/verification.lottie',
                width: 220,
                height: 220,
                repeat: false,
              ),
              const SizedBox(height: 20),
              const Text(
                'Generando tu cotización...',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
