/**
 * VistaAgenda
 * Responsable de mostrar y refrescar la agenda del día: las reservas
 * con hora y los walk-ins en espera, unificados en una sola lista
 * ordenada por el momento en que se atienden. Detecta cuándo una
 * reserva está dentro de su período de tolerancia (el cliente aún
 * no llega pero todavía no se le puede ceder el cupo a un walk-in).
 */
class VistaAgenda {
  constructor(conexionDB, vistaConfig) {
    this.conexionDB = conexionDB;
    this.vistaConfig = vistaConfig; // para leer duracion_corte_min y tolerancia_min
    this.contenedor = document.getElementById("agenda-list");
    this.contadorHoy = document.getElementById("n-hoy");
    this.contadorEspera = document.getElementById("n-espera");
    this.contadorETA = document.getElementById("n-eta");
  }

  /** Fecha de hoy en hora local (YYYY-MM-DD) — toISOString() usa UTC y corre el día en Chile */
  hoyISO() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, "0");
    const d = String(hoy.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  fmtHora(hora) {
    return hora ? hora.slice(0, 5) : "";
  }

  /** Convierte una hora "HH:MM" de hoy en un objeto Date, para poder ordenar y comparar */
  horaDeHoyAFecha(hora) {
    const fecha = new Date();
    const [h, m] = hora.slice(0, 5).split(":").map(Number);
    fecha.setHours(h, m, 0, 0);
    return fecha;
  }

  async cargar() {
    const hoy = this.hoyISO();

    const [{ data: reservas, error: errReservas }, { data: cola, error: errCola }] = await Promise.all([
      this.conexionDB.db
        .from("reservas")
        .select("id, hora_inicio, hora_fin, estado, cliente_id, clientes(nombre), barberos(nombre)")
        .eq("fecha", hoy)
        .in("estado", ["confirmada", "en_tolerancia"])
        .order("hora_inicio"),
      this.conexionDB.db
        .from("cola_espera")
        .select("id, nombre_walk_in, estado, hora_entrada, cliente_id, clientes(nombre), barberos(nombre)")
        .in("estado", ["esperando", "en_corte"])
        .order("hora_entrada"),
    ]);

    const error = errReservas || errCola;
    if (error) {
      this.contenedor.innerHTML = `<div class="empty">Error cargando agenda: ${error.message}</div>`;
      return;
    }

    this.contadorHoy.textContent = (reservas || []).length;
    const esperando = (cola || []).filter((c) => c.estado === "esperando");
    this.contadorEspera.textContent = esperando.length;
    const duracion = this.vistaConfig?.configuracion?.duracion_corte_min || 45;
    this.contadorETA.textContent = esperando.length * duracion + "m";

    // Unifica reservas y walk-ins en una sola lista, ordenada por el momento en que se atienden
    const items = [
      ...(reservas || []).map((r) => ({ tipo: "reserva", momento: this.horaDeHoyAFecha(r.hora_inicio), dato: r })),
      ...(cola || []).map((c) => ({ tipo: "walkin", momento: new Date(c.hora_entrada), dato: c })),
    ].sort((a, b) => a.momento - b.momento);

    if (items.length === 0) {
      this.contenedor.innerHTML = `<div class="empty">No hay nadie agendado ni esperando</div>`;
      return;
    }

    const ahora = new Date();
    this.contenedor.innerHTML = items.map((item) => this.renderItem(item, ahora)).join("");
  }

  renderItem(item, ahora) {
    if (item.tipo === "reserva") {
      const r = item.dato;
      const nombre = r.clientes ? r.clientes.nombre : "Cliente";
      const barbero = r.barberos ? r.barberos.nombre : "Sin barbero asignado";
      const tolerancia = this.vistaConfig?.configuracion?.tolerancia_min || 10;
      const finTolerancia = new Date(item.momento.getTime() + tolerancia * 60000);
      const enTolerancia = ahora > item.momento && ahora <= finTolerancia;
      const badge = enTolerancia
        ? `<span class="badge tolerancia">⏳ Tolerancia</span>`
        : `<span class="badge confirmada">Confirmada</span>`;
      return `
        <div class="slot" style="padding:9px 0; border-bottom:1px solid var(--line);">
          <div class="time">${this.fmtHora(r.hora_inicio)}</div>
          <div class="name">${nombre}<br><span style="color:var(--muted);font-size:12px;">✂️ ${barbero}</span></div>
          ${badge}
          <button class="btn btn-danger" style="flex:none;padding:8px 10px;" onclick="vistaAgenda.cancelar('${r.id}')">✕</button>
          <button class="btn btn-primary" style="flex:none;padding:8px 12px;" onclick="vistaAgenda.completar('${r.id}')">✓ Listo</button>
        </div>`;
    }

    const c = item.dato;
    const nombre = c.clientes ? c.clientes.nombre : c.nombre_walk_in || "Walk-in";
    const barbero = c.barberos ? c.barberos.nombre : "Sin barbero asignado";
    const hora = item.momento.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    const enCorte = c.estado === "en_corte";
    return `
      <div class="slot" style="padding:9px 0; border-bottom:1px solid var(--line);">
        <div class="time">${hora}</div>
        <div class="name">${nombre}<br><span style="color:var(--muted);font-size:12px;">Walk-in · ✂️ ${barbero}</span></div>
        ${
          enCorte
            ? `<button class="btn btn-outline" style="flex:none;padding:8px 12px;" onclick="vistaAgenda.terminarWalkIn('${c.id}')">Terminar</button>`
            : `<button class="btn btn-primary" style="flex:none;padding:8px 12px;" onclick="vistaAgenda.iniciarWalkIn('${c.id}')">Iniciar</button>`
        }
      </div>`;
  }

  /** Marca la reserva como completada: el cliente ya se cortó el pelo */
  async completar(id) {
    const { error } = await this.conexionDB.db.from("reservas").update({ estado: "completada" }).eq("id", id);
    if (error) {
      mostrarToast("Error: " + error.message);
      return;
    }
    mostrarToast("Corte marcado como listo ✓");
    this.cargar();
  }

  /** Cancela una reserva porque el cliente se arrepintió o avisó que no llega */
  async cancelar(id) {
    if (!confirm("¿Cancelar esta hora?")) return;
    const { error } = await this.conexionDB.db.from("reservas").update({ estado: "cancelada" }).eq("id", id);
    if (error) {
      mostrarToast("Error: " + error.message);
      return;
    }
    mostrarToast("Hora cancelada");
    this.cargar();
  }

  /** Registra a alguien que llegó sin hora reservada (ej: mientras otro cliente está en tolerancia) */
  async agregarWalkIn() {
    const nombre = prompt("Nombre del cliente (walk-in):");
    if (!nombre) return;

    const barberoId = await this.elegirBarbero();
    if (barberoId === null) return; // canceló la selección de barbero

    const { error } = await this.conexionDB.db
      .from("cola_espera")
      .insert({ nombre_walk_in: nombre, estado: "esperando", barbero_id: barberoId || null });
    if (error) {
      mostrarToast("Error: " + error.message);
      return;
    }
    mostrarToast(`${nombre} agregado a la espera`);
    this.cargar();
  }

  /** Pide con qué barbero va el walk-in. Si solo hay uno activo, lo asigna directo sin preguntar. */
  async elegirBarbero() {
    const { data: barberos, error } = await this.conexionDB.db
      .from("barberos")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre");

    if (error || !barberos || barberos.length === 0) return undefined; // sin barberos configurados, se agrega sin asignar
    if (barberos.length === 1) return barberos[0].id;

    const opciones = barberos.map((b, i) => `${i + 1}) ${b.nombre}`).join("\n");
    const respuesta = prompt(`¿Con qué barbero?\n${opciones}`);
    if (!respuesta) return null; // canceló

    const indice = parseInt(respuesta, 10) - 1;
    return barberos[indice] ? barberos[indice].id : undefined;
  }

  async iniciarWalkIn(id) {
    const { error } = await this.conexionDB.db
      .from("cola_espera")
      .update({ estado: "en_corte", hora_inicio_corte: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      mostrarToast("Error: " + error.message);
      return;
    }
    this.cargar();
  }

  async terminarWalkIn(id) {
    const { error } = await this.conexionDB.db
      .from("cola_espera")
      .update({ estado: "completado", hora_fin_corte: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      mostrarToast("Error: " + error.message);
      return;
    }
    mostrarToast("Corte finalizado ✓");
    this.cargar();
  }
}
