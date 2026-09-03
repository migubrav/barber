// whatsapp-webhook
// Recibe los mensajes entrantes de WhatsApp (Meta) y hace avanzar la máquina
// de estados de conversaciones_bot.
//
// Estados:
//   inicial                -> reposo, sin conversación pendiente
//   esperando_confirmacion -> mandamos "¿vienes esta semana?", esperando SI/NO
//   esperando_postergar    -> dijo NO, preguntando si le escribimos en unos días
//   esperando_dias         -> esperando cuántos días quiere que esperemos
//   agendando              -> dijo SI, sub-flujo barbero -> fecha -> hora
//                             (el paso actual del sub-flujo vive en contexto.paso)
//
// TODO (producción): Meta firma cada POST con el header X-Hub-Signature-256
// usando el App Secret — antes de ir a producción hay que validar esa firma
// acá para confirmar que el webhook realmente viene de Meta.

import { createClient } from "npm:@supabase/supabase-js@2";
import { enviarBotones, enviarLista, enviarTexto, extraerRespuesta, normalizarTelefono } from "../_shared/whatsapp.ts";

const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verificación del webhook: Meta la llama una sola vez, al configurarlo.
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const desafio = url.searchParams.get("hub.challenge");
    if (modo === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
      return new Response(desafio, { status: 200 });
    }
    return new Response("Token de verificación inválido", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Método no permitido", { status: 405 });
  }

  const payload = await req.json();
  const mensaje = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  // Meta también manda actualizaciones de estado (entregado/leído) por este
  // mismo webhook — no traen "messages", las ignoramos.
  if (!mensaje) {
    return new Response("ok", { status: 200 });
  }

  const telefono = normalizarTelefono(mensaje.from);
  const respuestaCliente = extraerRespuesta(mensaje);
  if (respuestaCliente) {
    await procesarMensaje(telefono, respuestaCliente);
  }

  return new Response("ok", { status: 200 });
});

async function procesarMensaje(telefono: string, respuesta: string) {
  const { data: conversacion } = await supabase
    .from("conversaciones_bot")
    .select("*")
    .eq("telefono", telefono)
    .maybeSingle();

  const estado = conversacion?.estado ?? "inicial";

  switch (estado) {
    case "esperando_confirmacion":
      return manejarConfirmacion(telefono, respuesta);
    case "esperando_postergar":
      return manejarPostergar(telefono, conversacion, respuesta);
    case "esperando_dias":
      return manejarDias(telefono, conversacion, respuesta);
    case "agendando":
      return manejarAgendando(telefono, conversacion, respuesta);
    default:
      return enviarTexto(telefono, "Hola 👋 por ahora no tengo ninguna pregunta pendiente para ti.");
  }
}

async function actualizarConversacion(telefono: string, cambios: Record<string, unknown>) {
  await supabase
    .from("conversaciones_bot")
    .update({ ...cambios, actualizado_at: new Date().toISOString() })
    .eq("telefono", telefono);
}

// ---------- esperando_confirmacion ----------
async function manejarConfirmacion(telefono: string, respuesta: string) {
  if (respuesta === "confirmar_si") {
    await actualizarConversacion(telefono, { estado: "agendando", contexto: { paso: "esperando_barbero" } });
    return iniciarAgendamiento(telefono);
  }
  if (respuesta === "confirmar_no") {
    await actualizarConversacion(telefono, { estado: "esperando_postergar", contexto: {} });
    return enviarBotones(telefono, "Sin problema. ¿Quieres que te escriba en unos días?", [
      { id: "postergar_si", titulo: "Sí" },
      { id: "postergar_no", titulo: "No" },
    ]);
  }
  return enviarBotones(telefono, "No entendí 🙏 ¿Vienes a cortarte el pelo esta semana?", [
    { id: "confirmar_si", titulo: "Sí" },
    { id: "confirmar_no", titulo: "No" },
  ]);
}

// ---------- esperando_postergar ----------
async function manejarPostergar(telefono: string, conversacion: any, respuesta: string) {
  if (respuesta === "postergar_si") {
    await actualizarConversacion(telefono, { estado: "esperando_dias", contexto: {} });
    return enviarBotones(telefono, "¿En cuántos días te escribo?", [
      { id: "dias_3", titulo: "3 días" },
      { id: "dias_7", titulo: "7 días" },
      { id: "dias_15", titulo: "15 días" },
    ]);
  }
  if (respuesta === "postergar_no") {
    await actualizarConversacion(telefono, { estado: "inicial", contexto: {} });
    return enviarTexto(telefono, "Listo, no te molesto más por ahora. ¡Que estés bien! 👋");
  }
  return enviarBotones(telefono, "No entendí 🙏 ¿Quieres que te escriba en unos días?", [
    { id: "postergar_si", titulo: "Sí" },
    { id: "postergar_no", titulo: "No" },
  ]);
}

// ---------- esperando_dias ----------
const OPCIONES_DIAS: Record<string, number> = { dias_3: 3, dias_7: 7, dias_15: 15 };

async function manejarDias(telefono: string, conversacion: any, respuesta: string) {
  const dias = OPCIONES_DIAS[respuesta];
  if (!dias) {
    return enviarBotones(telefono, "No entendí 🙏 ¿En cuántos días te escribo?", [
      { id: "dias_3", titulo: "3 días" },
      { id: "dias_7", titulo: "7 días" },
      { id: "dias_15", titulo: "15 días" },
    ]);
  }

  const proxima = new Date();
  proxima.setDate(proxima.getDate() + dias);
  const proximaISO = proxima.toISOString().slice(0, 10);

  await supabase.from("clientes").update({ proximo_recordatorio: proximaISO }).eq("id", conversacion.cliente_id);
  await actualizarConversacion(telefono, { estado: "inicial", contexto: {} });
  return enviarTexto(telefono, `Perfecto, te escribo en ${dias} días 👍`);
}

