import 'dart:async';
import 'dart:convert';
import 'dart:io';
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

  // gemini-2.5-flash ya no está disponible para cuentas nuevas — Gemini
  // recomienda este modelo con la Interactions API (ver interpretarAudio).
  static const String _modelo = 'gemini-3.6-flash';

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
      'model': _modelo,
      'input': [
        {'type': 'text', 'text': prompt},
        {'type': 'audio', 'data': base64Encode(audioBytes), 'mime_type': 'audio/aac'},
      ],
      'response_format': {
        'type': 'text',
        'mime_type': 'application/json',
        'schema': {
          'type': 'object',
          'properties': {
            'transcripcion': {'type': 'string'},
            'items': {
              'type': 'array',
              'items': {
                'type': 'object',
                'properties': {
                  'producto_id': {'type': 'integer'},
                  'cantidad': {'type': 'integer'},
                },
                'required': ['producto_id', 'cantidad'],
              },
            },
          },
          'required': ['transcripcion', 'items'],
        },
      },
    });

    http.Response resp;
    try {
      resp = await (client ?? http.Client())
          .post(
            Uri.parse('https://generativelanguage.googleapis.com/v1beta/interactions'),
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': _apiKey,
              'Api-Revision': '2026-05-20',
            },
            body: cuerpo,
          )
          // El audio ya viaja comprimido (ver chat_screen.dart), así que este
          // margen es sobre todo para el procesamiento de Gemini, no la subida.
          .timeout(const Duration(seconds: 90));
    } on TimeoutException {
      throw Exception('El servicio de voz tardó demasiado en responder. Revisa tu conexión a internet e inténtalo de nuevo.');
    } on SocketException {
      throw Exception('No se pudo conectar con el servicio de voz. Revisa tu conexión a internet.');
    } on http.ClientException {
      throw Exception('No se pudo conectar con el servicio de voz. Revisa tu conexión a internet.');
    }

    if (resp.statusCode != 200) {
      throw Exception('Gemini respondió ${resp.statusCode}: ${resp.body}');
    }

    final data = jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
    final pasos = data['steps'] as List<dynamic>? ?? [];

    // Se busca el texto en el ÚLTIMO paso con contenido de tipo "text" —
    // normalmente el único paso que devuelve un POST es el de salida del
    // modelo, pero esto es robusto igual si algún día se incluyen más.
    String? textoJson;
    for (final paso in pasos.reversed) {
      final contenido = (paso as Map<String, dynamic>)['content'] as List<dynamic>? ?? [];
      for (final parte in contenido) {
        final mapaParte = parte as Map<String, dynamic>;
        if (mapaParte['type'] == 'text' && mapaParte['text'] != null) {
          textoJson = mapaParte['text'].toString();
          break;
        }
      }
      if (textoJson != null) break;
    }

    if (textoJson == null || textoJson.trim().isEmpty) {
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
