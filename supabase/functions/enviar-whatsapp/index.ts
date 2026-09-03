// enviar-whatsapp
// Manda un mensaje de texto de WhatsApp a un número dado, vía la Graph API de Meta.
// Pensada como pieza base: por ahora solo envía texto libre (modo prueba, sin
// plantillas). La lógica de conversaciones_bot la va a llamar más adelante.
//
// Invocación de prueba:
//   curl -X POST https://vpqwrbilrgxisdgirpph.supabase.co/functions/v1/enviar-whatsapp \
//     -H "Content-Type: application/json" \
//     -d '{"telefono": "56912345678", "mensaje": "Hola, esto es una prueba"}'
//
// IMPORTANTE (modo prueba de Meta):
// - El "telefono" debe ser un número agregado como destinatario de prueba en
//   Meta for Developers (por ahora, solo el celular personal de Miguel).
// - Solo se puede mandar texto libre. Cuando el negocio esté verificado, los
//   mensajes que abran conversación (recordatorios que el cliente no inició)
//   van a tener que usar una plantilla aprobada por Meta en vez de
//   { type: "text", text: { body: mensaje } } — ver TODO más abajo.

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido, usa POST" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    return new Response(
      JSON.stringify({ error: "Faltan secrets WHATSAPP_TOKEN o WHATSAPP_PHONE_ID en el proyecto" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { telefono?: string; mensaje?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body inválido, se espera JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { telefono, mensaje } = body;
  if (!telefono || !mensaje) {
    return new Response(JSON.stringify({ error: "Faltan 'telefono' o 'mensaje' en el body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // TODO (producción, negocio verificado): si este mensaje es un recordatorio
  // que el cliente no inició (fuera de la ventana de 24h de conversación), acá
  // hay que cambiar el payload a { type: "template", template: {...} } con una
  // plantilla aprobada por Meta, en vez de texto libre.
  const respuestaMeta = await fetch(`https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefono,
      type: "text",
      text: { body: mensaje },
    }),
  });

  const datosMeta = await respuestaMeta.json();

  if (!respuestaMeta.ok) {
    return new Response(JSON.stringify({ error: "Meta rechazó el mensaje", detalle: datosMeta }), {
      status: respuestaMeta.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ exito: true, respuesta: datosMeta }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
