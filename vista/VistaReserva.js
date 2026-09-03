/**
 * VistaReserva
 * Responsable de la pantalla donde un cliente ya registrado toma hora:
 * se identifica por WhatsApp, elige barbero y fecha, y confirma un
 * bloque de horario disponible.
 */
class VistaReserva {
  constructor(conexionDB) {
    this.conexionDB = conexionDB;
    this.cliente = null;
    this.barberos = [];
  }

  inicializar() {
    document.getElementById("form-buscar").addEventListener("submit", (e) => {
      e.preventDefault();
      this.buscarCliente();
    });
    document.getElementById("select-barbero").addEventListener("change", () => this.cargarHoras());
    document.getElementById("input-fecha").addEventListener("change", () => this.cargarHoras());

    const hoy = this.hoyISO();
    const inputFecha = document.getElementById("input-fecha");
    inputFecha.min = hoy;
    inputFecha.value = hoy;
  }

  /** Busca al cliente por su WhatsApp (ya debe estar registrado por QR) */
  async buscarCliente() {
    const btn = document.getElementById("btn-buscar");
    const telefono = document.getElementById("telefono-buscar").value.trim();
    document.getElementById("msg-no-encontrado").style.display = "none";
    btn.disabled = true;
    btn.textContent = "Buscando…";

    const { data: cliente, error } = await this.conexionDB.db
      .from("clientes")
      .select("id, nombre")
      .eq("telefono", telefono)
      .maybeSingle();

    btn.disabled = false;
    btn.textContent = "Buscar";

    if (error || !cliente) {
      document.getElementById("msg-no-encontrado").style.display = "block";
      return;
    }

    this.cliente = cliente;
    document.getElementById("form-buscar").style.display = "none";
    document.getElementById("saludo-cliente").textContent = `Hola, ${cliente.nombre} 👋 elige cuándo quieres venir:`;
    document.getElementById("paso-reserva").style.display = "block";

    await this.cargarBarberos();
  }

  /** Carga los barberos activos en el selector */
  async cargarBarberos() {
    const select = document.getElementById("select-barbero");
    const { data: barberos, error } = await this.conexionDB.db
      .from("barberos")
      .select("id, nombre, hora_apertura, hora_cierre")
      .eq("activo", true)
      .order("nombre");

    if (error || !barberos || barberos.length === 0) {
      select.innerHTML = `<option value="">No hay barberos disponibles</option>`;
      document.getElementById("grid-horas").innerHTML = `<div class="empty">Sin barberos disponibles por ahora</div>`;
      return;
    }

    this.barberos = barberos;
    select.innerHTML = barberos.map((b) => `<option value="${b.id}">${b.nombre}</option>`).join("");
    await this.cargarHoras();
  }

  /** Calcula y dibuja los bloques de hora disponibles para el barbero + fecha elegidos */
  async cargarHoras() {
    const grid = document.getElementById("grid-horas");
    const barberoId = document.getElementById("select-barbero").value;
    const fecha = document.getElementById("input-fecha").value;
    if (!barberoId || !fecha) return;

    const barbero = this.barberos.find((b) => b.id === barberoId);
    if (!barbero) return;

    grid.innerHTML = `<div class="empty">Buscando horarios…</div>`;

    const { data: config } = await this.conexionDB.db
      .from("configuracion")
      .select("duracion_corte_min")
      .eq("id", 1)
      .single();
    const duracion = config?.duracion_corte_min || 45;

    const { data: reservas } = await this.conexionDB.db
      .from("reservas")
      .select("hora_inicio")
      .eq("barbero_id", barberoId)
      .eq("fecha", fecha)
      .in("estado", ["confirmada", "en_tolerancia", "completada"]);

    const ocupadas = new Set((reservas || []).map((r) => r.hora_inicio.slice(0, 5)));

    const slots = this.generarSlots(barbero.hora_apertura, barbero.hora_cierre, duracion);
    const ahora = new Date();
    const esHoy = fecha === this.hoyISO();

    if (slots.length === 0) {
      grid.innerHTML = `<div class="empty">Sin horarios ese día</div>`;
      return;
    }

    grid.innerHTML = slots
      .map((hora) => {
        const ocupada = ocupadas.has(hora);
        const pasada = esHoy && this.horaYaPaso(hora, ahora);
        const deshabilitada = ocupada || pasada;
        const horaFin = this.sumarMinutos(hora, duracion);
        return `<button type="button" class="hora-btn ${deshabilitada ? "ocupada" : ""}" ${
          deshabilitada ? "disabled" : `onclick="vistaReserva.confirmar('${hora}', '${horaFin}')"`
        }>${hora}</button>`;
      })
      .join("");
  }

  /** Genera los bloques de hora entre apertura y cierre, cada "duracionMin" minutos */
  generarSlots(apertura, cierre, duracionMin) {
    const slots = [];
    let [h, m] = apertura.slice(0, 5).split(":").map(Number);
    const [hFin, mFin] = cierre.slice(0, 5).split(":").map(Number);
    while (h < hFin || (h === hFin && m < mFin)) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      m += duracionMin;
      while (m >= 60) {
        m -= 60;
        h += 1;
      }
    }
    return slots;
  }

  sumarMinutos(hora, minutos) {
    let [h, m] = hora.split(":").map(Number);
    m += minutos;
    while (m >= 60) {
      m -= 60;
      h += 1;
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  /** Fecha de hoy en hora local (YYYY-MM-DD) — toISOString() usa UTC y corre el día en Chile */
  hoyISO() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, "0");
    const d = String(hoy.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  horaYaPaso(hora, ahora) {
    const [h, m] = hora.split(":").map(Number);
    const slot = new Date(ahora);
    slot.setHours(h, m, 0, 0);
    return slot < ahora;
  }

  /** Guarda la reserva elegida */
  async confirmar(horaInicio, horaFin) {
    const barberoId = document.getElementById("select-barbero").value;
    const fecha = document.getElementById("input-fecha").value;
    document.getElementById("msg-error-reserva").style.display = "none";

    const { error } = await this.conexionDB.db.from("reservas").insert({
      cliente_id: this.cliente.id,
      barbero_id: barberoId,
      fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      origen: "web",
    });

    if (error) {
      const errBox = document.getElementById("msg-error-reserva");
      errBox.textContent = error.message.includes("duplicate")
        ? "Ese horario se acaba de ocupar, elige otro."
        : "Ocurrió un error, intenta de nuevo.";
      errBox.style.display = "block";
      this.cargarHoras();
      return;
    }

    document.getElementById("paso-reserva").style.display = "none";
    document.getElementById("msg-ok").style.display = "block";
  }
}
