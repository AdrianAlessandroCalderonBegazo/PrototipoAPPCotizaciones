import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import '../models/producto.dart';

/// Toda la app le pide productos a este helper, sin saber si vienen del
/// JSON semilla (primer arranque) o de una sincronización con el servidor.
class DbHelper {
  DbHelper._();
  static final DbHelper instance = DbHelper._();
  Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    _db = await _initDb();
    return _db!;
  }

  Future<Database> _initDb() async {
    final path = join(await getDatabasesPath(), 'cotizador_icr.db');
    return openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE productos (
            id INTEGER PRIMARY KEY,
            costo REAL,
            nombre TEXT NOT NULL,
            precio_venta REAL,
            referencia_interna TEXT,
            unidad_medida TEXT,
            categoria_producto TEXT,
            archivo_imagen TEXT,
            imagen_url TEXT
          )
        ''');
      },
    );
  }

  Future<int> countTotal() async {
    final db = await database;
    final result = await db.rawQuery('SELECT COUNT(*) as c FROM productos');
    return Sqflite.firstIntValue(result) ?? 0;
  }

  /// Borra todo lo anterior y guarda la lista nueva (usado tanto por el
  /// seed inicial como por la sincronización con el servidor).
  Future<void> replaceAll(List<Producto> productos) async {
    final db = await database;
    await db.transaction((txn) async {
      await txn.delete('productos');
      final batch = txn.batch();
      for (final p in productos) {
        batch.insert('productos', p.toMap());
      }
      await batch.commit(noResult: true);
    });
  }

  /// La primera vez que se abre la app (base local vacía), la llena con
  /// el catálogo empaquetado dentro del propio instalador.
  Future<void> seedFromAssetsIfEmpty() async {
    final count = await countTotal();
    if (count > 0) return;
    final raw = await rootBundle.loadString('assets/productos_seed.json');
    final List<dynamic> data = jsonDecode(raw);
    final productos = data
        .map((e) => Producto.fromMap(Map<String, dynamic>.from(e)))
        .toList();
    await replaceAll(productos);
  }

  Future<List<String>> getCategorias() async {
    final db = await database;
    final result = await db.rawQuery(
      'SELECT DISTINCT categoria_producto FROM productos ORDER BY categoria_producto',
    );
    return result.map((e) => e['categoria_producto'] as String).toList();
  }

  Future<List<Producto>> getProductosPorCategoria(String categoria) async {
    final db = await database;
    final result = await db.query(
      'productos',
      where: 'categoria_producto = ?',
      whereArgs: [categoria],
      orderBy: 'nombre',
    );
    return result.map((e) => Producto.fromMap(e)).toList();
  }

  Future<List<Producto>> buscar(String query) async {
    final db = await database;
    final result = await db.query(
      'productos',
      where: 'nombre LIKE ? OR referencia_interna LIKE ?',
      whereArgs: ['%$query%', '%$query%'],
      orderBy: 'nombre',
      limit: 150,
    );
    return result.map((e) => Producto.fromMap(e)).toList();
  }
}
