// enviar-recordatorios
// Revisa qué clientes ya deberían venir a cortarse el pelo (según su último
// corte + frecuencia_dias) y les manda el mensaje de confirmación por
// WhatsApp, abriendo su conversación en conversaciones_bot.
//
// Pensada para invocarse una vez al día vía un cron (pg_cron + pg_net). Por
// ahora se invoca a mano para probar el flujo completo.
//
// Protegida con un secret propio (CRON_SECRET) para que no cualquiera con la
// URL pueda mandar WhatsApps reales a los clientes.
//
// TODO: hoy manda un solo recordatorio cuando la fecha estimada ya llegó.
// El diseño original habla de 2 mensajes (unos días antes + el día anterior)
// — falta agregar esa distinción cuando probemos que este flujo simple funciona.

import { createClient } from "npm:@supabase/supabase-js@2";
import { enviarBotones, normalizarTelefono } from "../_shared/whatsapp.ts";

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

  const enviados: string[] = [];

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

  return new Response(JSON.stringify({ recordatorios_enviados: enviados }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
