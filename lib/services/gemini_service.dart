import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/producto.dart';

/// Un producto que Gemini reconoció en el audio, ya resuelto contra el
/// catálogo real (nunca un producto o precio inventado por el modelo).
class ItemDetectado {
  final Producto producto;
  int cantidad;
  ItemDetectado({required this.producto, required this.cantidad});
}

class ResultadoInterpretacionVoz {
  final String transcripcion;
  final List<ItemDetectado> items;
  ResultadoInterpretacionVoz({required this.transcripcion, required this.items});
}

/// Interpreta un pedido de cotización dicho por voz usando la API de
/// Gemini: el audio se manda directo (Gemini transcribe internamente, sin
/// un servicio de voz-a-texto aparte) junto con el catálogo local, y
/// devuelve la transcripción y los productos que reconoció con sus
/// cantidades — usando siempre el id real del catálogo, nunca inventando
/// un producto o un precio.
class GeminiService {
  GeminiService._();

  static const String _modelo = 'gemini-2.5-flash';

  // Se inyecta en tiempo de compilación con --dart-define=GEMINI_API_KEY=...
  // (ver .github/workflows/build_apk.yml) — nunca queda escrita en el
  // código fuente ni en el historial de git.
  static const String _apiKey = String.fromEnvironment('GEMINI_API_KEY');

  static bool get configurado => _apiKey.isNotEmpty;

  static Future<ResultadoInterpretacionVoz> interpretarAudio({
    required List<int> audioBytes,
    required List<Producto> catalogo,
    http.Client? client,
  }) async {
    if (!configurado) {
      throw Exception('La cotización por voz no está configurada todavía (falta la clave de Gemini).');
    }

    final catalogoTexto = catalogo.where((p) => p.id != null).map((p) => '${p.id}: ${p.nombre}').join('\n');

    final prompt = '''
Eres un asistente que arma cotizaciones para Inversiones ICR, una empresa peruana de instalaciones solares y seguridad electrónica.

Vas a recibir un audio en español donde alguien dicta los productos que necesita para un trabajo. Tu tarea:
1. Transcribe el audio tal cual se dijo.
2. Identifica qué productos del catálogo de abajo se están pidiendo y cuántas unidades de cada uno (si no se menciona cantidad, usa 1).
3. Usa EXACTAMENTE el id del catálogo para cada producto que reconozcas. Si algo que se pide no está en el catálogo, ignóralo — nunca inventes un id ni un nombre de producto que no esté en la lista.

Catálogo disponible (id: nombre):
$catalogoTexto
''';

    final cuerpo = jsonEncode({
      'contents': [
        {
          'parts': [
            {'text': prompt},
            {
              'inline_data': {'mime_type': 'audio/wav', 'data': base64Encode(audioBytes)},
            },
          ],
        },
      ],
      'generationConfig': {
        'response_mime_type': 'application/json',
        'response_schema': {
          'type': 'OBJECT',
          'properties': {
            'transcripcion': {'type': 'STRING'},
            'items': {
              'type': 'ARRAY',
              'items': {
                'type': 'OBJECT',
                'properties': {
                  'producto_id': {'type': 'INTEGER'},
                  'cantidad': {'type': 'INTEGER'},
                },
                'required': ['producto_id', 'cantidad'],
              },
            },
          },
          'required': ['transcripcion', 'items'],
        },
      },
    });

    final resp = await (client ?? http.Client())
        .post(
          Uri.parse('https://generativelanguage.googleapis.com/v1beta/models/$_modelo:generateContent'),
          headers: {'Content-Type': 'application/json', 'x-goog-api-key': _apiKey},
          body: cuerpo,
        )
        .timeout(const Duration(seconds: 45));

    if (resp.statusCode != 200) {
      throw Exception('Gemini respondió ${resp.statusCode}: ${resp.body}');
    }

    final data = jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
    final candidatos = data['candidates'] as List<dynamic>?;
    if (candidatos == null || candidatos.isEmpty) {
      throw Exception('Gemini no devolvió ninguna respuesta para este audio.');
    }
    final partes = (candidatos.first['content']?['parts'] as List<dynamic>?) ?? [];
    final textoJson = partes.map((p) => p['text']?.toString() ?? '').join();
    if (textoJson.trim().isEmpty) {
      throw Exception('Gemini no devolvió contenido para este audio.');
    }

    final resultado = jsonDecode(textoJson) as Map<String, dynamic>;
    final transcripcion = (resultado['transcripcion'] ?? '').toString().trim();
    final itemsJson = resultado['items'] as List<dynamic>? ?? [];

    final porId = {for (final p in catalogo) if (p.id != null) p.id!: p};
    final items = <ItemDetectado>[];
    for (final entrada in itemsJson) {
      final mapa = Map<String, dynamic>.from(entrada as Map);
      final id = mapa['producto_id'] is int ? mapa['producto_id'] as int : int.tryParse('${mapa['producto_id']}');
      final cantidad = mapa['cantidad'] is int ? mapa['cantidad'] as int : int.tryParse('${mapa['cantidad']}') ?? 1;
      final producto = id == null ? null : porId[id];
      if (producto != null && cantidad > 0) {
        items.add(ItemDetectado(producto: producto, cantidad: cantidad));
      }
    }

    return ResultadoInterpretacionVoz(transcripcion: transcripcion, items: items);
  }
}
