import 'package:flutter/foundation.dart';
import '../services/api_cliente.dart';
import '../services/db_helper.dart';

/// Quién está usando la app (solo con servidor) y qué puede hacer.
class Usuario {
  final int id;
  final String usuario;
  final String nombre;
  final String rol;

  /// Nivel del rol en cada módulo según la matriz de permisos del ERP:
  /// 'ninguno', 'lectura' o 'completo' (p. ej. {'logistica': 'completo'}).
  final Map<String, String> niveles;

  const Usuario({required this.id, required this.usuario, required this.nombre, required this.rol, this.niveles = const {}});

  factory Usuario.fromApi(Map<String, dynamic> m) => Usuario(
        id: (m['id'] as num).toInt(),
        usuario: (m['usuario'] ?? '').toString(),
        nombre: (m['nombre'] ?? '').toString(),
        rol: (m['rol'] ?? 'tecnico').toString(),
        niveles: {
          for (final e in Map<String, dynamic>.from((m['niveles'] as Map?) ?? const {}).entries) e.key: e.value.toString(),
        },
      );

  String get rolEtiqueta => rolesUsuario[rol] ?? rol;
}

const rolesUsuario = {
  'admin': 'Administrador',
  'ventas': 'Ventas',
  'contabilidad': 'Contabilidad',
  'tecnico': 'Técnico',
};

const _orden = {'ninguno': 0, 'lectura': 1, 'completo': 2};

/// Sesión de la persona que usa la app. Sin servidor no hay usuarios: todo
/// está permitido, como siempre. Con servidor, la matriz de permisos del ERP
/// (ERP › Configuración) decide qué botones se pueden usar (el servidor
/// también lo comprueba): con lectura en Logística se piden requerimientos y
/// se confirma lo recibido; con acceso completo además se aprueba, se alista
/// y se confirman salidas y devoluciones.
class AuthState extends ChangeNotifier {
  Usuario? _usuario;
  bool _cargando = true;

  Usuario? get usuario => _usuario;
  bool get cargando => _cargando;

  bool get _servidor => DbHelper.instance.esServidor;

  /// Con servidor, hay que ingresar antes de usar la app.
  bool get requiereIngreso => _servidor && _usuario == null;

  /// ¿El rol llega a ese nivel en el módulo? El administrador siempre.
  bool _nivel(String modulo, String minimo) {
    if (!_servidor) return true;
    final u = _usuario;
    if (u == null) return false;
    if (u.rol == 'admin') return true;
    return (_orden[u.niveles[modulo] ?? 'ninguno'] ?? 0) >= (_orden[minimo] ?? 2);
  }

  bool get puedeAprobar => _nivel('logistica', 'completo');
  bool get puedeAlistar => _nivel('logistica', 'completo');
  bool get puedeConfirmarSalida => _nivel('logistica', 'completo');
  bool get puedeConfirmarDevolucion => _nivel('logistica', 'completo');
  bool get puedeGestionarListas => _nivel('logistica', 'completo');
  bool get puedeEditarProductos => _nivel('cotizacion', 'completo');
  bool get esAdmin => !_servidor || _usuario?.rol == 'admin';

  /// Recupera la sesión guardada (si sigue vigente).
  Future<void> iniciar() async {
    if (!_servidor) {
      _cargando = false;
      notifyListeners();
      return;
    }
    try {
      await ApiCliente.instancia.cargar();
      if (ApiCliente.instancia.tieneSesion) {
        _usuario = Usuario.fromApi(Map<String, dynamic>.from(await ApiCliente.instancia.get('yo') as Map));
      }
    } on ApiError {
      _usuario = null;
    } finally {
      _cargando = false;
      notifyListeners();
    }
  }

  Future<void> entrar(String usuario, String clave) async {
    final datos = await ApiCliente.instancia.post('login', {'usuario': usuario.trim(), 'clave': clave}) as Map;
    await ApiCliente.instancia.guardarToken(datos['token'] as String);
    _usuario = Usuario.fromApi(Map<String, dynamic>.from(datos['usuario'] as Map));
    notifyListeners();
  }

  Future<void> salir() async {
    try {
      await ApiCliente.instancia.post('logout');
    } catch (_) {
      // Aunque el servidor no responda, en este dispositivo la sesión se cierra.
    }
    await olvidarSesion();
  }

  /// La sesión venció o se cerró: se vuelve a pedir el ingreso.
  Future<void> olvidarSesion() async {
    await ApiCliente.instancia.guardarToken(null);
    _usuario = null;
    notifyListeners();
  }

  Future<void> cambiarMiClave(String actual, String nueva) async {
    await ApiCliente.instancia.post('yo/clave', {'actual': actual, 'nueva': nueva});
  }
}
