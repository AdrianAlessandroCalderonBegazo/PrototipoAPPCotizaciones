class Producto {
  final int? id;
  final double? costo;
  final String nombre;
  final double? precioVenta;
  final String? referenciaInterna;
  final String? unidadMedida;
  final String categoriaProducto;
  final String? archivoImagen;
  final String? imagenUrl;

  Producto({
    this.id,
    this.costo,
    required this.nombre,
    this.precioVenta,
    this.referenciaInterna,
    this.unidadMedida,
    required this.categoriaProducto,
    this.archivoImagen,
    this.imagenUrl,
  });

  factory Producto.fromMap(Map<String, dynamic> map) {
    return Producto(
      id: map['id'] is int ? map['id'] as int : int.tryParse('${map['id']}'),
      costo: _toDouble(map['costo']),
      nombre: (map['nombre'] ?? '').toString(),
      precioVenta: _toDouble(map['precio_venta']),
      referenciaInterna: map['referencia_interna'],
      unidadMedida: map['unidad_medida'],
      categoriaProducto: (map['categoria_producto'] ?? 'SIN CATEGORIA').toString(),
      archivoImagen: map['archivo_imagen'],
      imagenUrl: map['imagen_url'],
    );
  }

  static double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is double) return v;
    if (v is int) return v.toDouble();
    return double.tryParse(v.toString());
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'costo': costo,
      'nombre': nombre,
      'precio_venta': precioVenta,
      'referencia_interna': referenciaInterna,
      'unidad_medida': unidadMedida,
      'categoria_producto': categoriaProducto,
      'archivo_imagen': archivoImagen,
      'imagen_url': imagenUrl,
    };
  }
}
