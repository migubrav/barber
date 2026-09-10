// limpiar-no-shows
// Corre cada 30 minutos (vía cron)
// Busca reservas que ya pasaron su hora y están en estado "pendiente" o "confirmada"
// Las marca como "no_show" para registrar que el cliente no llegó

import { createClient } from "npm:@supabase/supabase-js@2";
import { enviarTexto } from "../_shared/whatsapp.ts";

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

  try {
    const ahora = new Date();
    const horaActualISO = ahora.toTimeString().slice(0, 5); // HH:MM
    const fechaActualISO = ahora.toISOString().slice(0, 10); // YYYY-MM-DD

    // Buscar reservas que YA PASARON su hora de fin
    // y están en estado "pendiente" o "confirmada"
    const { data: reservasPasadas, error: errBusqueda } = await supabase
      .from("reservas")
      .select("id, fecha, hora_fin, cliente_id, clientes(nombre, telefono), barberos(nombre)")
      .in("estado", ["pendiente", "confirmada"])
      .or(`fecha.lt.${fechaActualISO},and(fecha.eq.${fechaActualISO},hora_fin.lt.${horaActualISO})`);

    if (errBusqueda) {
      console.error("Error buscando no-shows:", errBusqueda);
      return new Response(JSON.stringify({ error: errBusqueda.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const noShows: string[] = [];

    if (reservasPasadas && reservasPasadas.length > 0) {
      for (const reserva of reservasPasadas) {
        try {
          // Cambiar estado a "no_show"
          const { error: errUpdate } = await supabase
            .from("reservas")
            .update({ estado: "no_show" })
            .eq("id", reserva.id);

          if (errUpdate) {
            console.error(`Error actualizando reserva ${reserva.id}:`, errUpdate);
            continue;
          }

          const cliente = reserva.clientes as any;
          noShows.push(`${cliente?.nombre || "Cliente"} (${reserva.fecha} ${reserva.hora_fin})`);

          // Intentar enviar mensaje de seguimiento al cliente (opcional)
          try {
            if (cliente?.telefono) {
              await enviarTexto(
                cliente.telefono,
                `Hola ${cliente.nombre} 👋\n\nNotamos que no llegaste a tu reserva del ${reserva.fecha}.\n\nSi tuviste un imprevisto, avísanos. Cuando quieras reagendar, aquí estamos 🙏`
              );
            }
          } catch (errWA) {
            console.error(`Error enviando mensaje a ${cliente?.telefono}:`, errWA);
            // No fallar por esto, solo loguear
          }
        } catch (err) {
          console.error("Error procesando no-show:", err);
        }
      }
    }

    return new Response(
      JSON.stringify({
        mensaje: "Limpeza de no-shows completada",
        total_procesadas: noShows.length,
        no_shows: noShows,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error en limpiar-no-shows:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
