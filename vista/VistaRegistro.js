/**
 * VistaRegistro
 * Responsable del formulario de registro de clientes (página a la que
 * apunta el código QR) y de generar el link de registro para el panel.
 */
class VistaRegistro {
  constructor(conexionDB) {
    this.conexionDB = conexionDB;
  }

  /** Usado en el panel del barbero: arma el link que va en el QR */
  mostrarLink() {
    const contenedor = document.getElementById("registro-link");
    if (!contenedor) return;
    const url = window.location.href.replace("panel.html", "") + "vista/registro.html";
    contenedor.textContent = url;
  }

  /** Carga y muestra todos los clientes registrados */
  async cargarClientes() {
    const contenedor = document.getElementById("lista-clientes");
    if (!contenedor) return;

    contenedor.innerHTML = "<div class='empty'>Cargando clientes…</div>";

    try {
      const { data: clientes, error } = await this.conexionDB.db
        .from("clientes")
        .select("id, nombre, telefono, frecuencia_dias, fecha_registro")
        .order("fecha_registro", { ascending: false });

      if (error) {
        contenedor.innerHTML = `<div class='empty'>Error: ${error.message}</div>`;
        return;
      }

      if (!clientes || clientes.length === 0) {
        contenedor.innerHTML = "<div class='empty'>No hay clientes registrados aún</div>";
        return;
      }

      this.mostrarListaClientes(clientes, contenedor);
    } catch (error) {
      contenedor.innerHTML = `<div class='empty'>Error: ${error.message}</div>`;
    }
  }

