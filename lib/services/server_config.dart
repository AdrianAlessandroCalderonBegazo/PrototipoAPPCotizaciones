import 'package:shared_preferences/shared_preferences.dart';

/// Lee la IP/puerto que el usuario guardó en la pantalla de Sincronizar
/// (las mismas prefs que usa ConfigScreen) para construir URLs — de la API
/// de sync y de las imágenes de los productos, que viven en el mismo
/// servidor local bajo /uploads.
class ServerConfig {
  ServerConfig._();

  static Future<String?> baseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final ip = prefs.getString('server_ip');
    if (ip == null || ip.trim().isEmpty) return null;
    final puerto = prefs.getString('server_port') ?? '3000';
    return 'http://${ip.trim()}:$puerto';
  }

  /// Null si no hay servidor configurado todavía o el producto no tiene
  /// imagen — en ambos casos la UI cae a un ícono de reemplazo.
  static String? imageUrl(String? baseUrl, String? archivoImagen) {
    if (baseUrl == null || archivoImagen == null || archivoImagen.isEmpty) {
      return null;
    }
    return '$baseUrl/uploads/$archivoImagen';
  }
}
