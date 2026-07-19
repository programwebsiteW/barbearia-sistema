import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

function hojeISO() { return new Date().toISOString().slice(0, 10); }
function formatarData(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

const STATUS_LABEL = { confirmado: 'Confirmado', finalizado: 'Finalizado', cancelado: 'Cancelado', faltou: 'Faltou' };

function Login({ onEntrar }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    setEnviando(true);
    setErro('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setEnviando(false);
    if (error) { setErro('Email ou senha incorretos.'); return; }
    onEntrar();
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="topbar-brand">
          <div className="topbar-mark">✂</div>
          <div>
            <div className="topbar-name">Painel</div>
            <div className="topbar-sub">Acesso do barbeiro</div>
          </div>
        </div>
      </div>
      <div className="content">
        <label>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <label>Senha</label>
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)} />
        {erro && <div className="erro">{erro}</div>}
        <button className="btn-primary" disabled={!email || !senha || enviando} onClick={entrar}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}

export default function Painel() {
  const [sessao, setSessao] = useState(undefined);
  const [cfg, setCfg] = useState(null);
  const [barbeiros, setBarbeiros] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [aba, setAba] = useState('agenda');
  const [dataFiltro, setDataFiltro] = useState(hojeISO());
  const [barbeiroFiltro, setBarbeiroFiltro] = useState('todos');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSessao(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const carregarTudo = useCallback(async (configId) => {
    const [{ data: bs }, { data: ss }, { data: cs }, { data: ags }] = await Promise.all([
      supabase.from('barbeiros').select('*').eq('config_id', configId),
      supabase.from('servicos').select('*').eq('config_id', configId),
      supabase.from('clientes').select('*').eq('config_id', configId),
      supabase.from('agendamentos').select('*').eq('config_id', configId),
    ]);
    setBarbeiros(bs || []);
    setServicos(ss || []);
    setClientes(cs || []);
    setAgendamentos(ags || []);
  }, []);

  useEffect(() => {
    if (!sessao) return;
    (async () => {
      const { data: c } = await supabase.from('config').select('*').eq('owner_id', sessao.user.id).single();
      if (!c) return;
      setCfg(c);
      await carregarTudo(c.id);

      // tempo real: qualquer mudança em agendamentos desse config, recarrega
      const canal = supabase
        .channel('agendamentos-' + c.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: `config_id=eq.${c.id}` }, () => carregarTudo(c.id))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes', filter: `config_id=eq.${c.id}` }, () => carregarTudo(c.id))
        .subscribe();

      return () => supabase.removeChannel(canal);
    })();
  }, [sessao, carregarTudo]);

  if (sessao === undefined) return null;
  if (!sessao) return <Login onEntrar={() => {}} />;
  if (!cfg) return <div className="wrap"><div className="content"><p style={{ color: 'var(--text-dim)' }}>Carregando...</p></div></div>;

  function servicoPorId(id) { return servicos.find(s => s.id === id); }
  function barbeiroPorId(id) { return barbeiros.find(b => b.id === id); }

  async function mudarStatus(ag, status) {
    await supabase.from('agendamentos').update({ status }).eq('id', ag.id);
    if (status === 'finalizado') {
      const cliente = clientes.find(c => c.id === ag.cliente_id);
      if (cliente) await supabase.from('clientes').update({ visitas: (cliente.visitas || 0) + 1 }).eq('id', cliente.id);
    }
    carregarTudo(cfg.id);
  }
  async function excluir(id) {
    await supabase.from('agendamentos').delete().eq('id', id);
    carregarTudo(cfg.id);
  }
  async function sair() { await supabase.auth.signOut(); }

  async function salvarConfig(campo, valor) {
    const novo = { ...cfg, [campo]: valor };
    setCfg(novo);
    await supabase.from('config').update({ [campo]: valor }).eq('id', cfg.id);
  }
  async function adicionarServico() {
    const { data } = await supabase.from('servicos').insert({ config_id: cfg.id, nome: 'Novo serviço', duracao_min: 30, preco: 30 }).select().single();
    if (data) setServicos([...servicos, data]);
  }
  async function atualizarServico(id, campo, valor) {
    setServicos(servicos.map(s => s.id === id ? { ...s, [campo]: valor } : s));
    await supabase.from('servicos').update({ [campo]: valor }).eq('id', id);
  }
  async function removerServico(id) {
    await supabase.from('servicos').delete().eq('id', id);
    setServicos(servicos.filter(s => s.id !== id));
  }
  async function adicionarBarbeiro() {
    const { data } = await supabase.from('barbeiros').insert({ config_id: cfg.id, nome: 'Novo barbeiro' }).select().single();
    if (data) setBarbeiros([...barbeiros, data]);
  }
  async function atualizarBarbeiro(id, nome) {
    setBarbeiros(barbeiros.map(b => b.id === id ? { ...b, nome } : b));
    await supabase.from('barbeiros').update({ nome }).eq('id', id);
  }
  async function removerBarbeiro(id) {
    await supabase.from('barbeiros').delete().eq('id', id);
    setBarbeiros(barbeiros.filter(b => b.id !== id));
  }

  const doDia = agendamentos
    .filter(a => a.data === dataFiltro && (barbeiroFiltro === 'todos' || a.barbeiro_id === barbeiroFiltro))
    .sort((a, b) => a.horario.localeCompare(b.horario));

  const hoje = hojeISO();
  const finalizadosHoje = agendamentos.filter(a => a.data === hoje && a.status === 'finalizado');
  const ganhoHoje = finalizadosHoje.reduce((s, a) => s + Number((servicoPorId(a.servico_id) || {}).preco || 0), 0);
  const atendimentosHoje = agendamentos.filter(a => a.data === hoje && a.status !== 'cancelado').length;
  const agendamentosConfirmadosHoje = agendamentos.filter(a => a.data === hoje && a.status === 'confirmado').length;

  const d = new Date();
  const dia = d.getDay();
  const diff = d.getDate() - dia + (dia === 0 ? -6 : 1);
  const semanaInicio = new Date(new Date().setDate(diff)).toISOString().slice(0, 10);
  const agSemana = agendamentos.filter(a => a.data >= semanaInicio && a.status === 'finalizado');
  const totalSemana = agSemana.reduce((s, a) => s + Number((servicoPorId(a.servico_id) || {}).preco || 0), 0);
  const faltasSemana = agendamentos.filter(a => a.data >= semanaInicio && a.status === 'faltou').length;

  return (
    <div className="wrap">
      <div className="app-shell-bg" />
      <div className="topbar">
        <div className="topbar-brand">
          <div className="topbar-mark">✂</div>
          <div>
            <div className="topbar-name">{cfg.nome_barbearia}</div>
            <div className="topbar-sub">Painel</div>
          </div>
        </div>
        <button className="logout-compact" onClick={sair}>Sair</button>
      </div>

      <section className="admin-brief">
        <div>
          <p className="eyebrow">Operação de hoje</p>
          <h1>{atendimentosHoje} atendimentos</h1>
          <span>{agendamentosConfirmadosHoje} ainda confirmados · R${ganhoHoje} finalizados</span>
        </div>
      </section>

      <div className="tabs">
        {['agenda', 'clientes', 'painel', 'ajustes'].map(t => (
          <div key={t} className={'tab' + (aba === t ? ' on' : '')} onClick={() => setAba(t)}>
            {t === 'agenda' ? 'Agenda' : t === 'clientes' ? 'Clientes' : t === 'painel' ? 'Métricas' : 'Ajustes'}
          </div>
        ))}
      </div>

      <div className="content">
        {aba === 'agenda' && (
          <>
            <div className="toolbar">
              <input type="date" value={dataFiltro} onChange={e => setDataFiltro(e.target.value)} />
              <span>{doDia.length} na agenda</span>
            </div>
            <div className="filtro-barbeiro">
              <div className={'chip' + (barbeiroFiltro === 'todos' ? ' on' : '')} onClick={() => setBarbeiroFiltro('todos')}>Todos</div>
              {barbeiros.map(b => (
                <div key={b.id} className={'chip' + (barbeiroFiltro === b.id ? ' on' : '')} onClick={() => setBarbeiroFiltro(b.id)}>{b.nome}</div>
              ))}
            </div>
            {doDia.length === 0 && <div className="vazio">Nenhum agendamento para este dia.</div>}
            {doDia.map(ag => {
              const serv = servicoPorId(ag.servico_id);
              const barb = barbeiroPorId(ag.barbeiro_id);
              const cliente = clientes.find(c => c.id === ag.cliente_id);
              return (
                <div key={ag.id}>
                  <div className="ag-row">
                    <div className="ag-time">{ag.horario}</div>
                    <div className="ag-main">
                      <div className="cliente">{cliente?.nome}</div>
                      <div className="meta">{serv?.nome} · {barb?.nome}{cliente?.telefone ? ` · ${cliente.telefone}` : ''}</div>
                    </div>
                    <span className={'status ' + ag.status}>{STATUS_LABEL[ag.status]}</span>
                  </div>
                  {ag.status === 'confirmado' && (
                    <div className="ag-acoes">
                      <button className="ag-btn success" onClick={() => mudarStatus(ag, 'finalizado')}>Finalizar</button>
                      <button className="ag-btn" onClick={() => mudarStatus(ag, 'faltou')}>Faltou</button>
                      <button className="ag-btn" onClick={() => mudarStatus(ag, 'cancelado')}>Cancelar</button>
                      <button className="ag-btn danger" onClick={() => excluir(ag.id)}>Excluir</button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {aba === 'clientes' && (
          <>
            {clientes.length === 0 && <div className="vazio">Nenhum cliente cadastrado ainda.</div>}
            {[...clientes].sort((a, b) => (b.visitas || 0) - (a.visitas || 0)).map(c => (
              <div key={c.id} className="cliente-row">
                <div><div className="name">{c.nome}</div><div className="tel">{c.telefone || 'sem telefone'}</div></div>
                <div className="badge-visitas">{c.visitas || 0} visitas</div>
              </div>
            ))}
          </>
        )}

        {aba === 'painel' && (
          <>
            <div className="section-label">Hoje</div>
            <div className="metrics">
              <div className="metric"><div className="label">Atendimentos</div><div className="value">{atendimentosHoje}</div></div>
              <div className="metric"><div className="label">Ganho estimado</div><div className="value">R${ganhoHoje}</div></div>
            </div>
            <div className="section-label">Esta semana</div>
            <div className="metrics">
              <div className="metric"><div className="label">Total ganho</div><div className="value">R${totalSemana}</div></div>
              <div className="metric"><div className="label">Faltas</div><div className="value">{faltasSemana}</div></div>
            </div>
          </>
        )}

        {aba === 'ajustes' && (
          <>
            <label>Nome da barbearia</label>
            <input type="text" value={cfg.nome_barbearia} onChange={e => salvarConfig('nome_barbearia', e.target.value)} />
            <label>Abre</label>
            <input type="text" value={cfg.abre_horas} onChange={e => salvarConfig('abre_horas', e.target.value)} placeholder="07:00" />
            <label>Fecha</label>
            <input type="text" value={cfg.fecha_horas} onChange={e => salvarConfig('fecha_horas', e.target.value)} placeholder="20:00" />

            <div className="section-label">Serviços</div>
            {servicos.map(s => (
              <div key={s.id} className="inline-row">
                <input type="text" value={s.nome} onChange={e => atualizarServico(s.id, 'nome', e.target.value)} style={{ flex: 2 }} />
                <input type="text" value={s.duracao_min} onChange={e => atualizarServico(s.id, 'duracao_min', Number(e.target.value))} style={{ width: 55 }} />
                <input type="text" value={s.preco} onChange={e => atualizarServico(s.id, 'preco', Number(e.target.value))} style={{ width: 55 }} />
                <button className="icon-btn" onClick={() => removerServico(s.id)}>✕</button>
              </div>
            ))}
            <button className="add-btn" onClick={adicionarServico}>+ Adicionar serviço</button>

            <div className="section-label">Barbeiros</div>
            {barbeiros.map(b => (
              <div key={b.id} className="inline-row">
                <input type="text" value={b.nome} onChange={e => atualizarBarbeiro(b.id, e.target.value)} style={{ flex: 1 }} />
                <button className="icon-btn" onClick={() => removerBarbeiro(b.id)}>✕</button>
              </div>
            ))}
            <button className="add-btn" onClick={adicionarBarbeiro}>+ Adicionar barbeiro</button>

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <button className="logout-btn" onClick={sair}>Sair da conta</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
