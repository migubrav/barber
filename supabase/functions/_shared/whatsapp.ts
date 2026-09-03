// Helpers para hablar con la Graph API de WhatsApp Business.
// Compartido entre el webhook (responde mensajes) y el envío de recordatorios.
//
// TODO (producción, negocio verificado): los mensajes que abren conversación
// (recordatorios que el cliente no inició) van a necesitar usar una plantilla
// aprobada por Meta en vez de texto/botones libres — por ahora estamos en
// modo prueba, donde el destinatario ya está agregado como tester.

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");

/**
 * Meta manda el "from" de los mensajes entrantes solo con dígitos (sin "+"),
 * pero en `clientes.telefono` puede haber quedado guardado con "+" u otros
 * caracteres. Normalizamos a solo dígitos en todos los puntos de contacto
 * con WhatsApp para que las búsquedas por teléfono siempre coincidan.
 */
export function normalizarTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

async function llamarGraphAPI(payload: Record<string, unknown>) {
  const respuesta = await fetch(`https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  const datos = await respuesta.json();
  if (!respuesta.ok) {
    console.error("Error de la Graph API:", JSON.stringify(datos));
  }
  return { ok: respuesta.ok, datos };
}

export function enviarTexto(telefono: string, mensaje: string) {
  return llamarGraphAPI({ to: telefono, type: "text", text: { body: mensaje } });
}

/** Hasta 3 botones. Cada boton: { id, titulo } (titulo max 20 caracteres) */
export function enviarBotones(telefono: string, texto: string, botones: { id: string; titulo: string }[]) {
  return llamarGraphAPI({
    to: telefono,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: texto },
      action: {
        buttons: botones.map((b) => ({ type: "reply", reply: { id: b.id, title: b.titulo } })),
      },
    },
  });
}

/** Hasta 10 filas. Cada fila: { id, titulo } */
export function enviarLista(
  telefono: string,
  texto: string,
  tituloBoton: string,
  filas: { id: string; titulo: string }[],
) {
  return llamarGraphAPI({
    to: telefono,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: texto },
      action: {
        button: tituloBoton,
        sections: [{ title: "Opciones", rows: filas.map((f) => ({ id: f.id, title: f.titulo })) }],
      },
    },
  });
}

/** Extrae el texto libre o el id del botón/lista elegido de un mensaje entrante de Meta */
export function extraerRespuesta(mensaje: any): string | null {
  if (mensaje.type === "text") return mensaje.text?.body?.trim() ?? null;
  if (mensaje.type === "interactive") {
    const interactivo = mensaje.interactive;
    if (interactivo?.type === "button_reply") return interactivo.button_reply.id;
    if (interactivo?.type === "list_reply") return interactivo.list_reply.id;
  }
  return null;
}
