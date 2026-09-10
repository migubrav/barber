/**
 * calcular_recordatorio.ts
 * Calcula cuándo enviar el recordatorio de confirmación según la fecha/hora de la reserva
 *
 * Reglas:
 * - Si reserva es MAÑANA → enviar HOY a las 09:00 AM
 * - Si reserva es HOY → enviar 40 minutos antes de la hora
 * - Si reserva es pasado → no enviar (retorna null)
 */

export interface ResultadoRecordatorio {
  debe_enviar: boolean;
  momento_envio: Date | null;
  razon: string;
}

/**
 * Calcula si debe enviar recordatorio y cuándo
 * @param fecha_reserva - Fecha de la reserva (YYYY-MM-DD)
 * @param hora_reserva - Hora de la reserva (HH:MM)
 * @param zona_horaria - Zona horaria (default: "America/Santiago")
 * @returns {ResultadoRecordatorio}
 */
export function calcularRecordatorio(
  fecha_reserva: string,
  hora_reserva: string,
  zona_horaria: string = "America/Santiago"
): ResultadoRecordatorio {
  try {
    // Crear objetos Date con zona horaria Chile
    const ahora = new Date();

    // Parsear fecha y hora de la reserva
    const [año, mes, dia] = fecha_reserva.split("-").map(Number);
    const [horas, minutos] = hora_reserva.split(":").map(Number);

    // Crear fecha de la reserva (en hora local de Chile)
    const fecha_res = new Date(año, mes - 1, dia, horas, minutos, 0, 0);

    // Hoy en Chile
    const hoy = new Date();
    const hoy_inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);
    const mañana_inicio = new Date(hoy_inicio);
    mañana_inicio.setDate(mañana_inicio.getDate() + 1);

    // Fecha de la reserva (sin hora)
    const fecha_res_inicio = new Date(fecha_res.getFullYear(), fecha_res.getMonth(), fecha_res.getDate(), 0, 0, 0, 0);

    // Comparar fechas
    const es_hoy = fecha_res_inicio.getTime() === hoy_inicio.getTime();
    const es_mañana = fecha_res_inicio.getTime() === mañana_inicio.getTime();
    const es_futuro = fecha_res_inicio.getTime() > mañana_inicio.getTime();

    // CASO 1: Reserva es MAÑANA
    // Enviar hoy a las 09:00 AM
    if (es_mañana) {
      const momento = new Date(hoy);
      momento.setHours(9, 0, 0, 0);

      // Si ya pasó las 9am hoy, enviar inmediatamente
      if (momento < ahora) {
        return {
          debe_enviar: true,
          momento_envio: ahora,
          razon: "Reserva es mañana, pero ya pasó las 9am - enviar ahora"
        };
      }

      return {
        debe_enviar: true,
        momento_envio: momento,
        razon: "Reserva es mañana - enviar hoy a las 09:00 AM"
      };
    }

    // CASO 2: Reserva es HOY
    // Enviar 40 minutos antes de la hora
    if (es_hoy) {
      const momento = new Date(fecha_res);
      momento.setMinutes(momento.getMinutes() - 40);

      // Si ya pasó el momento de envío, enviar inmediatamente
      if (momento < ahora) {
        return {
          debe_enviar: true,
          momento_envio: ahora,
          razon: "Reserva es hoy - enviar ahora (pasó el tiempo de 40 min antes)"
        };
      }

      return {
        debe_enviar: true,
        momento_envio: momento,
        razon: `Reserva es hoy - enviar 40 min antes (${momento.toLocaleTimeString("es-CL")})`
      };
    }

    // CASO 3: Reserva es en otros días (no hoy, no mañana)
    if (es_futuro) {
      const momento = new Date(fecha_res_inicio);
      momento.setHours(9, 0, 0, 0);

      return {
        debe_enviar: true,
        momento_envio: momento,
        razon: `Reserva es ${fecha_reserva} - enviar ese día a las 09:00 AM`
      };
    }

    // CASO 4: Reserva es en el pasado
    return {
      debe_enviar: false,
      momento_envio: null,
      razon: "Reserva es en el pasado - no enviar"
    };
  } catch (error) {
    return {
      debe_enviar: false,
      momento_envio: null,
      razon: `Error calculando: ${error}`
    };
  }
}

/**
 * Verifica si ES MOMENTO de enviar el recordatorio
 * @param momento_programado - Cuándo se programó enviar
 * @returns true si es hora de enviar (con margen de 1 minuto)
 */
export function esHoraDeEnviar(momento_programado: Date | null): boolean {
  if (!momento_programado) return false;

  const ahora = new Date();
  const margen_ms = 60 * 1000; // 1 minuto de margen

  // Si el momento programado ya pasó (con margen), es hora de enviar
  return ahora.getTime() >= (momento_programado.getTime() - margen_ms);
}
