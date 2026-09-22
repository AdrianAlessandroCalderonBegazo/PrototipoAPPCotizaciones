import 'package:flutter/foundation.dart';

/// Índice de cada pestaña — en un solo lugar para no repetir "números
/// mágicos" en cada pantalla que necesita cambiar de pestaña.
class TabsApp {
  TabsApp._();
  static const historial = 0;
  static const cotizar = 1;
  static const home = 2;
  static const checklist = 3;
  static const voz = 4;
}

/// Controla qué pestaña está activa en MainTabsScreen. Al vivir en un
/// Provider (no como estado local de MainTabsScreen), cualquier pantalla
/// empujada en profundidad — como la confirmación al crear una cotización
/// o un checklist — puede pedir "volver al inicio" sin necesitar un
/// callback pasado a mano por cada nivel de navegación.
class NavegacionState extends ChangeNotifier {
  int _indice = TabsApp.home;
  int get indice => _indice;

  void irA(int indice) {
    if (_indice == indice) return;
    _indice = indice;
    notifyListeners();
  }
}
