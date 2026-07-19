import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient.js';

function hojeISO() { return new Date().toISOString().slice(0, 10); }
function formatarData(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function addMin(hhmm, min) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function agoraHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function gerarHorarios(abre, fecha) {
  const [h0, m0] = abre.split(':').map(Number);
  const [h1, m1] = fecha.split(':').map(Number);
  const arr = [];
  let t = h0 * 60 + m0;
  const fim = h1 * 60 + m1;
  while (t < fim) {
    arr.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    t += 30;
  }
  return arr;
}
function capitalizarNome(texto) {
  return texto.split(' ').map(p => p.length ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p).join(' ');
}
function iniciais(nome) {
  return nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

const STEP_TEXT = {
  1: {
    label: 'Profissional',
    title: 'Quem vai te atender?',
    hint: 'Escolha o barbeiro de preferência para liberar os serviços disponíveis.',
  },
  2: {
    label: 'Serviço',
    title: 'Qual serviço você quer?',
    hint: 'Cada serviço já considera o tempo necessário para reservar sua agenda.',
  },
  3: {
    label: 'Data e horário',
    title: 'Quando fica melhor?',
    hint: 'Os horários abaixo já ignoram agenda ocupada e serviços que não cabem no dia.',
  },
  4: {
    label: 'Seus dados',
    title: 'Falta só confirmar',
    hint: 'Use um WhatsApp válido para a barbearia conseguir falar com você se precisar.',
  },
};

export default function Agendar() {
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState('');
  const [cfg, setCfg] = useState(null);
  const [barbeiros, setBarbeiros] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [agendamentosDoDia, setAgendamentosDoDia] = useState([]);

  const [passo, setPasso] = useState(1);
  const [barbeiroId, setBarbeiroId] = useState(null);
  const [servicoId, setServicoId] = useState(null);
  const [data, setData] = useState(hojeISO());
  const [horario, setHorario] = useState(null);
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const [protocolo, setProtocolo] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: configs, error: e1 } = await supabase.from('config').select('*').limit(1).single();
      if (e1 || !configs) { setErroCarregar('Não foi possível carregar os dados da barbearia.'); setCarregando(false); return; }
      setCfg(configs);
      const [{ data: bs }, { data: ss }] = await Promise.all([
        supabase.from('barbeiros').select('*').eq('config_id', configs.id).eq('ativo', true),
        supabase.from('servicos').select('*').eq('config_id', configs.id).eq('ativo', true),
      ]);
      setBarbeiros(bs || []);
      setServicos(ss || []);
      setCarregando(false);
    })();
  }, []);

  useEffect(() => {
    if (!cfg || !barbeiroId) return;
    (async () => {
      const { data: ags } = await supabase
        .from('agendamentos')
        .select('horario, status, servico_id')
        .eq('config_id', cfg.id)
        .eq('barbeiro_id', barbeiroId)
        .eq('data', data)
        .neq('status', 'cancelado');
      setAgendamentosDoDia(ags || []);
    })();
  }, [cfg, barbeiroId, data]);

  const horariosBase = useMemo(() => cfg ? gerarHorarios(cfg.abre_horas, cfg.fecha_horas) : [], [cfg]);
  const servico = servicos.find(s => s.id === servicoId);
  const barbeiro = barbeiros.find(b => b.id === barbeiroId);
  const etapaAtual = STEP_TEXT[passo];

  const horariosDisponiveis = useMemo(() => {
    if (!servico || !cfg) return [];
    const ocupados = new Set();
    agendamentosDoDia.forEach(a => {
      const s = servicos.find(x => x.id === a.servico_id) || { duracao_min: 30 };
      const fim = addMin(a.horario, s.duracao_min);
      horariosBase.forEach(h => { if (h >= a.horario && h < fim) ocupados.add(h); });
    });
    const ehHoje = data === hojeISO();
    const agora = agoraHHMM();
    return horariosBase.filter(h => {
      const fimServico = addMin(h, servico.duracao_min);
      if (fimServico > cfg.fecha_horas) return false;
      if (ehHoje && h <= agora) return false;
      for (const hh of horariosBase) if (hh >= h && hh < fimServico && ocupados.has(hh)) return false;
      return true;
    });
  }, [servico, cfg, agendamentosDoDia, horariosBase, data, servicos]);

  async function confirmar() {
    if (!nome.trim() || !horario) return;
    setEnviando(true);
    setErroEnvio('');
    const { data: result, error } = await supabase.rpc('criar_agendamento', {
      p_config_id: cfg.id,
      p_barbeiro_id: barbeiroId,
      p_servico_id: servicoId,
      p_data: data,
      p_horario: horario,
      p_nome: nome.trim(),
      p_telefone: tel.trim(),
    });
    setEnviando(false);
    if (error) {
      setErroEnvio(error.message.includes('ocupado') ? 'Esse horário acabou de ser ocupado por outra pessoa. Escolha outro.' : 'Não foi possível confirmar. Tente novamente.');
      return;
    }
    setProtocolo(result);
    setPasso(5);
  }

  if (carregando) return <div className="wrap"><div className="content"><p style={{ color: 'var(--text-dim)' }}>Carregando...</p></div></div>;
  if (erroCarregar) return <div className="wrap"><div className="content"><p className="erro">{erroCarregar}</p></div></div>;

  const horaAgora = new Date();
  const aberto = cfg && (() => {
    const h = `${String(horaAgora.getHours()).padStart(2, '0')}:${String(horaAgora.getMinutes()).padStart(2, '0')}`;
    return h >= cfg.abre_horas && h < cfg.fecha_horas;
  })();

  return (
    <div className="wrap">
      <div className="app-shell-bg" />
      <div className="topbar">
        <div className="topbar-brand">
          <div className="topbar-mark">✂</div>
          <div>
            <div className="topbar-name">{cfg.nome_barbearia}</div>
            <div className="topbar-sub">{cfg.abre_horas} – {cfg.fecha_horas}</div>
          </div>
        </div>
        <span className="status-pill" style={!aberto ? { background: 'var(--gray-bg)', color: 'var(--text-dim)' } : undefined}>
          {aberto ? 'Aberto agora' : 'Fechado'}
        </span>
      </div>

      <section className="booking-hero">
        <div>
          <p className="eyebrow">Agendamento online</p>
          <h1>{cfg.nome_barbearia}</h1>
          <p>Escolha o profissional, reserve seu horário e receba o resumo do atendimento em poucos passos.</p>
        </div>
        <div className="hero-hours">
          <span>Hoje</span>
          <strong>{cfg.abre_horas} – {cfg.fecha_horas}</strong>
        </div>
      </section>

      {passo <= 4 && (
        <>
          <div className="steps">
            {[1, 2, 3, 4].map(p => <div key={p} className={'seg' + (p <= passo ? ' on' : '')} />)}
          </div>
          <div className="step-label">{etapaAtual.label}</div>
        </>
      )}

      <div className="content">
        {passo <= 4 && (
          <div className="step-intro">
            <div className="step-title">{etapaAtual.title}</div>
            <p>{etapaAtual.hint}</p>
          </div>
        )}

        {passo > 1 && passo <= 4 && (
          <div className="booking-summary">
            {barbeiro && <span>{barbeiro.nome}</span>}
            {servico && <span>{servico.nome}</span>}
            {passo >= 4 && <span>{formatarData(data)} às {horario}</span>}
          </div>
        )}

        {passo === 1 && (
          <div>
            {barbeiros.map(b => (
              <button key={b.id} className="list-row" onClick={() => { setBarbeiroId(b.id); setPasso(2); }}>
                <div className="left"><div className="avatar">{iniciais(b.nome)}</div><div><div className="name">{b.nome}</div><div className="sub">Agenda aberta para hoje</div></div></div>
                <span className="chevron">›</span>
              </button>
            ))}
          </div>
        )}

        {passo === 2 && (
          <div>
            {servicos.map(s => (
              <button key={s.id} className="list-row" onClick={() => { setServicoId(s.id); setPasso(3); }}>
                <div className="left"><div><div className="name">{s.nome}</div><div className="sub">{s.duracao_min} min</div></div></div>
                <div className="price">R${s.preco}</div>
              </button>
            ))}
            <button className="back" onClick={() => setPasso(1)}>← Voltar</button>
          </div>
        )}

        {passo === 3 && (
          <div>
            <label>Data</label>
            <input type="date" min={hojeISO()} value={data} onChange={e => { setData(e.target.value); setHorario(null); }} />
            <div className="field-head">
              <label>Horários disponíveis</label>
              <span>{horariosDisponiveis.length} opções</span>
            </div>
            <div className="horarios">
              {horariosDisponiveis.length === 0 && (
                <div className="sugestao">
                  Sem horários para hoje.
                  <button onClick={() => { const d = new Date(data + 'T12:00:00'); d.setDate(d.getDate() + 1); setData(d.toISOString().slice(0, 10)); setHorario(null); }}>Ver amanhã →</button>
                </div>
              )}
              {horariosDisponiveis.map(h => (
                <button key={h} className={'horario-btn' + (horario === h ? ' on' : '')} onClick={() => { setHorario(h); setPasso(4); }}>{h}</button>
              ))}
            </div>
            <button className="back" onClick={() => setPasso(2)}>← Voltar</button>
          </div>
        )}

        {passo === 4 && (
          <div>
            <div className="resumo"><b>{servico?.nome}</b> · {barbeiro?.nome}<br />{formatarData(data)} às {horario}</div>
            <label>Nome</label>
            <input type="text" placeholder="Seu nome" value={nome} onChange={e => setNome(capitalizarNome(e.target.value))} />
            <label>WhatsApp</label>
            <input type="text" placeholder="Seu número com DDD" value={tel} onChange={e => setTel(e.target.value)} />
            {erroEnvio && <div className="erro">{erroEnvio}</div>}
            <button className="btn-primary" disabled={!nome.trim() || enviando} onClick={confirmar}>
              {enviando ? 'Confirmando...' : 'Confirmar agendamento'}
            </button>
            <button className="back" onClick={() => setPasso(3)}>← Voltar</button>
          </div>
        )}

        {passo === 5 && (
          <div>
            <div className="ticket">
              <div className="ticket-head">
                <div className="ok">✓</div>
                <h2>Confirmado</h2>
              </div>
              <div className="ticket-body">
                <div className="ticket-row"><span>Serviço</span><b>{servico?.nome}</b></div>
                <div className="ticket-row"><span>Profissional</span><b>{barbeiro?.nome}</b></div>
                <div className="ticket-row"><span>Data</span><b>{formatarData(data)}</b></div>
                <div className="ticket-row"><span>Horário</span><b>{horario}</b></div>
              </div>
              <div className="ticket-foot"><span className="protocolo">{protocolo}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
