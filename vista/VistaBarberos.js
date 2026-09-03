/**
 * VistaBarberos
 * Responsable de listar, crear y editar los barberos que atienden en
 * el local (nombre, activo/inactivo y horario de atención). Al hacer
 * clic en un barbero de la lista, sus datos cargan en el formulario
 * para poder modificarlos.
 */
class VistaBarberos {
  constructor(conexionDB) {
    this.conexionDB = conexionDB;
    this.contenedor = document.getElementById("lista-barberos");
    this.barberos = [];
    this.editandoId = null; // id del barbero en edición, o null si es uno nuevo
  }

  async cargar() {
    const { data: barberos, error } = await this.conexionDB.db
      .from("barberos")
      .select("id, nombre, activo, hora_apertura, hora_cierre")
      .order("created_at");

    if (error) {
      this.contenedor.innerHTML = `<div class="empty">Error: ${error.message}</div>`;
      return;
    }

    this.barberos = barberos || [];

    if (this.barberos.length === 0) {
      this.contenedor.innerHTML = `<div class="empty">Sin barberos registrados todavía</div>`;
      return;
    }

    this.contenedor.innerHTML = this.barberos
      .map(
        (b) => `
          <div class="slot" style="padding:9px 0; border-bottom:1px solid var(--line); cursor:pointer;" onclick="vistaBarberos.editar('${b.id}')">
            <div class="name">
              <strong>${b.nombre}</strong><br>
              <span style="color:var(--muted);font-size:12px;">${b.hora_apertura.slice(0, 5)} – ${b.hora_cierre.slice(0, 5)}</span>
            </div>
            <span class="badge ${b.activo ? "confirmada" : "no_show"}">${b.activo ? "Activo" : "Inactivo"}</span>
          </div>`
      )
      .join("");
  }

  /** Carga los datos de un barbero existente en el formulario para editarlo */
  editar(id) {
    const barbero = this.barberos.find((b) => b.id === id);
    if (!barbero) return;

    this.editandoId = id;
    document.getElementById("nuevo-barbero-nombre").value = barbero.nombre;
    document.getElementById("nuevo-barbero-apertura").value = barbero.hora_apertura.slice(0, 5);
    document.getElementById("nuevo-barbero-cierre").value = barbero.hora_cierre.slice(0, 5);
    document.getElementById("nuevo-barbero-activo").checked = barbero.activo;

    document.getElementById("btn-guardar-barbero").textContent = "Guardar cambios";
    document.getElementById("btn-cancelar-barbero").style.display = "flex";
    document.getElementById("card-form-barbero").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** Vuelve el formulario al modo "agregar barbero nuevo" */
  cancelarEdicion() {
    this.editandoId = null;
    document.getElementById("nuevo-barbero-nombre").value = "";
    document.getElementById("nuevo-barbero-apertura").value = "10:00";
    document.getElementById("nuevo-barbero-cierre").value = "20:00";
    document.getElementById("nuevo-barbero-activo").checked = true;
    document.getElementById("btn-guardar-barbero").textContent = "＋ Agregar barbero";
    document.getElementById("btn-cancelar-barbero").style.display = "none";
  }

  /** Crea un barbero nuevo, o guarda los cambios si se está editando uno existente */
  async guardar() {
    const nombre = document.getElementById("nuevo-barbero-nombre").value.trim();
    const apertura = document.getElementById("nuevo-barbero-apertura").value;
    const cierre = document.getElementById("nuevo-barbero-cierre").value;
    const activo = document.getElementById("nuevo-barbero-activo").checked;

    if (!nombre || !apertura || !cierre) {
      mostrarToast("Completa nombre y horario");
      return;
    }

    const payload = { nombre, hora_apertura: apertura, hora_cierre: cierre, activo };
    const { error } = this.editandoId
      ? await this.conexionDB.db.from("barberos").update(payload).eq("id", this.editandoId)
      : await this.conexionDB.db.from("barberos").insert(payload);

    if (error) {
      mostrarToast("Error: " + error.message);
      return;
    }

    mostrarToast(this.editandoId ? `${nombre} actualizado ✓` : `${nombre} agregado ✓`);
    this.cancelarEdicion();
    this.cargar();
  }
}
