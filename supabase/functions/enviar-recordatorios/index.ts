// enviar-recordatorios
// 1. Revisa RESERVAS PENDIENTES y envía confirmación
//    - Si reserva es mañana → enviar hoy a las 09:00 AM
//    - Si reserva es hoy → enviar 40 minutos antes
//
// 2. Revisa clientes que deben venir (según último corte + frecuencia_dias)
//    y les manda recordatorio por WhatsApp
//
// Protegida con CRON_SECRET para evitar abuso.
// Pensada para invocarse vía cron cada 5-10 minutos.

import { createClient } from "npm:@supabase/supabase-js@2";
import { enviarBotones, normalizarTelefono } from "../_shared/whatsapp.ts";
import { calcularRecordatorio, esHoraDeEnviar } from "../_shared/calcular_recordatorio.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Método no permitido, usa POST", { status: 405 });
  }

  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const enviados: string[] = [];
  const resEnviadas: string[] = [];

  // ==========================================
  // PARTE 1: PROCESAR RESERVAS PENDIENTES
  // ==========================================
  const { data: reservasPendientes, error: errReservas } = await supabase
    .from("reservas")
    .select("id, fecha, hora_inicio, cliente_id, clientes(nombre, telefono), barberos(nombre), recordatorio_enviado")
    .eq("estado", "pendiente")
    .is("recordatorio_enviado", null)
    .gte("fecha", hoy);

  if (errReservas) {
    console.error("Error cargando reservas:", errReservas);
  } else if (reservasPendientes && reservasPendientes.length > 0) {
    for (const reserva of reservasPendientes) {
      try {
        const cliente = reserva.clientes as any;
        const barbero = reserva.barberos as any;

        if (!cliente?.telefono) continue;

        // Calcular cuándo enviar recordatorio
        const resultado = calcularRecordatorio(
          reserva.fecha,
          reserva.hora_inicio
        );

        // Verificar si es hora de enviar
        if (!resultado.debe_enviar || !esHoraDeEnviar(resultado.momento_envio)) {
          continue;
        }

        const telefono = normalizarTelefono(cliente.telefono);

        // Enviar mensaje de confirmación
        const mensaje = `Hola ${cliente.nombre} 👋\n\n¿Confirmas tu reserva para el ${reserva.fecha} a las ${reserva.hora_inicio} con ${barbero?.nombre || "barbero"}?\n\nResponde SÍ o NO.`;

        const { ok } = await enviarBotones(telefono, mensaje, [
          { id: "confirmar_si", titulo: "Sí" },
          { id: "confirmar_no", titulo: "No" },
        ]);

        if (ok) {
          // Marcar que se envió el recordatorio
          await supabase
            .from("reservas")
            .update({ recordatorio_enviado: new Date().toISOString() })
            .eq("id", reserva.id);

          // Iniciar conversación en el bot
          await supabase.from("conversaciones_bot").upsert({
            telefono,
            cliente_id: reserva.cliente_id,
            estado: "esperando_confirmacion",
            contexto: { reserva_id: reserva.id, tipo: "confirmacion_reserva" },
            actualizado_at: new Date().toISOString(),
          });

          resEnviadas.push(`${cliente.nombre} (${telefono})`);
        }
      } catch (err) {
        console.error("Error procesando reserva:", err);
      }
    }
  }

  // ==========================================
  // PARTE 2: PROCESAR RECORDATORIOS POR FRECUENCIA (original)
  // ==========================================
  const { data: clientes, error } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, frecuencia_dias, proximo_recordatorio")
    .eq("notificaciones_activas", true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const cliente of clientes || []) {
    if (cliente.proximo_recordatorio && cliente.proximo_recordatorio > hoy) continue;

    const { data: ultimoCorte } = await supabase
      .from("cortes")
      .select("fecha_corte")
      .eq("cliente_id", cliente.id)
      .order("fecha_corte", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ultimoCorte) continue; // nunca se ha cortado, no sabemos cuándo recordarle

    const fechaEstimada = new Date(ultimoCorte.fecha_corte);
    fechaEstimada.setDate(fechaEstimada.getDate() + cliente.frecuencia_dias);
    if (fechaEstimada.toISOString().slice(0, 10) > hoy) continue; // todavía no le toca

    const telefono = normalizarTelefono(cliente.telefono);

    const { data: conversacionExistente } = await supabase
      .from("conversaciones_bot")
      .select("estado")
      .eq("telefono", telefono)
      .maybeSingle();
    if (conversacionExistente && conversacionExistente.estado !== "inicial") continue; // ya tiene una conversación en curso

    const { ok } = await enviarBotones(telefono, `Hola ${cliente.nombre} 👋 ¿vienes a cortarte el pelo esta semana?`, [
      { id: "confirmar_si", titulo: "Sí" },
      { id: "confirmar_no", titulo: "No" },
    ]);
    if (!ok) continue; // no marcamos la conversación como iniciada si el mensaje no se pudo mandar

    await supabase.from("conversaciones_bot").upsert({
      telefono,
      cliente_id: cliente.id,
      estado: "esperando_confirmacion",
      contexto: {},
      actualizado_at: new Date().toISOString(),
    });

    enviados.push(telefono);
  }

  return new Response(JSON.stringify({
    recordatorios_enviados: enviados,
    confirmaciones_enviadas: resEnviadas
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
