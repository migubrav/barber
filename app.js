/**
 * app.js — Controlador principal del panel del barbero.
 * Instancia la conexión a la BD y cada clase de vista, y maneja
 * la navegación entre pestañas.
 */

const conexionDB = ConexionDB.obtenerInstancia();

const vistaConfig = new VistaConfig(conexionDB);
const vistaAgenda = new VistaAgenda(conexionDB, vistaConfig); // lee duracion_corte_min y tolerancia_min
const vistaBarberos = new VistaBarberos(conexionDB);
const vistaRegistro = new VistaRegistro(conexionDB);

function mostrarToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 2600);
}

function cambiarVista(nombre) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.remove("active"));
  document.getElementById("view-" + nombre).classList.add("active");
  document.querySelector(`nav.tabs button[data-view="${nombre}"]`).classList.add("active");

  if (nombre === "config") {
    vistaConfig.cargar();
    vistaBarberos.cargar();
  }
  if (nombre === "registro") vistaRegistro.mostrarLink();
}

// Atajos usados por los botones del HTML
function agregarWalkIn() {
  vistaAgenda.agregarWalkIn();
}
function guardarConfig() {
  vistaConfig.guardar();
}
function agregarFilaRegistro() {
  vistaRegistro.agregarFila();
}
function guardarClientesRegistro() {
  vistaRegistro.guardarTodos();
}
function agregarBarbero() {
  vistaBarberos.guardar();
}
function cancelarEdicionBarbero() {
  vistaBarberos.cancelarEdicion();
}

document.getElementById("fecha-hoy").textContent = new Date().toLocaleDateString("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function iniciarTiempoReal() {
  conexionDB.suscribirCambios("cola_espera", "cola-realtime", () => vistaAgenda.cargar());
  conexionDB.suscribirCambios("reservas", "reservas-realtime", () => vistaAgenda.cargar());
}

// ---------- PWA: banner de instalación ----------
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById("install-banner").style.display = "block";
});

// ---------- Inicialización ----------
vistaConfig.cargar().then(() => vistaAgenda.cargar());
vistaBarberos.cargar();
vistaRegistro.inicializarFormularioMultiple();
iniciarTiempoReal();
setInterval(() => {
  vistaAgenda.cargar();
}, 30000);
