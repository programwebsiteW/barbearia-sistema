-- ============================================================
-- SCHEMA: Sistema de Agendamento para Barbearia
-- Rode este arquivo inteiro no Supabase: SQL Editor -> New query -> colar -> Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- TABELAS ----------

create table config (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  nome_barbearia text not null default 'Barbearia',
  cor_principal text not null default '#c9a45c',
  abre_horas text not null default '07:00',
  fecha_horas text not null default '20:00',
  created_at timestamptz not null default now()
);

create table barbeiros (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references config(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true
);

create table servicos (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references config(id) on delete cascade,
  nome text not null,
  duracao_min int not null,
  preco numeric(10,2) not null,
  ativo boolean not null default true
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references config(id) on delete cascade,
  nome text not null,
  telefone text not null default '',
  visitas int not null default 0,
  created_at timestamptz not null default now()
);

create sequence agendamento_protocolo_seq;

create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references config(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  barbeiro_id uuid not null references barbeiros(id) on delete cascade,
  servico_id uuid not null references servicos(id) on delete cascade,
  data date not null,
  horario text not null,
  status text not null default 'confirmado' check (status in ('confirmado','finalizado','cancelado','faltou')),
  protocolo text not null default ('AGD-' || lpad(nextval('agendamento_protocolo_seq')::text, 4, '0')),
  created_at timestamptz not null default now()
);

create index idx_agendamentos_config_data on agendamentos(config_id, data);

-- ---------- ROW LEVEL SECURITY ----------
-- Regra geral: qualquer pessoa (anônima) pode LER config/barbeiros/serviços
-- (precisa disso pra montar a tela de agendamento), mas só o DONO autenticado
-- pode ler/editar clientes e agendamentos. A inserção de agendamento pelo
-- cliente acontece só através da função criar_agendamento() abaixo, que
-- roda com permissão elevada e faz suas próprias checagens — o público
-- nunca tem permissão de INSERT/UPDATE/DELETE direto nessas tabelas.

alter table config enable row level security;
alter table barbeiros enable row level security;
alter table servicos enable row level security;
alter table clientes enable row level security;
alter table agendamentos enable row level security;

create policy "config: leitura publica" on config for select using (true);
create policy "config: dono edita" on config for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "barbeiros: leitura publica" on barbeiros for select using (true);
create policy "barbeiros: dono edita" on barbeiros for all using (
  exists (select 1 from config c where c.id = barbeiros.config_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from config c where c.id = barbeiros.config_id and c.owner_id = auth.uid())
);

create policy "servicos: leitura publica" on servicos for select using (true);
create policy "servicos: dono edita" on servicos for all using (
  exists (select 1 from config c where c.id = servicos.config_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from config c where c.id = servicos.config_id and c.owner_id = auth.uid())
);

-- clientes e agendamentos: NENHUM acesso público direto (nem leitura, nem escrita)
create policy "clientes: dono le e edita" on clientes for all using (
  exists (select 1 from config c where c.id = clientes.config_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from config c where c.id = clientes.config_id and c.owner_id = auth.uid())
);

create policy "agendamentos: dono le e edita" on agendamentos for all using (
  exists (select 1 from config c where c.id = agendamentos.config_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from config c where c.id = agendamentos.config_id and c.owner_id = auth.uid())
);

-- ---------- FUNÇÃO PARA O CLIENTE AGENDAR (única porta de entrada pública) ----------
-- Roda com privilégio elevado (SECURITY DEFINER), então funciona mesmo com
-- RLS bloqueando o público em clientes/agendamentos. Ela mesma valida
-- conflito de horário no servidor (não só no navegador do cliente).

create or replace function criar_agendamento(
  p_config_id uuid,
  p_barbeiro_id uuid,
  p_servico_id uuid,
  p_data date,
  p_horario text,
  p_nome text,
  p_telefone text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_duracao int;
  v_fim_novo time;
  v_conflito int;
  v_protocolo text;
begin
  select duracao_min into v_duracao from servicos where id = p_servico_id and config_id = p_config_id;
  if v_duracao is null then
    raise exception 'Serviço inválido';
  end if;

  v_fim_novo := (p_horario::time + (v_duracao || ' minutes')::interval);

  -- checa conflito real no servidor: existe algum agendamento ativo do mesmo
  -- barbeiro, no mesmo dia, cujo intervalo cruza com o novo horário
  select count(*) into v_conflito
  from agendamentos a
  join servicos s on s.id = a.servico_id
  where a.barbeiro_id = p_barbeiro_id
    and a.data = p_data
    and a.status <> 'cancelado'
    and a.horario::time < v_fim_novo
    and (a.horario::time + (s.duracao_min || ' minutes')::interval) > p_horario::time;

  if v_conflito > 0 then
    raise exception 'Horário já ocupado';
  end if;

  select id into v_cliente_id from clientes
  where config_id = p_config_id and telefone = p_telefone and telefone <> '';

  if v_cliente_id is null then
    insert into clientes (config_id, nome, telefone, visitas)
    values (p_config_id, p_nome, p_telefone, 0)
    returning id into v_cliente_id;
  end if;

  insert into agendamentos (config_id, cliente_id, barbeiro_id, servico_id, data, horario, status)
  values (p_config_id, v_cliente_id, p_barbeiro_id, p_servico_id, p_data, p_horario, 'confirmado')
  returning protocolo into v_protocolo;

  return v_protocolo;
end;
$$;

grant execute on function criar_agendamento to anon, authenticated;

-- ---------- DADOS INICIAIS ----------
-- Depois de rodar este schema:
-- 1. Vá em Authentication -> Users -> Add user (crie seu login: email + senha)
-- 2. Copie o "User UID" gerado
-- 3. Cole abaixo no lugar de 'COLE_AQUI_O_USER_UID' e rode só este bloco final

/*
insert into config (owner_id, nome_barbearia, cor_principal, abre_horas, fecha_horas)
values ('COLE_AQUI_O_USER_UID', 'Barbearia Modelo', '#c9a45c', '07:00', '20:00')
returning id;

-- pegue o "id" retornado acima e use no lugar de 'COLE_AQUI_O_CONFIG_ID' abaixo

insert into barbeiros (config_id, nome) values
  ('COLE_AQUI_O_CONFIG_ID', 'Carlos'),
  ('COLE_AQUI_O_CONFIG_ID', 'Diego');

insert into servicos (config_id, nome, duracao_min, preco) values
  ('COLE_AQUI_O_CONFIG_ID', 'Corte', 30, 40),
  ('COLE_AQUI_O_CONFIG_ID', 'Barba', 20, 25),
  ('COLE_AQUI_O_CONFIG_ID', 'Corte + Barba', 50, 60);
*/
