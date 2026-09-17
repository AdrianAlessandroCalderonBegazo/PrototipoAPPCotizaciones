import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/navegacion_state.dart';
import '../theme/app_text_styles.dart';
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
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Inversiones ICR', style: AppTextStyles.subtitulo.copyWith(color: BrandColors.azulMarino)),
                      const Text('¡Bienvenido de vuelta!', style: AppTextStyles.apoyo),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 28),
            Text('¿Qué necesitas hacer hoy?', style: AppTextStyles.subtitulo.copyWith(color: BrandColors.azulMarino)),
            const SizedBox(height: 14),
            _TarjetaAccesoDirecto(
              titulo: 'Cotizaciones',
              subtitulo: 'Arma una cotización con el catálogo completo',
              icono: const BrandIcon('documents.svg', color: Colors.white, size: 24),
              colorIcono: BrandColors.cian,
              onTap: () => context.read<NavegacionState>().irA(TabsApp.cotizar),
            ),
            const SizedBox(height: 14),
            _TarjetaAccesoDirecto(
              titulo: 'Checklist',
              subtitulo: 'Revisa todo antes de salir a obra',
              icono: const BrandIcon('clipboard.svg', color: Colors.white, size: 24),
              colorIcono: BrandColors.azulMarino,
              onTap: () => context.read<NavegacionState>().irA(TabsApp.checklist),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Tarjeta de acceso" del sistema de diseño: fondo celeste pálido, ícono
/// en una caja de color sólido, título/descripción y "Ver ›" a la derecha.
class _TarjetaAccesoDirecto extends StatelessWidget {
  final String titulo;
  final String subtitulo;
  final Widget icono;
  final Color colorIcono;
  final VoidCallback onTap;

  const _TarjetaAccesoDirecto({
    required this.titulo,
    required this.subtitulo,
    required this.icono,
    required this.colorIcono,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedPressable(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: BrandColors.celeste,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: colorIcono, borderRadius: BorderRadius.circular(14)),
              child: Center(child: icono),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(titulo, style: AppTextStyles.subtitulo.copyWith(color: BrandColors.azulMarino)),
                  const SizedBox(height: 3),
                  Text(subtitulo, style: AppTextStyles.apoyo),
                ],
              ),
            ),
            const SizedBox(width: 6),
            const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Ver', style: TextStyle(color: BrandColors.cian, fontWeight: FontWeight.bold, fontSize: 13)),
                Icon(Icons.chevron_right, color: BrandColors.cian, size: 18),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
