import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/producto.dart';
import '../services/db_helper.dart';
import '../theme/app_text_styles.dart';
import '../theme/brand_colors.dart';

const _unidadesMedida = ['Unidades', 'm', 'Otra'];

/// Formulario para agregar un producto nuevo a la base local — para lo que
/// no está en el catálogo empaquetado. Queda marcado como origen "local"
/// (ver DbHelper.agregarProductoManual), así nunca se borra si más adelante
/// se actualiza el catálogo base o se sincroniza con un servidor.
class AgregarProductoScreen extends StatefulWidget {
  final List<String> categorias;
  const AgregarProductoScreen({super.key, required this.categorias});

  @override
  State<AgregarProductoScreen> createState() => _AgregarProductoScreenState();
}

class _AgregarProductoScreenState extends State<AgregarProductoScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nombreController = TextEditingController();
  final _categoriaOtraController = TextEditingController();
  final _precioController = TextEditingController();
  final _costoController = TextEditingController();
  final _referenciaController = TextEditingController();
  final _unidadOtraController = TextEditingController();
  String? _categoriaSeleccionada;
  String _unidadSeleccionada = 'Unidades';
  bool _guardando = false;

  @override
  void dispose() {
    _nombreController.dispose();
    _categoriaOtraController.dispose();
    _precioController.dispose();
    _costoController.dispose();
    _referenciaController.dispose();
    _unidadOtraController.dispose();
    super.dispose();
  }

  String? get _categoriaEfectiva {
    if (_categoriaSeleccionada == null) return null;
    if (_categoriaSeleccionada == 'Otra') {
      final texto = _categoriaOtraController.text.trim();
      return texto.isEmpty ? null : texto.toUpperCase();
    }
    return _categoriaSeleccionada;
  }

  String? get _unidadEfectiva {
    final texto = _unidadSeleccionada == 'Otra' ? _unidadOtraController.text.trim() : _unidadSeleccionada;
    return texto.isEmpty ? null : texto;
  }

  double? _numero(String texto) => double.tryParse(texto.trim().replaceAll(',', '.'));

  Future<void> _guardar() async {
    final formOk = _formKey.currentState?.validate() ?? false;
    final categoria = _categoriaEfectiva;
    if (categoria == null || categoria.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Elige o escribe una categoría.')),
      );
      return;
    }
    if (!formOk) return;

    setState(() => _guardando = true);
    final producto = Producto(
      nombre: _nombreController.text.trim(),
      categoriaProducto: categoria,
      precioVenta: _numero(_precioController.text),
      costo: _costoController.text.trim().isEmpty ? null : _numero(_costoController.text),
      unidadMedida: _unidadEfectiva,
      referenciaInterna: _referenciaController.text.trim().isEmpty ? null : _referenciaController.text.trim(),
    );

    try {
      await DbHelper.instance.agregarProductoManual(producto);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar el producto: $e')),
      );
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Widget _tituloSeccion(String texto) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 6),
      child: Text(texto, style: AppTextStyles.etiqueta.copyWith(color: BrandColors.azulMarino)),
    );
  }

  Widget _etiqueta(String texto) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(texto, style: AppTextStyles.etiqueta),
    );
  }

  InputDecoration _decoracionCampo({String? hint}) {
    final borde = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
    );
    return InputDecoration(
      hintText: hint,
      isDense: true,
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: borde,
      enabledBorder: borde,
      errorBorder: borde.copyWith(borderSide: const BorderSide(color: Colors.red)),
    );
  }

  Widget _campo(
    String label,
    TextEditingController controller, {
    TextInputType? keyboardType,
    String? Function(String?)? validator,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _etiqueta(label),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          decoration: _decoracionCampo(),
          validator: validator,
        ),
      ],
    );
  }

  Widget _campoCategoria() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _etiqueta('CATEGORÍA'),
        DropdownButtonFormField<String>(
          initialValue: _categoriaSeleccionada,
          isExpanded: true,
          hint: const Text('Elegir', style: TextStyle(fontSize: 13)),
          decoration: _decoracionCampo(),
          items: [
            ...widget.categorias.map(
              (c) => DropdownMenuItem(value: c, child: Text(c, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13))),
            ),
            const DropdownMenuItem(value: 'Otra', child: Text('Otra (nueva categoría)', style: TextStyle(fontSize: 13))),
          ],
          onChanged: (v) => setState(() => _categoriaSeleccionada = v),
        ),
        if (_categoriaSeleccionada == 'Otra') ...[
          const SizedBox(height: 8),
          TextField(
            controller: _categoriaOtraController,
            textCapitalization: TextCapitalization.characters,
            decoration: _decoracionCampo(hint: 'Nombre de la categoría'),
          ),
        ],
      ],
    );
  }

  Widget _campoUnidad() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _etiqueta('UNIDAD DE MEDIDA'),
        DropdownButtonFormField<String>(
          initialValue: _unidadSeleccionada,
          isExpanded: true,
          decoration: _decoracionCampo(),
          items: _unidadesMedida.map((u) => DropdownMenuItem(value: u, child: Text(u, style: const TextStyle(fontSize: 13)))).toList(),
          onChanged: (v) {
            if (v != null) setState(() => _unidadSeleccionada = v);
          },
        ),
        if (_unidadSeleccionada == 'Otra') ...[
          const SizedBox(height: 8),
          TextField(
            controller: _unidadOtraController,
            decoration: _decoracionCampo(hint: 'Ej. kg, caja, rollo'),
          ),
        ],
      ],
    );
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
                color: BrandColors.azulMarino,
                borderRadius: BorderRadius.only(bottomLeft: Radius.circular(28), bottomRight: Radius.circular(28)),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 20, 20),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white, size: 18),
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('CATÁLOGO LOCAL', style: AppTextStyles.etiqueta.copyWith(color: Colors.white70)),
                            Text('Agregar producto', style: AppTextStyles.titulo.copyWith(color: Colors.white)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(
              child: Form(
                key: _formKey,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                  children: [
                    _tituloSeccion('DATOS DEL PRODUCTO'),
                    _campo(
                      'NOMBRE',
                      _nombreController,
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Ingresa el nombre del producto.' : null,
                    ),
                    const SizedBox(height: 12),
                    _campoCategoria(),
                    const SizedBox(height: 12),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: _campo(
                            'PRECIO DE VENTA (S/)',
                            _precioController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            validator: (v) {
                              final n = _numero(v ?? '');
                              if (n == null || n <= 0) return 'Ingresa un precio válido.';
                              return null;
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _campo(
                            'COSTO (S/, opcional)',
                            _costoController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: _campoUnidad()),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _campo('REFERENCIA (opcional)', _referenciaController),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant)),
                ),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _guardando ? null : _guardar,
                    style: FilledButton.styleFrom(
                      backgroundColor: BrandColors.azulMarino,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: const StadiumBorder(),
                    ),
                    child: _guardando
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('GUARDAR PRODUCTO', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.6)),
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
