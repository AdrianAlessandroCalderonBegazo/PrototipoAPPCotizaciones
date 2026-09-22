import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:speech_to_text/speech_to_text.dart';
import '../services/buscador_voz.dart';
import '../services/db_helper.dart';
import '../theme/app_text_styles.dart';
import '../theme/brand_colors.dart';
import '../widgets/animated_pressable.dart';
import '../widgets/lottie_gate_screen.dart';
import 'revision_voz_screen.dart';

/// Pestaña "Voz": arma una cotización dictando el pedido. El propio
/// celular transcribe la voz (sin mandar audio a ningún servicio) y ese
/// texto se busca contra el catálogo local para identificar qué productos
/// se pidieron y cuántos; antes de generar nada se pasa por
/// RevisionVozScreen para confirmar o corregir.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _speech = SpeechToText();
  bool _grabando = false;
  String _texto = '';
  Duration _duracion = Duration.zero;
  Timer? _cronometro;
  String? _localeId;

  @override
  void dispose() {
    _cronometro?.cancel();
    _speech.stop();
    super.dispose();
  }

  Future<String?> _elegirLocaleEspanol() async {
    final locales = await _speech.locales();
    final espanol = locales.where((l) => l.localeId.toLowerCase().startsWith('es')).toList();
    if (espanol.isEmpty) return null;
    final pe = espanol.where((l) => l.localeId.toLowerCase().contains('pe'));
    return (pe.isNotEmpty ? pe.first : espanol.first).localeId;
  }

  Future<void> _alternarGrabacion() async {
    if (_grabando) {
      await _speech.stop();
      _cronometro?.cancel();
      if (!mounted) return;
      setState(() => _grabando = false);
      final texto = _texto.trim();
      if (texto.isNotEmpty) _procesar(texto);
      return;
    }

    final disponible = await _speech.initialize();
    if (!disponible) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo activar el reconocimiento de voz en este celular (revisa el permiso de micrófono).')),
      );
      return;
    }

    _localeId ??= await _elegirLocaleEspanol();
    if (!mounted) return;

    setState(() {
      _grabando = true;
      _duracion = Duration.zero;
      _texto = '';
    });
    _cronometro = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _duracion += const Duration(seconds: 1));
    });

    await _speech.listen(
      onResult: (resultado) {
        if (mounted) setState(() => _texto = resultado.recognizedWords);
      },
      listenOptions: SpeechListenOptions(
        localeId: _localeId,
        listenMode: ListenMode.dictation,
        listenFor: const Duration(minutes: 2),
        pauseFor: const Duration(seconds: 8),
      ),
    );
  }

  Future<(String, List<ItemDetectado>)> _proceso(String texto) async {
    final agrupado = await DbHelper.instance.getTodosAgrupados();
    final catalogo = agrupado.values.expand((lista) => lista).toList();
    final items = BuscadorVoz.buscar(texto: texto, catalogo: catalogo);
    return (texto, items);
  }

  Future<void> _procesar(String texto) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LottieGateScreen<(String, List<ItemDetectado>)>(
          lottieAsset: 'assets/animations/verification.lottie',
          mensaje: 'Buscando en el catálogo...',
          proceso: () => _proceso(texto),
          alTerminar: (context, resultado) {
            final (transcripcion, items) = resultado;
            Navigator.of(context).pop();
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => RevisionVozScreen(transcripcion: transcripcion, items: items),
              ),
            );
          },
          alFallar: (context, error) {
            Navigator.of(context).pop();
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('No se pudo procesar el pedido: $error')),
            );
          },
        ),
      ),
    );
  }

  String _formatoDuracion(Duration d) {
    final minutos = d.inMinutes.toString().padLeft(2, '0');
    final segundos = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$minutos:$segundos';
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: Column(
          children: [
            Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                color: BrandColors.cian,
                borderRadius: BorderRadius.only(bottomLeft: Radius.circular(28), bottomRight: Radius.circular(28)),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('COTIZAR POR VOZ', style: AppTextStyles.etiqueta.copyWith(color: Colors.white70)),
                      const SizedBox(height: 4),
                      Text('Dicta tu pedido', style: AppTextStyles.titulo.copyWith(color: Colors.white)),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AnimatedPressable(
                        onTap: _alternarGrabacion,
                        borderRadius: BorderRadius.circular(60),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          width: 120,
                          height: 120,
                          decoration: BoxDecoration(
                            color: _grabando ? const Color(0xFFDC2626) : BrandColors.cian,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: (_grabando ? const Color(0xFFDC2626) : BrandColors.cian).withValues(alpha: 0.3),
                                blurRadius: 24,
                                spreadRadius: 4,
                              ),
                            ],
                          ),
                          child: Icon(
                            _grabando ? Icons.stop_rounded : Icons.mic_rounded,
                            color: Colors.white,
                            size: 48,
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        _grabando ? _formatoDuracion(_duracion) : 'Toca para grabar',
                        style: _grabando
                            ? const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: BrandColors.azulMarino)
                            : AppTextStyles.subtitulo.copyWith(color: BrandColors.azulMarino),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _grabando
                            ? (_texto.isEmpty ? 'Escuchando...' : _texto)
                            : 'Menciona los productos y cantidades que necesitas — luego revisas antes de generar la cotización.',
                        textAlign: TextAlign.center,
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                        style: AppTextStyles.apoyo,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
