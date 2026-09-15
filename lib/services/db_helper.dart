import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import '../models/checklist_guardado.dart';
import '../models/cotizacion_guardada.dart';
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
      version: 3,
      onCreate: (db, version) async {
        await _crearTablaProductos(db);
        await _crearTablaCotizacionesGuardadas(db);
        await _crearTablaChecklistsGuardados(db);
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        // No se toca la tabla productos: no hay que perder un catálogo que
        // el usuario ya sincronizó con su servidor.
        if (oldVersion < 2) {
          await _crearTablaCotizacionesGuardadas(db);
        }
        if (oldVersion < 3) {
          await _crearTablaChecklistsGuardados(db);
        }
      },
    );
  }

  Future<void> _crearTablaProductos(Database db) async {
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
  }

  Future<void> _crearTablaCotizacionesGuardadas(Database db) async {
    await db.execute('''
      CREATE TABLE cotizaciones_guardadas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT NOT NULL,
        cliente TEXT NOT NULL,
        ruc_dni TEXT,
        fecha TEXT NOT NULL,
        total REAL NOT NULL,
        archivo_pdf TEXT NOT NULL
      )
    ''');
  }

  Future<void> _crearTablaChecklistsGuardados(Database db) async {
    await db.execute('''
      CREATE TABLE checklists_guardados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        responsable TEXT NOT NULL,
        fecha TEXT NOT NULL,
        total_items INTEGER NOT NULL,
        items_marcados INTEGER NOT NULL,
        resumen_texto TEXT NOT NULL,
        archivo_pdf TEXT
      )
    ''');
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

  /// Todo el catálogo agrupado por categoría en una sola consulta — para la
  /// pantalla de Productos (lista de categorías tipo acordeón), evita
  /// pedirle a la base una consulta separada por cada categoría.
  Future<Map<String, List<Producto>>> getTodosAgrupados() async {
    final db = await database;
    final result = await db.query(
      'productos',
      orderBy: 'categoria_producto, nombre',
    );
    final agrupado = <String, List<Producto>>{};
    for (final fila in result) {
      final producto = Producto.fromMap(fila);
      agrupado.putIfAbsent(producto.categoriaProducto, () => []).add(producto);
    }
    return agrupado;
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

  Future<void> guardarCotizacion(CotizacionGuardada cotizacion) async {
    final db = await database;
    await db.insert('cotizaciones_guardadas', cotizacion.toMap());
  }

  Future<List<CotizacionGuardada>> getCotizacionesGuardadas() async {
    final db = await database;
    final result = await db.query('cotizaciones_guardadas', orderBy: 'fecha DESC');
    return result.map((e) => CotizacionGuardada.fromMap(e)).toList();
  }

  Future<void> eliminarCotizacion(int id) async {
    final db = await database;
    await db.delete('cotizaciones_guardadas', where: 'id = ?', whereArgs: [id]);
  }

  /// Devuelve el id de la fila insertada, para poder actualizarla después
  /// (ej. cuando recién en ese momento se genera el PDF).
  Future<int> guardarChecklist(ChecklistGuardado checklist) async {
    final db = await database;
    return db.insert('checklists_guardados', checklist.toMap());
  }

  Future<void> actualizarChecklist(int id, ChecklistGuardado checklist) async {
    final db = await database;
    await db.update(
      'checklists_guardados',
      checklist.toMap(),
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> eliminarChecklist(int id) async {
    final db = await database;
    await db.delete('checklists_guardados', where: 'id = ?', whereArgs: [id]);
  }

  Future<List<ChecklistGuardado>> getChecklistsGuardados() async {
    final db = await database;
    final result = await db.query('checklists_guardados', orderBy: 'fecha DESC');
    return result.map((e) => ChecklistGuardado.fromMap(e)).toList();
  }
}
