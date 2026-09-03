/**
 * VistaConfig
 * Responsable de leer y guardar la configuración general del sistema
 * (duración de corte, tolerancia, radio de aviso).
 */
class VistaConfig {
  constructor(conexionDB) {
    this.conexionDB = conexionDB;
    this.configuracion = null; // cache para que otras vistas la usen (ej: VistaCola)
  }

  async cargar() {
    const { data, error } = await this.conexionDB.db
      .from("configuracion")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      mostrarToast("Error cargando config: " + error.message);
      return;
    }

    this.configuracion = data;
    document.getElementById("cfg-duracion").value = data.duracion_corte_min;
    document.getElementById("cfg-tolerancia").value = data.tolerancia_min;
    document.getElementById("cfg-radio").value = data.radio_deteccion_km;
  }

  async guardar() {
    const payload = {
      duracion_corte_min: parseInt(document.getElementById("cfg-duracion").value) || 45,
      tolerancia_min: parseInt(document.getElementById("cfg-tolerancia").value) || 10,
      radio_deteccion_km: parseInt(document.getElementById("cfg-radio").value) || 40,
    };
    const { error } = await this.conexionDB.db.from("configuracion").update(payload).eq("id", 1);
    if (error) {
      mostrarToast("Error: " + error.message);
      return;
    }
    this.configuracion = payload;
    mostrarToast("Configuración guardada ✓");
  }
}
