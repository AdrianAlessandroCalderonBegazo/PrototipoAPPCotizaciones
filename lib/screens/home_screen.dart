import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/navegacion_state.dart';
import '../theme/brand_colors.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/brand_icon.dart';

/// Pestaña "Home": punto de entrada rápido a Cotizaciones y Checklist. No
/// hay sistema de usuarios en la app, así que el saludo es genérico (no
/// un nombre inventado).
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
          children: [
            Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.asset('assets/icon/icon.png', width: 44, height: 44),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Inversiones ICR',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                          color: BrandColors.azulMarino,
                        ),
                      ),
                      Text(
                        '¡Bienvenido de vuelta!',
                        style: TextStyle(fontSize: 13, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 28),
            const Text(
              '¿Qué necesitas hacer hoy?',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: BrandColors.azulMarino),
            ),
            const SizedBox(height: 14),
            _TarjetaAccesoDirecto(
              titulo: 'Cotizaciones',
              subtitulo: 'Arma una cotización con el catálogo completo',
              icono: const BrandIcon('documents.svg', color: Colors.white, size: 28),
              colores: const [BrandColors.cian, BrandColors.azulOscuro],
              onTap: () => context.read<NavegacionState>().irA(TabsApp.cotizar),
            ),
            const SizedBox(height: 16),
            _TarjetaAccesoDirecto(
              titulo: 'Checklist',
              subtitulo: 'Revisa todo antes de salir a obra',
              icono: const BrandIcon('clipboard.svg', color: Colors.white, size: 28),
              colores: const [BrandColors.azulMarino, BrandColors.azulOscuro],
              onTap: () => context.read<NavegacionState>().irA(TabsApp.checklist),
            ),
          ],
        ),
      ),
    );
  }
}

class _TarjetaAccesoDirecto extends StatelessWidget {
  final String titulo;
  final String subtitulo;
  final Widget icono;
  final List<Color> colores;
  final VoidCallback onTap;

  const _TarjetaAccesoDirecto({
    required this.titulo,
    required this.subtitulo,
    required this.icono,
    required this.colores,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedPressable(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: colores, begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: colores.last.withValues(alpha: 0.35),
              blurRadius: 16,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Center(child: icono),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titulo,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitulo,
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios, color: Colors.white, size: 16),
          ],
        ),
      ),
    );
  }
}
