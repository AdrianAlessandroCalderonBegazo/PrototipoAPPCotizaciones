import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/navegacion_state.dart';
import '../theme/app_text_styles.dart';
import '../theme/brand_colors.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/brand_icon.dart';
import 'config_screen.dart';

/// Pestaña "Home": punto de entrada rápido a Cotizaciones y Checklist. No
/// hay sistema de usuarios en la app, así que el saludo es genérico (no
/// un nombre inventado).
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.asset('assets/icon/icon.png', width: 40, height: 40),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Inversiones ICR',
                      style: AppTextStyles.subtitulo.copyWith(color: BrandColors.azulMarino),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  AnimatedPressable(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ConfigScreen())),
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        border: Border.all(color: BrandColors.grisApoyo.withValues(alpha: 0.35)),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(Icons.settings_outlined, color: BrandColors.azulMarino, size: 20),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              const Text('Hola,', style: TextStyle(color: BrandColors.cian, fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 2),
              Text('¡Bienvenido de vuelta!', style: AppTextStyles.titulo.copyWith(color: BrandColors.azulMarino)),
              const SizedBox(height: 4),
              const Text('¿Qué vas a hacer hoy?', style: AppTextStyles.apoyo),
              const SizedBox(height: 20),
              Expanded(
                child: Column(
                  children: [
                    Expanded(
                      child: _TarjetaGrande(
                        titulo: 'COTIZACIONES',
                        subtitulo: 'Elige productos por categoría\ny genera la cotización',
                        icono: const BrandIcon('documents.svg', color: Colors.white, size: 26),
                        colores: const [BrandColors.menta, BrandColors.cian],
                        onTap: () => context.read<NavegacionState>().irA(TabsApp.cotizar),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Expanded(
                      child: _TarjetaGrande(
                        titulo: 'CHECKLIST',
                        subtitulo: 'Revisa materiales y objetos\nde obra por categoría',
                        icono: const BrandIcon('clipboard.svg', color: Colors.white, size: 26),
                        colores: const [BrandColors.azulOscuro, BrandColors.azulMarino],
                        onTap: () => context.read<NavegacionState>().irA(TabsApp.checklist),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Botón grande de acceso directo: tarjeta con gradiente de marca, ícono
/// en una caja translúcida arriba y título/descripción abajo — pensada
/// para ocupar casi toda la pantalla entre dos (Cotizaciones/Checklist).
class _TarjetaGrande extends StatelessWidget {
  final String titulo;
  final String subtitulo;
  final Widget icono;
  final List<Color> colores;
  final VoidCallback onTap;

  const _TarjetaGrande({
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
      borderRadius: BorderRadius.circular(32),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: colores,
          ),
          borderRadius: BorderRadius.circular(32),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Center(child: icono),
            ),
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.bottomLeft,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(titulo, style: AppTextStyles.titulo.copyWith(color: Colors.white)),
                    const SizedBox(height: 6),
                    Text(
                      subtitulo,
                      style: AppTextStyles.cuerpo.copyWith(color: Colors.white.withValues(alpha: 0.85)),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
