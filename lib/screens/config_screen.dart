import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../services/db_helper.dart';

class ConfigScreen extends StatefulWidget {
  const ConfigScreen({super.key});
  @override
  State<ConfigScreen> createState() => _ConfigScreenState();
}

class _ConfigScreenState extends State<ConfigScreen> {
  final _ipController = TextEditingController();
  final _puertoController = TextEditingController(text: '3000');
  bool _sincronizando = false;
  String? _mensaje;
  bool _mensajeOk = false;
  int _totalLocal = 0;

  @override
  void initState() {
    super.initState();
    _cargarPrefs();
  }

  Future<void> _cargarPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    _ipController.text = prefs.getString('server_ip') ?? '';
    _puertoController.text = prefs.getString('server_port') ?? '3000';
    final total = await DbHelper.instance.countTotal();
    if (!mounted) return;
    setState(() => _totalLocal = total);
  }

  Future<void> _sincronizar() async {
    final ip = _ipController.text.trim();
    final puerto = _puertoController.text.trim();

    if (ip.isEmpty) {
      setState(() {
        _mensaje = 'Ingresa la IP de tu máquina.';
        _mensajeOk = false;
      });
      return;
    }

    setState(() {
      _sincronizando = true;
      _mensaje = null;
    });

    final baseUrl = 'http://$ip:$puerto';

    try {
      final productos = await ApiService.obtenerTodos(baseUrl);
      await DbHelper.instance.replaceAll(productos);

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('server_ip', ip);
      await prefs.setString('server_port', puerto);

      if (!mounted) return;
      setState(() {
        _mensaje = 'Sincronizado: ${productos.length} productos.';
        _mensajeOk = true;
        _totalLocal = productos.length;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _mensaje =
            'No se pudo conectar. Revisa que el celular esté en la misma red WiFi que tu PC y que el servidor (npm start) esté corriendo.\n\nDetalle: $e';
        _mensajeOk = false;
      });
    } finally {
      if (mounted) setState(() => _sincronizando = false);
    }
  }

  @override
  void dispose() {
    _ipController.dispose();
    _puertoController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sincronizar catálogo')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Productos guardados en este celular: $_totalLocal'),
            const SizedBox(height: 20),
            const Text(
              'Escribe la IP local de la PC donde corre tu servidor '
              '(la ves con "ipconfig" en Windows, busca "Dirección IPv4"). '
              'El celular debe estar conectado al mismo WiFi que la PC.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _ipController,
              decoration: const InputDecoration(
                labelText: 'IP de tu máquina',
                hintText: 'Ej. 192.168.1.15',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _puertoController,
              decoration: const InputDecoration(
                labelText: 'Puerto',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _sincronizando ? null : _sincronizar,
              icon: _sincronizando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.sync),
              label: Text(_sincronizando ? 'Sincronizando...' : 'Sincronizar ahora'),
            ),
            if (_mensaje != null) ...[
              const SizedBox(height: 16),
              Text(
                _mensaje!,
                style: TextStyle(
                  color: _mensajeOk ? Colors.green[700] : Colors.red[700],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
