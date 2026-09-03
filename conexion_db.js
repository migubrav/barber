/**
 * ConexionDB
 * Punto único de conexión a la base de datos (Supabase).
 * Todas las vistas/clases del sistema deben usar esta clase para
 * leer o escribir datos — nunca crear su propio cliente de Supabase.
 */
class ConexionDB {
  static _instancia = null;

  constructor() {
    this.URL = "https://vpqwrbilrgxisdgirpph.supabase.co";
    this.KEY = "sb_publishable_8dI_dzhBeYKjfSv73rPZWg_NhAYfZ5X";
    this.cliente = supabase.createClient(this.URL, this.KEY);
  }

  /** Devuelve la única instancia de conexión (patrón Singleton) */
  static obtenerInstancia() {
    if (!ConexionDB._instancia) {
      ConexionDB._instancia = new ConexionDB();
    }
    return ConexionDB._instancia;
  }

  /** Acceso directo al cliente Supabase para queries */
  get db() {
    return this.cliente;
  }

  /** Suscribirse a cambios en tiempo real de una tabla */
  suscribirCambios(nombreTabla, canal, callback) {
    return this.cliente
      .channel(canal)
      .on("postgres_changes", { event: "*", schema: "public", table: nombreTabla }, callback)
      .subscribe();
  }
}
