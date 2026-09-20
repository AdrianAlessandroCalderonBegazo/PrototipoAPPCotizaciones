import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/db_helper.dart';
import 'state/checklist_state.dart';
import 'state/cotizacion_state.dart';
import 'state/navegacion_state.dart';
import 'screens/main_tabs_screen.dart';
import 'theme/brand_colors.dart';

void main() {
  runApp(const CotizadorApp());
}

class CotizadorApp extends StatelessWidget {
  const CotizadorApp({super.key});

  @override
  Widget build(BuildContext context) {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: BrandColors.cian,
      primary: BrandColors.cian,
      onPrimary: Colors.white,
      secondary: BrandColors.menta,
      onSecondary: BrandColors.azulMarino,
      tertiary: BrandColors.azulOscuro,
      onTertiary: Colors.white,
    );

    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => CotizacionState()),
        ChangeNotifierProvider(create: (_) => ChecklistState()),
        ChangeNotifierProvider(create: (_) => NavegacionState()),
      ],
      child: MaterialApp(
        title: 'Cotizador ICR',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          fontFamily: 'Manrope',
          colorScheme: colorScheme,
          appBarTheme: const AppBarTheme(
            backgroundColor: BrandColors.azulMarino,
            foregroundColor: Colors.white,
          ),
          floatingActionButtonTheme: const FloatingActionButtonThemeData(
            backgroundColor: BrandColors.cian,
            foregroundColor: Colors.white,
          ),
          navigationBarTheme: NavigationBarThemeData(
            indicatorColor: BrandColors.cian,
            iconTheme: WidgetStateProperty.resolveWith(
              (states) => states.contains(WidgetState.selected)
                  ? const IconThemeData(color: Colors.white)
                  : null,
            ),
          ),
        ),
        home: const _Splash(),
      ),
    );
  }
}

class _Splash extends StatefulWidget {
  const _Splash();

  @override
  State<_Splash> createState() => _SplashState();
}

class _SplashState extends State<_Splash> {
  Object? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  // Primer arranque: si el celular no tiene datos guardados aún, los toma
  // del catálogo que viene empaquetado dentro de la propia app
  // (assets/productos_seed.json) — así funciona sin red desde el día 1.
  Future<void> _cargar() async {
    try {
      await DbHelper.instance.seedFromAssetsIfEmpty();
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const MainTabsScreen()),
      );
    } catch (error) {
      // Sin esto, un catálogo semilla corrupto deja la app en este
      // spinner para siempre, sin ninguna pista de qué falló.
      if (!mounted) return;
      setState(() => _error = error);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'No se pudo cargar el catálogo inicial.\n\n$_error',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: BrandColors.cian),
            SizedBox(height: 16),
            Text('Cargando catálogo...', style: TextStyle(color: BrandColors.azulMarino)),
          ],
        ),
      ),
    );
  }
}