// ---------- agendando ----------
async function iniciarAgendamiento(telefono: string) {
  const { data: barberos } = await supabase.from("barberos").select("id, nombre").eq("activo", true).order(
    "nombre",
  );

  if (!barberos || barberos.length === 0) {
    await actualizarConversacion(telefono, { estado: "inicial", contexto: {} });
    return enviarTexto(telefono, "Por ahora no tenemos barberos disponibles, escríbenos directo para agendar 🙏");
  }

  return enviarLista(
    telefono,
    "¡Genial! ¿Con qué barbero quieres ir?",
    "Elegir barbero",
    barberos.map((b) => ({ id: `barbero_${b.id}`, titulo: b.nombre })),
  );
}

async function manejarAgendando(telefono: string, conversacion: any, respuesta: string) {
  const contexto = conversacion.contexto || {};

  if (contexto.paso === "esperando_barbero") {
    if (!respuesta.startsWith("barbero_")) return iniciarAgendamiento(telefono);
    const barberoId = respuesta.replace("barbero_", "");
    await actualizarConversacion(telefono, { contexto: { paso: "esperando_fecha", barbero_id: barberoId } });
    return enviarProximosDias(telefono);
  }

  if (contexto.paso === "esperando_fecha") {
    if (!respuesta.startsWith("fecha_")) return enviarProximosDias(telefono);
    const fecha = respuesta.replace("fecha_", "");
    await actualizarConversacion(telefono, { contexto: { ...contexto, paso: "esperando_hora", fecha } });
    return enviarHorasDisponibles(telefono, contexto.barbero_id, fecha);
  }

  if (contexto.paso === "esperando_hora") {
    if (!respuesta.startsWith("hora_")) return enviarHorasDisponibles(telefono, contexto.barbero_id, contexto.fecha);
    const horaInicio = respuesta.replace("hora_", "");
    return confirmarReserva(telefono, conversacion, contexto, horaInicio);
  }
}

function proximosDias(cantidad: number) {
  const dias: Date[] = [];
  for (let i = 0; i < cantidad; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dias.push(d);
  }
  return dias;
}

async function enviarProximosDias(telefono: string) {
  const opciones = proximosDias(10).map((d) => {
    const iso = d.toISOString().slice(0, 10);
    const etiqueta = d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
    return { id: `fecha_${iso}`, titulo: etiqueta };
  });
  return enviarLista(telefono, "¿Qué día te acomoda?", "Elegir día", opciones);
}

function generarSlots(apertura: string, cierre: string, duracionMin: number) {
  const slots: string[] = [];
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

function sumarMinutos(hora: string, minutos: number) {
  let [h, m] = hora.split(":").map(Number);
  m += minutos;
  while (m >= 60) {
    m -= 60;
    h += 1;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function horaYaPaso(hora: string, ahora: Date) {
  const [h, m] = hora.split(":").map(Number);
  const slot = new Date(ahora);
  slot.setHours(h, m, 0, 0);
  return slot < ahora;
}

async function enviarHorasDisponibles(telefono: string, barberoId: string, fecha: string) {
  const { data: barbero } = await supabase.from("barberos").select("hora_apertura, hora_cierre").eq(
    "id",
    barberoId,
  ).single();
  const { data: config } = await supabase.from("configuracion").select("duracion_corte_min").eq("id", 1).single();
  const duracion = config?.duracion_corte_min || 45;

  const { data: reservas } = await supabase
    .from("reservas")
    .select("hora_inicio")
    .eq("barbero_id", barberoId)
    .eq("fecha", fecha)
    .in("estado", ["confirmada", "en_tolerancia", "completada"]);
  const ocupadas = new Set((reservas || []).map((r) => r.hora_inicio.slice(0, 5)));

  const ahora = new Date();
  const esHoy = fecha === ahora.toISOString().slice(0, 10);
  const slots = generarSlots(barbero.hora_apertura, barbero.hora_cierre, duracion).filter(
    (h) => !ocupadas.has(h) && !(esHoy && horaYaPaso(h, ahora)),
  );

  if (slots.length === 0) {
    await enviarTexto(telefono, "No quedan horas disponibles ese día, elige otra fecha 🙏");
    return enviarProximosDias(telefono);
  }

  // WhatsApp permite máximo 10 filas por lista
  const opciones = slots.slice(0, 10).map((h) => ({ id: `hora_${h}`, titulo: h }));
  return enviarLista(telefono, "¿A qué hora?", "Elegir hora", opciones);
}

async function confirmarReserva(telefono: string, conversacion: any, contexto: any, horaInicio: string) {
  const { data: config } = await supabase.from("configuracion").select("duracion_corte_min").eq("id", 1).single();
  const duracion = config?.duracion_corte_min || 45;
  const horaFin = sumarMinutos(horaInicio, duracion);

  const { error } = await supabase.from("reservas").insert({
    cliente_id: conversacion.cliente_id,
    barbero_id: contexto.barbero_id,
    fecha: contexto.fecha,
    hora_inicio: horaInicio,
    hora_fin: horaFin,
    origen: "whatsapp",
  });

  if (error) {
    await enviarTexto(telefono, "Esa hora se acaba de ocupar, elige otra 🙏");
    return enviarHorasDisponibles(telefono, contexto.barbero_id, contexto.fecha);
  }

  await actualizarConversacion(telefono, { estado: "inicial", contexto: {} });
  return enviarTexto(telefono, `¡Listo! Quedaste agendado el ${contexto.fecha} a las ${horaInicio} ✂️. ¡Te esperamos!`);
}