  /** Renderiza la tabla de clientes */
  mostrarListaClientes(clientes, contenedor) {
    let html = `
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: var(--dark); border-bottom: 2px solid var(--gold);">
            <th style="padding: 10px; text-align: left;">Nombre</th>
            <th style="padding: 10px; text-align: left;">WhatsApp</th>
            <th style="padding: 10px; text-align: center;">Frecuencia</th>
            <th style="padding: 10px; text-align: center;">Registrado</th>
            <th style="padding: 10px; text-align: center;">Acciones</th>
          </tr>
        </thead>
        <tbody>
    `;

    clientes.forEach((cliente) => {
      const fechaRegistro = new Date(cliente.fecha_registro).toLocaleDateString("es-CL");
      const frecuencia = `Cada ${cliente.frecuencia_dias} días`;

      html += `
        <tr style="border-bottom: 1px solid rgba(212, 175, 119, 0.2); hover: background: rgba(212, 175, 119, 0.05);">
          <td style="padding: 10px;"><strong>${cliente.nombre}</strong></td>
          <td style="padding: 10px;">${cliente.telefono}</td>
          <td style="padding: 10px; text-align: center; color: var(--gold);">${frecuencia}</td>
          <td style="padding: 10px; text-align: center; font-size: 12px; color: var(--muted);">${fechaRegistro}</td>
          <td style="padding: 10px; text-align: center;">
            <button class="btn-accion" onclick="vistaRegistro.editarCliente('${cliente.id}', '${cliente.nombre}', '${cliente.telefono}')" style="padding: 6px 12px; background: var(--gold); color: #1a1410; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">Modificar</button>
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
      <div style="margin-top: 15px; font-size: 12px; color: var(--muted);">
        Total: <strong>${clientes.length}</strong> cliente(s) registrado(s)
      </div>
    `;

    contenedor.innerHTML = html;
  }

  /** Permite editar el número de WhatsApp de un cliente */
  async editarCliente(clienteId, nombreCliente, telefonoActual) {
    // Crear modal simple para editar
    const nuevoTelefono = prompt(
      `Modificar WhatsApp de ${nombreCliente}\n\nTeléfono actual: ${telefonoActual}`,
      telefonoActual
    );

    // Si el usuario cancela
    if (nuevoTelefono === null) {
      return;
    }

    // Si no cambió nada
    if (nuevoTelefono.trim() === telefonoActual) {
      mostrarToast("Sin cambios");
      return;
    }

    // Validar que no esté vacío
    if (nuevoTelefono.trim() === "") {
      mostrarToast("El teléfono no puede estar vacío");
      return;
    }

    try {
      // Actualizar en la BD
      const { error } = await this.conexionDB.db
        .from("clientes")
        .update({ telefono: nuevoTelefono.trim() })
        .eq("id", clienteId);

      if (error) {
        if (error.message.includes("duplicate")) {
          mostrarToast("Este número ya está registrado");
        } else {
          mostrarToast("Error al actualizar: " + error.message);
        }
        return;
      }

      mostrarToast(`${nombreCliente} actualizado ✓`);
      this.cargarClientes(); // Recargar lista
    } catch (error) {
      mostrarToast("Error: " + error.message);
    }
  }

  /** Usado en el panel: prepara el formulario para cargar varios clientes de prueba */
  inicializarFormularioMultiple() {
    this.contenedorFilas = document.getElementById("filas-registro");
    if (!this.contenedorFilas) return;
    this.agregarFila();
  }

  /** Agrega una fila vacía (nombre, whatsapp, frecuencia) al formulario multi-cliente */
  agregarFila() {
    if (!this.contenedorFilas) return;
    const fila = document.createElement("div");
    fila.className = "fila-registro";
    fila.innerHTML = `
      <button type="button" class="quitar" onclick="this.parentElement.remove()">✕ quitar</button>
      <label>Nombre</label>
      <input type="text" class="input-nombre" placeholder="Ej: Carlos Muñoz" />
      <label>WhatsApp</label>
      <input type="tel" class="input-telefono" placeholder="+56 9 1234 5678" />
      <label>¿Cada cuánto se corta el pelo?</label>
      <select class="input-frecuencia">
        <option value="7">Cada semana</option>
        <option value="14" selected>Cada 2 semanas</option>
        <option value="21">Cada 3 semanas</option>
        <option value="30">Cada mes</option>
        <option value="60">Cada 2 meses</option>
      </select>
    `;
    this.contenedorFilas.appendChild(fila);
  }

  /** Guarda todas las filas cargadas como clientes nuevos (+ su primer corte) */
  async guardarTodos() {
    const filas = [...document.querySelectorAll("#filas-registro .fila-registro")];
    const nuevos = filas
      .map((fila) => ({
        nombre: fila.querySelector(".input-nombre").value.trim(),
        telefono: fila.querySelector(".input-telefono").value.trim(),
        frecuencia_dias: parseInt(fila.querySelector(".input-frecuencia").value),
      }))
      .filter((c) => c.nombre && c.telefono);

    if (nuevos.length === 0) {
      mostrarToast("Completa al menos un cliente");
      return;
    }

    const { data: clientesCreados, error } = await this.conexionDB.db
      .from("clientes")
      .insert(nuevos)
      .select();

    if (error) {
      mostrarToast("Error: " + error.message);
      return;
    }

    // Registrar el corte de hoy de cada cliente (fecha base para su próximo recordatorio)
    await this.conexionDB.db
      .from("cortes")
      .insert(clientesCreados.map((c) => ({ cliente_id: c.id })));

    mostrarToast(`${clientesCreados.length} cliente(s) registrado(s) ✓`);
    this.mostrarResultado(clientesCreados);
    this.contenedorFilas.innerHTML = "";
    this.agregarFila();
  }

  /** Deja visible en pantalla (sin depender del toast) la lista de lo que quedó guardado en Supabase */
  mostrarResultado(clientesCreados) {
    const card = document.getElementById("card-resultado-registro");
    const lista = document.getElementById("resultado-registro");
    if (!card || !lista) return;
    const items = clientesCreados
      .map((c) => `<div style="padding:6px 0;font-size:14px;">✓ <strong>${c.nombre}</strong> — ${c.telefono}</div>`)
      .join("");
    lista.insertAdjacentHTML("afterbegin", items);
    card.style.display = "block";
  }

  /** Usado en registro.html: registra al cliente y su primer corte */
  inicializarFormulario() {
    const form = document.getElementById("form-registro");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-submit");
      const errBox = document.getElementById("msg-error");
      errBox.style.display = "none";
      btn.disabled = true;
      btn.textContent = "Registrando…";

      const nombre = document.getElementById("nombre").value.trim();
      const telefono = document.getElementById("telefono").value.trim();
      const frecuencia_dias = parseInt(document.getElementById("frecuencia").value);

      const { data: cliente, error } = await this.conexionDB.db
        .from("clientes")
        .insert({ nombre, telefono, frecuencia_dias })
        .select()
        .single();

      if (error) {
        btn.disabled = false;
        btn.textContent = "Registrarme";
        errBox.textContent = error.message.includes("duplicate")
          ? "Este número ya está registrado."
          : "Ocurrió un error, intenta de nuevo.";
        errBox.style.display = "block";
        return;
      }

      // Registrar el corte de hoy (fecha base para el próximo recordatorio)
      await this.conexionDB.db.from("cortes").insert({ cliente_id: cliente.id });

      form.style.display = "none";
      document.getElementById("msg-ok").style.display = "block";
    });
  }
}
