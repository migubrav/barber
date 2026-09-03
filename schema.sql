-- =========================================================
-- Esquema: Sistema de gestión y recordatorios para barbería
-- =========================================================

-- Barberos (quiénes atienden)
create table if not exists barberos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  hora_apertura time not null default '10:00',
  hora_cierre time not null default '20:00',
  created_at timestamptz not null default now()
);

-- Clientes (registrados por QR)
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null unique, -- número de WhatsApp
  frecuencia_dias int not null default 14, -- cada cuántos días se corta el pelo
  fecha_registro timestamptz not null default now(),
  notificaciones_activas boolean not null default true, -- false = cliente pidió que no le escribamos más recordatorios
  proximo_recordatorio date, -- si el cliente pidió "escríbeme en unos días", la fecha en que el bot debe reintentar
  created_at timestamptz not null default now()
);

-- Historial de cortes (cada vez que un cliente se corta el pelo)
create table if not exists cortes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  barbero_id uuid references barberos(id),
  fecha_corte timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Configuración general (ajustable por el dueño)
create table if not exists configuracion (
  id int primary key default 1,
  duracion_corte_min int not null default 45,
  tolerancia_min int not null default 10, -- minutos de gracia para reservas
  radio_deteccion_km int not null default 40,
  constraint solo_una_fila check (id = 1)
);
insert into configuracion (id) values (1) on conflict (id) do nothing;

-- Reservas (horas agendadas)
create table if not exists reservas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  barbero_id uuid references barberos(id),
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  estado text not null default 'confirmada'
    check (estado in ('confirmada','en_tolerancia','completada','no_show','cancelada')),
  origen text not null default 'whatsapp' check (origen in ('whatsapp','web','walk_in')),
  created_at timestamptz not null default now()
);

-- Cola de espera en tiempo real (walk-ins y estado del día)
create table if not exists cola_espera (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  barbero_id uuid references barberos(id),
  nombre_walk_in text, -- si no está registrado como cliente
  estado text not null default 'esperando'
    check (estado in ('esperando','en_corte','completado','cancelado')),
  hora_entrada timestamptz not null default now(),
  hora_inicio_corte timestamptz,
  hora_fin_corte timestamptz,
  created_at timestamptz not null default now()
);

-- Estado de la conversación con el bot de WhatsApp (una fila por número de teléfono activo)
create table if not exists conversaciones_bot (
  telefono text primary key,
  cliente_id uuid references clientes(id),
  estado text not null default 'inicial'
    check (estado in (
      'inicial',               -- sin conversación pendiente
      'esperando_confirmacion',-- mandamos el recordatorio, esperando SÍ/NO
      'esperando_postergar',   -- cliente dijo NO, preguntamos si quiere que le escribamos en unos días
      'esperando_dias',        -- cliente dijo que sí quiere reintento, esperando el número de días
      'agendando'              -- cliente dijo SÍ, en pleno flujo de elegir barbero/día/hora
    )),
  contexto jsonb not null default '{}', -- datos parciales del flujo actual (ej: barbero elegido, fecha elegida)
  actualizado_at timestamptz not null default now()
);

-- Mensajes enviados (para no duplicar recordatorios y llevar trazabilidad)
create table if not exists mensajes_enviados (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null check (tipo in ('recordatorio_temprano','recordatorio_final','confirmacion_reserva','aviso_no_show')),
  contenido text,
  enviado_at timestamptz not null default now()
);

-- Índices útiles
create index if not exists idx_cortes_cliente on cortes(cliente_id);
create index if not exists idx_reservas_fecha on reservas(fecha, hora_inicio);
create index if not exists idx_cola_estado on cola_espera(estado);
create index if not exists idx_mensajes_cliente on mensajes_enviados(cliente_id, tipo);
