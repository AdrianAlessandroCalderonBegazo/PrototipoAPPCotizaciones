import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/producto.dart';

/// Única puerta de entrada a "internet" en toda la app. Se usa SOLO para
/// el botón de sincronizar — el resto de pantallas trabajan 100% con la
/// base de datos local (DbHelper), sin llamar a esto.
///
/// FASE 2: cuando exista una base de datos externa real, este es el único
/// archivo que habría que tocar (cambiar la URL / agregar autenticación).
class ApiService {
  static Future<List<Producto>> obtenerTodos(String baseUrl) async {
    final uri = Uri.parse('$baseUrl/api/productos/sync');
    final res = await http.get(uri).timeout(const Duration(seconds: 20));

    if (res.statusCode != 200) {
      throw Exception('El servidor respondió ${res.statusCode}');
    }

    final List<dynamic> data = jsonDecode(utf8.decode(res.bodyBytes));
    return data
        .map((e) => Producto.fromMap(Map<String, dynamic>.from(e)))
        .toList();
  }
}
