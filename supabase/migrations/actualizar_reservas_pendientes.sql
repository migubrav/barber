-- Migración: Actualizar tabla reservas para flujo de confirmación
-- Cambiar estado inicial de 'confirmada' a 'pendiente'
-- Agregar campo para trackear recordatorios enviados

-- 1. Agregar campo recordatorio_enviado (si no existe)
alter table reservas
add column if not exists recordatorio_enviado timestamptz;

-- 2. Crear nueva constraint sin 'confirmada' como default
-- (Primero copiar datos, luego dropear y recrear)
alter table reservas
drop constraint if exists reservas_estado_check;

alter table reservas
add constraint reservas_estado_check
check (estado in ('pendiente', 'confirmada', 'en_tolerancia', 'completada', 'no_show', 'cancelada'));

-- 3. Cambiar default a 'pendiente'
alter table reservas
alter column estado set default 'pendiente';

-- 4. Actualizar reservas existentes que estén en 'confirmada'
-- (opcional: mantener las antiguas como están)
-- update reservas set estado = 'pendiente' where estado = 'confirmada' and fecha > now()::date;

-- 5. Agregar índice para búsquedas rápidas
create index if not exists idx_reservas_estado_fecha
on reservas(estado, fecha);

create index if not exists idx_reservas_recordatorio
on reservas(recordatorio_enviado, estado);
