import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, Bell, CarFront, CheckCircle2, Clock3, History, MapPin, Menu, Plus, Power, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Vehicle = { id: string; plate: string; make: string | null; model: string | null; color: string | null; vehicle_type: string | null };
type ParkingSpace = { id: string; code: string; category: string; zone_id: string | null; parking_zones?: { name: string } | null };
type BeneficiaryCategory = 'conventional' | 'elderly' | 'accessible';
type ParkingSession = { id: string; plate_snapshot: string; started_at: string; expires_at: string; ended_at: string | null; status: string; space_id: string | null; beneficiary_category: BeneficiaryCategory; parking_spaces?: { code: string; parking_zones?: { name: string } | null } | null };
type Notice = { id: string; title: string; body: string; kind: string; read_at: string | null; created_at: string };
type Profile = { id: string; full_name: string; role: string };

const platePattern = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
const fmtDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const remaining = (expiresAt: string, now: number) => Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
const timerLabel = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export default function CitizenWorkspace({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [tab, setTab] = useState<'overview' | 'register' | 'vehicles' | 'history' | 'notifications'>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [vehicleForm, setVehicleForm] = useState({ plate: '', make: '', model: '', color: '', vehicle_type: 'Passeio' });
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedSpace, setSelectedSpace] = useState('');
  const [beneficiaryCategory, setBeneficiaryCategory] = useState<BeneficiaryCategory>('conventional');
  const [credentialConfirmed, setCredentialConfirmed] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const client = supabase;
    const [vehicleResult, sessionResult, spaceResult, noticeResult] = await Promise.all([
      client.from('vehicles').select('id,plate,make,model,color,vehicle_type').eq('owner_id', profile.id).order('created_at', { ascending: false }),
      client.from('parking_sessions').select('id,plate_snapshot,started_at,expires_at,ended_at,status,space_id,beneficiary_category,parking_spaces(code,parking_zones(name))').eq('user_id', profile.id).order('started_at', { ascending: false }).limit(50),
      client.from('parking_spaces').select('id,code,category,zone_id,parking_zones(name)').eq('active', true).order('code'),
      client.from('notifications').select('id,title,body,kind,read_at,created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(30),
    ]);
    if (vehicleResult.error) throw vehicleResult.error;
    if (sessionResult.error) throw sessionResult.error;
    if (spaceResult.error) throw spaceResult.error;
    if (noticeResult.error) throw noticeResult.error;
    setVehicles(vehicleResult.data ?? []);
    setSessions((sessionResult.data ?? []) as unknown as ParkingSession[]);
    setSpaces((spaceResult.data ?? []) as unknown as ParkingSpace[]);
    setNotices(noticeResult.data ?? []);
    setSelectedVehicle(current => current || vehicleResult.data?.[0]?.id || '');
  }, [profile.id]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void refresh().catch(err => { if (alive) setError(err instanceof Error ? err.message : 'Falha ao carregar seus dados.'); })
      .finally(() => { if (alive) setLoading(false); });
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const client = supabase;
    const channel = client?.channel(`citizen-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_sessions', filter: `user_id=eq.${profile.id}` }, () => { void refresh(); })
      .subscribe();
    return () => { alive = false; window.clearInterval(timer); if (client && channel) void client.removeChannel(channel); };
  }, [profile.id, refresh]);

  const activeSessions = useMemo(() => sessions.filter(item => item.status === 'active' && new Date(item.expires_at).getTime() > now), [sessions, now]);
  const unread = notices.filter(item => !item.read_at).length;

  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setSuccess('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  };

  const addVehicle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const client = supabase;
    if (!client) return;
    void perform(async () => {
      const plate = vehicleForm.plate.replace(/[^a-z0-9]/gi, '').toUpperCase();
      if (!platePattern.test(plate)) throw new Error('Informe uma placa válida no padrão ABC1D23 ou ABC1234.');
      const { error: insertError } = await client.from('vehicles').insert({
        owner_id: profile.id, plate, make: vehicleForm.make.trim() || null, model: vehicleForm.model.trim() || null,
        color: vehicleForm.color.trim() || null, vehicle_type: vehicleForm.vehicle_type,
      });
      if (insertError) throw insertError;
      setVehicleForm({ plate: '', make: '', model: '', color: '', vehicle_type: 'Passeio' });
      setShowVehicleForm(false); setSuccess('Veículo cadastrado.'); await refresh();
    });
  };

  const removeVehicle = (vehicle: Vehicle) => {
    const client = supabase;
    if (!client || !window.confirm(`Remover o veículo ${vehicle.plate}?`)) return;
    void perform(async () => {
      const { error: deleteError } = await client.from('vehicles').delete().eq('id', vehicle.id).eq('owner_id', profile.id);
      if (deleteError) throw deleteError;
      setSuccess('Veículo removido.'); await refresh();
    });
  };

  const startSession = () => {
    const client = supabase;
    if (!client || !selectedVehicle) return;
    void perform(async () => {
      if (beneficiaryCategory !== 'conventional' && !credentialConfirmed) throw new Error('Para utilizar a categoria especial, confirme que atende aos requisitos legais e está utilizando credencial válida emitida pelo órgão de trânsito competente.');
      const { error: rpcError } = await client.rpc('start_parking_session', { p_vehicle_id: selectedVehicle, p_space_id: selectedSpace || null, p_beneficiary_category: beneficiaryCategory });
      if (rpcError) throw rpcError;
      setSuccess('Estacionamento registrado com sucesso. O cronômetro já está em andamento.');
      setBeneficiaryCategory('conventional'); setCredentialConfirmed(false); setSelectedSpace('');
      setTab('overview'); await refresh();
    });
  };

  const finishSession = (sessionId: string) => {
    const client = supabase;
    if (!client) return;
    void perform(async () => {
      const { error: rpcError } = await client.rpc('finish_parking_session', { p_session_id: sessionId });
      if (rpcError) throw rpcError;
      setSuccess('Estacionamento encerrado.'); await refresh();
    });
  };

  const markRead = async (noticeId: string) => {
    const client = supabase;
    if (!client) return;
    const { error: updateError } = await client.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', noticeId).eq('user_id', profile.id);
    if (!updateError) await refresh();
  };

  const navItems = [
    { id: 'overview', label: 'Início', icon: Activity },
    { id: 'register', label: 'Registrar estacionamento', icon: MapPin },
    { id: 'vehicles', label: 'Meus veículos', icon: CarFront },
    { id: 'history', label: 'Histórico', icon: History },
    { id: 'notifications', label: 'Notificações', icon: Bell },
  ] as const;

  return <main className="citizen-workspace">
    <header className="workspace-header">
      <button className="workspace-menu-toggle" type="button" aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(open => !open)}><Menu size={20}/></button>
      <a className="portal-brand" href={import.meta.env.BASE_URL}><span className="workspace-brand-mark"><CarFront size={23}/></span><span><strong>VagaFácil</strong><small>Área do cidadão</small></span></a>
      <div className="workspace-user"><span className="workspace-avatar">{(profile.full_name || 'C').slice(0,1).toUpperCase()}</span><span><strong>{profile.full_name || 'Cidadão'}</strong><small>Conta ativa</small></span><button className="workspace-signout" onClick={onSignOut}><Power size={16}/> Sair</button></div>
    </header>
    <div className="workspace-body">
      {sidebarOpen && <button className="workspace-sidebar-scrim" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`workspace-sidebar${sidebarOpen ? " is-open" : ""}`}><div className="workspace-greeting"><small>PORTAL DO CIDADÃO</small><strong>Olá, {profile.full_name?.split(' ')[0] || 'tudo bem'}!</strong><span>Gerencie seus estacionamentos.</span></div><nav>{navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { setTab(item.id); setError(''); setSuccess(''); setSidebarOpen(false); }}><Icon size={17}/>{item.label}{item.id === 'notifications' && unread > 0 && <b>{unread}</b>}</button>; })}</nav><div className="workspace-rule-note"><Clock3 size={16}/><span>Rotativo gratuito<br/><strong>Seg–Sex · 9h às 18h</strong><small>Sáb · 9h às 13h<br/>1h comum · 2h especial</small></span></div></aside>
      <section className="workspace-content">
        <div className="workspace-page-heading"><div><span className="portal-kicker">VAGAFÁCIL · SERVIÇOS DIGITAIS</span><h1>{navItems.find(item => item.id === tab)?.label}</h1><p>Seus dados e registros em um só lugar.</p></div>{tab === 'vehicles' && <button className="workspace-primary" onClick={() => setShowVehicleForm(true)}><Plus size={17}/> Adicionar veículo</button>}</div>
        {error && <div className="workspace-alert error" role="alert">{error}</div>}
        {success && <div className="workspace-alert success" role="status">{success}</div>}
        {loading ? <div className="workspace-empty">Carregando seus dados...</div> : <>
          {tab === 'overview' && <>
            <div className="workspace-section-title"><div><h2>Estacionamentos em andamento</h2><p>O tempo é atualizado automaticamente.</p></div><button onClick={() => setTab('register')}>Novo registro <Plus size={15}/></button></div>
            {activeSessions.length === 0 ? <div className="workspace-empty"><CarFront size={28}/><strong>Nenhum estacionamento ativo</strong><span>Quando registrar uma vaga, o cronômetro aparecerá aqui.</span><button onClick={() => setTab('register')}>Registrar estacionamento</button></div> : <div className="workspace-session-grid">{activeSessions.map(session => <article className="workspace-session-card" key={session.id}><div className="session-card-top"><span className="session-live"><i/> EM ANDAMENTO</span><span>{session.plate_snapshot}</span></div><strong className="session-timer">{timerLabel(remaining(session.expires_at, now))}</strong><small>Tempo restante</small><div className="session-meta"><span><Clock3 size={14}/> Início: {fmtDate(session.started_at)}</span><span><MapPin size={14}/> {session.parking_spaces?.code || 'Vaga não informada'}{session.parking_spaces?.parking_zones?.name ? ` · ${session.parking_spaces.parking_zones.name}` : ''}</span><span>Limite: {fmtDate(session.expires_at)}</span><span>Categoria: {session.beneficiary_category === 'elderly' ? 'Idoso · até 2 horas' : session.beneficiary_category === 'accessible' ? 'Pessoa com deficiência · até 2 horas' : 'Convencional · até 1 hora'}</span></div><button className="workspace-danger-outline" disabled={busy} onClick={() => finishSession(session.id)}><X size={15}/> Encerrar estacionamento</button></article>)}</div>}
            <div className="workspace-metrics"><article><span>Veículos cadastrados</span><strong>{vehicles.length}</strong><CarFront size={21}/></article><article><span>Estacionamentos ativos</span><strong>{activeSessions.length}</strong><Activity size={21}/></article><article><span>Notificações não lidas</span><strong>{unread}</strong><Bell size={21}/></article></div>
            <div className="workspace-section-title"><div><h2>Atividade recente</h2><p>Últimos registros da sua conta.</p></div><button onClick={() => setTab('history')}>Ver histórico <History size={15}/></button></div>
            <SessionTable sessions={sessions.slice(0,5)} now={now}/>
          </>}
          {tab === 'register' && <div className="workspace-form-card"><div className="workspace-form-intro"><span className="workspace-form-icon"><MapPin size={23}/></span><div><h2>Registrar chegada</h2><p>Selecione o veículo e, se disponível, identifique a vaga onde estacionou.</p></div></div>{vehicles.length === 0 ? <div className="workspace-empty"><CarFront size={26}/><strong>Cadastre um veículo primeiro</strong><button onClick={() => {setTab('vehicles');setShowVehicleForm(true);}}>Cadastrar veículo</button></div> : <><label>Veículo<select value={selectedVehicle} onChange={e=>setSelectedVehicle(e.target.value)}>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {[v.make,v.model].filter(Boolean).join(' ') || 'Veículo'}</option>)}</select></label><fieldset className="workspace-beneficiary"><legend>Identificação do usuário</legend><p>Selecione uma opção para aplicar o tempo de permanência correspondente.</p><div className="workspace-beneficiary-options"><label className={beneficiaryCategory === 'conventional' ? 'selected' : ''}><input type="radio" name="beneficiary-category" value="conventional" checked={beneficiaryCategory === 'conventional'} onChange={() => {setBeneficiaryCategory('conventional');setCredentialConfirmed(false);}}/><span><strong>Uso convencional</strong><small>Até 1 hora</small></span></label><label className={beneficiaryCategory === 'elderly' ? 'selected' : ''}><input type="radio" name="beneficiary-category" value="elderly" checked={beneficiaryCategory === 'elderly'} onChange={() => {setBeneficiaryCategory('elderly');setCredentialConfirmed(false);}}/><span><strong>Idoso</strong><small>Até 2 horas</small></span></label><label className={beneficiaryCategory === 'accessible' ? 'selected' : ''}><input type="radio" name="beneficiary-category" value="accessible" checked={beneficiaryCategory === 'accessible'} onChange={() => {setBeneficiaryCategory('accessible');setCredentialConfirmed(false);}}/><span><strong>Pessoa com deficiência</strong><small>Até 2 horas</small></span></label></div>{beneficiaryCategory !== 'conventional' && <div className="workspace-credential-notice" role="note"><strong>Uso condicionado à credencial obrigatória</strong><p>As vagas destinadas a idosos e pessoas com deficiência somente podem ser utilizadas por quem cumprir os requisitos legais aplicáveis e estiver de posse e em uso de credencial de estacionamento válida, emitida pelo órgão de trânsito competente. A credencial deve ser utilizada conforme as regras do órgão emissor. A seleção desta categoria não dispensa a apresentação da credencial em eventual fiscalização.</p><label className="workspace-credential-confirm"><input type="checkbox" checked={credentialConfirmed} onChange={e=>setCredentialConfirmed(e.target.checked)}/><span>Declaro que atendo aos requisitos legais e que estou utilizando credencial válida emitida pelo órgão de trânsito competente.</span></label></div>}</fieldset><label>Vaga (opcional)<select value={selectedSpace} onChange={e=>setSelectedSpace(e.target.value)}><option value="">Não informar agora</option>{spaces.map(s=><option key={s.id} value={s.id}>{s.code}{s.parking_zones?.name ? ` · ${s.parking_zones.name}` : ''}</option>)}</select></label><div className="workspace-rule-callout"><Clock3 size={19}/><span><strong>{beneficiaryCategory === 'conventional' ? 'Até 1 hora gratuita' : 'Até 2 horas gratuitas'}</strong><small>Segunda a sexta, das 9h às 18h e sábado, das 9h às 13h. O limite é ajustado automaticamente ao encerramento do horário regulamentado.</small></span></div><button className="workspace-primary workspace-full" disabled={busy || !selectedVehicle || activeSessions.length > 0 || (beneficiaryCategory !== 'conventional' && !credentialConfirmed)} onClick={startSession}>{busy ? 'Registrando...' : 'Confirmar estacionamento'} <CheckCircle2 size={17}/></button>{activeSessions.length > 0 && <p className="workspace-inline-note">Você já possui um estacionamento em andamento.</p>}</>}</div>}
          {tab === 'vehicles' && <><div className="workspace-vehicle-grid">{vehicles.map(vehicle=><article className="workspace-vehicle-card" key={vehicle.id}><span><CarFront size={22}/></span><div><strong>{vehicle.plate}</strong><small>{[vehicle.make,vehicle.model].filter(Boolean).join(' ') || 'Modelo não informado'}</small><small>{[vehicle.color,vehicle.vehicle_type].filter(Boolean).join(' · ')}</small></div><button title="Remover veículo" onClick={()=>removeVehicle(vehicle)} disabled={busy}><Trash2 size={16}/></button></article>)}</div>{vehicles.length === 0 && <div className="workspace-empty"><CarFront size={28}/><strong>Nenhum veículo cadastrado</strong><span>Adicione seu primeiro veículo para registrar estacionamentos.</span></div>}</>}
          {tab === 'history' && <SessionTable sessions={sessions} now={now}/>}
          {tab === 'notifications' && <div className="workspace-notices">{notices.length === 0 ? <div className="workspace-empty"><Bell size={26}/><strong>Nenhuma notificação</strong><span>Você verá aqui os avisos sobre seus estacionamentos.</span></div> : notices.map(n=><article className={n.read_at ? 'read' : ''} key={n.id}><span><Bell size={18}/></span><div><strong>{n.title}</strong><p>{n.body}</p><small>{fmtDate(n.created_at)}</small></div>{!n.read_at && <button onClick={()=>void markRead(n.id)}>Marcar como lida</button>}</article>)}</div>}
        </>}
      </section>
    </div>
    {showVehicleForm && <div className="workspace-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowVehicleForm(false);}}><form className="workspace-modal" onSubmit={addVehicle}><button type="button" className="workspace-modal-close" onClick={()=>setShowVehicleForm(false)} aria-label="Fechar"><X size={18}/></button><span className="portal-kicker">GARAGEM DIGITAL</span><h2>Adicionar veículo</h2><p>Cadastre os dados para usar nos registros de estacionamento.</p><label>Placa<input value={vehicleForm.plate} onChange={e=>setVehicleForm(v=>({...v,plate:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7)}))} placeholder="ABC1D23" maxLength={7} required/></label><div className="workspace-form-row"><label>Marca<input value={vehicleForm.make} onChange={e=>setVehicleForm(v=>({...v,make:e.target.value}))} maxLength={50}/></label><label>Modelo<input value={vehicleForm.model} onChange={e=>setVehicleForm(v=>({...v,model:e.target.value}))} maxLength={60}/></label></div><div className="workspace-form-row"><label>Cor<input value={vehicleForm.color} onChange={e=>setVehicleForm(v=>({...v,color:e.target.value}))} maxLength={30}/></label><label>Tipo<select value={vehicleForm.vehicle_type} onChange={e=>setVehicleForm(v=>({...v,vehicle_type:e.target.value}))}><option>Passeio</option><option>Motocicleta</option><option>Utilitário</option><option>Outro</option></select></label></div><button className="workspace-primary workspace-full" type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Salvar veículo'}</button></form></div>}
    <footer className="workspace-footer">© 2026 VagaFácil · Estacionamento rotativo gratuito</footer>
  </main>;
}

function SessionTable({ sessions, now }: { sessions: ParkingSession[]; now: number }) {
  if (!sessions.length) return <div className="workspace-empty"><History size={26}/><strong>Nenhum registro encontrado</strong><span>Seus estacionamentos aparecerão aqui.</span></div>;
  return <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Veículo</th><th>Início</th><th>Limite</th><th>Vaga</th><th>Categoria</th><th>Situação</th></tr></thead><tbody>{sessions.map(s=>{const expired=s.status==='expired'||(s.status==='active'&&new Date(s.expires_at).getTime()<=now);const label=s.status==='finished'?'Encerrado':s.status==='cancelled'?'Cancelado':expired?'Prazo encerrado':'Em andamento';return <tr key={s.id}><td data-label="Veículo"><strong>{s.plate_snapshot}</strong></td><td data-label="Início">{fmtDate(s.started_at)}</td><td data-label="Limite">{fmtDate(s.expires_at)}</td><td data-label="Vaga">{s.parking_spaces?.code || '—'}</td><td data-label="Categoria">{s.beneficiary_category === 'elderly' ? 'Idoso' : s.beneficiary_category === 'accessible' ? 'Pessoa com deficiência' : 'Convencional'}</td><td data-label="Situação"><span className={`session-status ${expired?'expired':s.status}`}>{label}</span></td></tr>;})}</tbody></table></div>;
}
