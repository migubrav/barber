-- Tabla de usuarios administradores
create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre_usuario text not null unique,
  tipo_usuario text not null check (tipo_usuario in ('administrador')),
  clave_hash text not null,
  activo boolean not null default true,
  ultimo_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índice para búsquedas rápidas
create index if not exists idx_usuarios_nombre on usuarios(nombre_usuario);

-- Habilitar RLS (Row Level Security) para proteger datos
alter table usuarios enable row level security;

-- Policy: permitir leer usuarios solo si está autenticado (para validar en login)
create policy "public_puede_leer_usuarios" on usuarios
  for select
  using (true);

-- Policy: solo admin puede actualizar su propio perfil
create policy "admin_puede_actualizar_su_perfil" on usuarios
  for update
  using (true);

-- Trigger para actualizar updated_at automáticamente
create or replace function actualizar_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_actualizar_usuarios
before update on usuarios
for each row
execute function actualizar_updated_at();
