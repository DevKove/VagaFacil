import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, Bell, Camera, CarFront, Clock3, Download, FileText, LayoutDashboard, LogOut, MapPin, MapPinned, Menu, Plus, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { VehiclePlate } from '../../components/VehiclePlate';

type Profile = { id: string; full_name: string; role: string; is_active: boolean; email?: string };
type Session = { id: string; plate_snapshot: string; started_at: string; expires_at: string; status: string; user_id: string; space_id: string | null; latitude?: number | null; longitude?: number | null; location_accuracy_m?: number | null; location_captured_at?: string | null; parking_spaces?: { code: string; latitude?: number | null; longitude?: number | null; parking_zones?: { name: string } | null } | null };
type Alert = { id: string; status: string; severity: string; created_at: string; session_id: string; claimed_by: string | null; parking_sessions?: Session | null };
type Zone = { id: string; name: string; description: string | null; active: boolean };
type Space = { id: string; code: string; category: string; active: boolean; zone_id: string | null; latitude: number | null; longitude: number | null };
type AuditLog = { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; created_at: string };
type EnforcementHistory = { id: string; status: string; result: string | null; notes: string | null; created_at: string; alert_id: string; alerts?: { parking_sessions?: { plate_snapshot: string } | null } | null; enforcement_photos?: { storage_path: string }[] };
type Rule = { id: string; name: string; enabled: boolean; start_time: string; end_time: string; saturday_start: string | null; saturday_end: string | null; conventional_minutes: number; special_minutes: number; grace_minutes: number };

const menus = {
  agent: [{ id: 'overview', label: 'Painel operacional', icon: LayoutDashboard }, { id: 'sessions', label: 'Sessões em andamento', icon: CarFront }, { id: 'alerts', label: 'Alertas e fiscalização', icon: AlertTriangle }, { id: 'history', label: 'Histórico de ações', icon: FileText }, { id: 'map', label: 'Mapa operacional', icon: MapPinned }],
  admin: [{ id: 'overview', label: 'Visão geral', icon: LayoutDashboard }, { id: 'sessions', label: 'Estacionamentos', icon: CarFront }, { id: 'zones', label: 'Zonas e vagas', icon: MapPin }, { id: 'users', label: 'Usuários e agentes', icon: Users }, { id: 'rules', label: 'Regras e feriados', icon: Clock3 }, { id: 'reports', label: 'Relatórios', icon: FileText }, { id: 'map', label: 'Mapa de vagas', icon: MapPinned }, { id: 'audit', label: 'Auditoria', icon: ShieldCheck }],
};
const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const statusText = (status: string) => ({ active: 'Em andamento', expired: 'Vencido', finished: 'Encerrado', open: 'Aberto', claimed: 'Em atendimento', resolved: 'Resolvido', dismissed: 'Descartado' }[status] || status);
const roleText = (role: string) => ({ admin: 'Administrador', supervisor: 'Supervisor', agent: 'Agente', citizen: 'Cidadão' }[role] || role);

async function invokeUserManagement(payload: Record<string, unknown>) {
  if (!supabase) throw new Error('Serviço de autenticação indisponível.');
  const { data, error } = await supabase.functions.invoke('manage-users', { body: payload });
  if (error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      const body = await response.clone().json().catch(() => null) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  return data;
}

export default function OperationsWorkspace({ profile, area, onSignOut }: { profile: Profile; area: 'agent' | 'admin'; onSignOut: () => void }) {
  const [section, setSection] = useState('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [history, setHistory] = useState<EnforcementHistory[]>([]);
  const [historyPhotoUrls, setHistoryPhotoUrls] = useState<Record<string, string[]>>({});
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [search, setSearch] = useState('');
  const [zoneForm, setZoneForm] = useState({ name: '', description: '' });
  const [spaceForm, setSpaceForm] = useState({ code: '', zone_id: '', category: 'conventional', latitude: '', longitude: '' });
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState({ full_name: '', email: '', password: '', role: 'citizen', is_active: true });
  const [enforcement, setEnforcement] = useState<Alert | null>(null);
  const [enforcementResult, setEnforcementResult] = useState('regular');
  const [enforcementNotes, setEnforcementNotes] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    try {
      const [sessionRes, alertRes, spaceMapRes] = await Promise.all([
        supabase.from('parking_sessions').select('id,plate_snapshot,started_at,expires_at,status,user_id,space_id,latitude,longitude,location_accuracy_m,location_captured_at,parking_spaces(code,latitude,longitude,parking_zones(name))').in('status', ['active','expired']).order('started_at', { ascending: false }).limit(300),
        supabase.from('alerts').select('id,status,severity,created_at,session_id,claimed_by,parking_sessions(id,plate_snapshot,started_at,expires_at,status,user_id,space_id,latitude,longitude,parking_spaces(code,latitude,longitude,parking_zones(name)))').in('status', ['open','claimed']).order('created_at', { ascending: false }).limit(300),
        supabase.from('parking_spaces').select('id,code,category,active,zone_id,latitude,longitude').order('code'),
      ]);
      if (sessionRes.error) throw sessionRes.error;
      if (alertRes.error) throw alertRes.error;
      if (spaceMapRes.error) throw spaceMapRes.error;
      setSessions((sessionRes.data || []) as unknown as Session[]);
      setAlerts((alertRes.data || []) as unknown as Alert[]);
      setSpaces((spaceMapRes.data || []) as Space[]);
      if (area === 'agent') {
        const historyRes = await supabase.from('enforcements').select('id,status,result,notes,created_at,alert_id,alerts(parking_sessions(plate_snapshot)),enforcement_photos(storage_path)').eq('agent_id', profile.id).order('created_at', { ascending: false }).limit(100);
        if (historyRes.error) throw historyRes.error;
        const historyItems = (historyRes.data || []) as unknown as EnforcementHistory[];
        setHistory(historyItems);
        const signedPhotos = await Promise.all(historyItems.map(async item => {
          const signed = await Promise.all((item.enforcement_photos || []).map(async photo => {
            const { data } = await supabase!.storage.from('enforcement-evidence').createSignedUrl(photo.storage_path, 3600);
            return data?.signedUrl || null;
          }));
          return [item.id, signed.filter((url): url is string => Boolean(url))] as const;
        }));
        setHistoryPhotoUrls(Object.fromEntries(signedPhotos));
      }
      if (area === 'admin') {
        const [zoneRes, userRes, ruleRes, auditRes] = await Promise.all([
          supabase.from('parking_zones').select('id,name,description,active').order('name'),
          invokeUserManagement({ action: 'list' }),
          supabase.from('parking_rules').select('id,name,enabled,start_time,end_time,saturday_start,saturday_end,conventional_minutes,special_minutes,grace_minutes').order('created_at', { ascending: false }),
          supabase.from('audit_logs').select('id,actor_id,action,entity_type,entity_id,created_at').order('created_at', { ascending: false }).limit(300),
        ]);
        if (zoneRes.error) throw zoneRes.error;
        if (ruleRes.error) throw ruleRes.error;
        if (auditRes.error) throw auditRes.error;
        setZones(zoneRes.data || []);
        setUsers((userRes?.users || []) as Profile[]);
        setRules(ruleRes.data || []);
        setAuditLogs((auditRes.data || []) as AuditLog[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar os dados do ambiente.');
    } finally {
      setLoading(false);
    }
  }, [area, profile.id]);

  useEffect(() => { void load(); }, [load]);
  const filteredSessions = useMemo(() => sessions.filter(s => [s.plate_snapshot, s.latitude, s.longitude].join(' ').toLowerCase().includes(search.toLowerCase())), [sessions, search]);
  const activeSessions = sessions.filter(s => s.status === 'active');
  const expiredSessions = sessions.filter(s => s.status === 'expired' || (s.status === 'active' && new Date(s.expires_at).getTime() <= Date.now()));
  const openAlerts = alerts.filter(a => a.status === 'open').length;

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); await load(); }
    catch (e) {
      if (e && typeof e === 'object') {
        const value = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
        const message = [value.message, value.details, value.hint].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(' — ');
        setError(message ? `${message}${typeof value.code === 'string' ? ` [${value.code}]` : ''}` : 'Não foi possível concluir a operação.');
      } else setError('Não foi possível concluir a operação.');
    } finally { setBusy(false); }
  };
  const addZone = (event: FormEvent) => { event.preventDefault(); if (!supabase) return; void run(async () => { const { error } = await supabase!.from('parking_zones').insert({ name: zoneForm.name.trim(), description: zoneForm.description.trim() || null }); if (error) throw error; setZoneForm({ name: '', description: '' }); }); };
  const addSpace = (event: FormEvent) => { event.preventDefault(); if (!supabase) return; void run(async () => { const { error } = await supabase!.from('parking_spaces').insert({ code: spaceForm.code.trim().toUpperCase(), zone_id: spaceForm.zone_id || null, category: spaceForm.category, latitude: spaceForm.latitude === '' ? null : Number(spaceForm.latitude), longitude: spaceForm.longitude === '' ? null : Number(spaceForm.longitude) }); if (error) throw error; setSpaceForm({ code: '', zone_id: '', category: 'conventional', latitude: '', longitude: '' }); }); };
  const openCreateUser = () => { setEditingUser(null); setUserForm({ full_name: '', email: '', password: '', role: 'citizen', is_active: true }); setUserModalOpen(true); };
  const openEditUser = (user: Profile) => { setEditingUser(user); setUserForm({ full_name: user.full_name, email: user.email || '', password: '', role: user.role, is_active: user.is_active }); setUserModalOpen(true); };
  const saveUser = (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    void run(async () => {
      const body = editingUser
        ? { action: 'update', id: editingUser.id, full_name: userForm.full_name, role: userForm.role, is_active: userForm.is_active, ...(userForm.email.trim().toLowerCase() !== (editingUser.email || '').toLowerCase() ? { email: userForm.email.trim() } : {}), ...(userForm.password ? { password: userForm.password } : {}) }
        : { action: 'create', full_name: userForm.full_name, email: userForm.email, password: userForm.password, role: userForm.role, is_active: userForm.is_active };
      await invokeUserManagement(body);
      setUserModalOpen(false);
      setEditingUser(null);
    });
  };
  const deleteUser = (user: Profile) => {
    if (!supabase || user.id === profile.id || !window.confirm(`Excluir permanentemente a conta de ${user.full_name}? Esta ação não pode ser desfeita.`)) return;
    void run(async () => {
      await invokeUserManagement({ action: 'delete', id: user.id });
    });
  };
  const finishSession = (session: Session) => {
    if (!supabase || session.status !== 'active') return;
    if (!window.confirm(`Encerrar o estacionamento do veículo ${session.plate_snapshot}?`)) return;
    void run(async () => {
      const { error } = await supabase!.rpc('finish_parking_session', { p_session_id: session.id });
      if (error) throw error;
    });
  };
  const sendManualAlert = (session: Session) => {
    if (!supabase || session.status !== 'active') return;
    const confirmed = window.confirm(`Emitir agora um alerta sonoro e visual para o responsável pelo veículo ${session.plate_snapshot}?`);
    if (!confirmed) return;
    void run(async () => {
      const { error } = await supabase!.from('notifications').insert({
        user_id: session.user_id,
        title: 'Atenção ao estacionamento',
        body: `Veículo ${session.plate_snapshot}: verifique as informações do seu registro de estacionamento.`,
        kind: 'admin_manual_alert',
      });
      if (error) throw error;
    });
  };
  const saveRule = (event: FormEvent) => { event.preventDefault(); if (!supabase || !editingRule) return; void run(async () => { const { id, name, enabled, start_time, end_time, saturday_start, saturday_end, conventional_minutes, special_minutes, grace_minutes } = editingRule; const { error } = await supabase!.from('parking_rules').update({ name, enabled, start_time, end_time, saturday_start, saturday_end, conventional_minutes, special_minutes, grace_minutes }).eq('id', id); if (error) throw error; setEditingRule(null); }); };
  const claimAlert = (alert: Alert) => { if (!supabase) return; void run(async () => { const { error } = await supabase!.from('alerts').update({ status: 'claimed', claimed_by: profile.id, claimed_at: new Date().toISOString() }).eq('id', alert.id).eq('status', 'open'); if (error) throw error; }); };
  const saveEnforcement = (event: FormEvent) => { event.preventDefault(); if (!supabase || !enforcement) return; void run(async () => { if (evidenceFiles.length > 5) throw new Error('Anexe no máximo 5 fotos por fiscalização.'); if (evidenceFiles.some(file => file.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))) throw new Error('Cada foto deve ser JPG, PNG ou WEBP e ter até 5 MB.'); const { data, error } = await supabase!.from('enforcements').insert({ alert_id: enforcement.id, agent_id: profile.id, status: 'closed', result: enforcementResult, notes: enforcementNotes.trim() || null, verified_at: new Date().toISOString(), closed_at: new Date().toISOString() }).select('id').single(); if (error) throw error; const uploaded: string[] = []; try { for (const file of evidenceFiles) { const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]; const path = `${profile.id}/${data.id}/${crypto.randomUUID()}.${ext}`; const { error: uploadError } = await supabase!.storage.from('enforcement-evidence').upload(path, file, { contentType: file.type, upsert: false }); if (uploadError) throw uploadError; uploaded.push(path); } if (uploaded.length) { const { error: photoError } = await supabase!.from('enforcement_photos').insert(uploaded.map(storage_path => ({ enforcement_id: data.id, storage_path }))); if (photoError) throw photoError; } } catch (uploadFailure) { if (uploaded.length) await supabase!.storage.from('enforcement-evidence').remove(uploaded); await supabase!.from('enforcements').delete().eq('id', data.id); throw uploadFailure; } const { error: alertError } = await supabase!.from('alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', enforcement.id); if (alertError) throw alertError; setEnforcement(null); setEnforcementNotes(''); setEvidenceFiles([]); }); };
  const exportCsv = () => { const rows = [['Placa','Início','Vencimento','Status','Latitude','Longitude','Precisão (m)','Localização capturada em'], ...sessions.map(s => [s.plate_snapshot, s.started_at, s.expires_at, s.status, s.latitude ?? '', s.longitude ?? '', s.location_accuracy_m ?? '', s.location_captured_at || ''])]; const csv = rows.map(row => row.map(v => '"' + String(v).replaceAll('"','""') + '"').join(';')).join('\n'); const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'vagafacil-estacionamentos.csv'; link.click(); URL.revokeObjectURL(url); };

  const mappedSpaces = spaces.filter(item => item.latitude !== null && item.longitude !== null);
  const mapCenter = mappedSpaces.length ? { lat: mappedSpaces.reduce((sum,item)=>sum + Number(item.latitude),0)/mappedSpaces.length, lon: mappedSpaces.reduce((sum,item)=>sum + Number(item.longitude),0)/mappedSpaces.length } : null;
  const mapBounds = mappedSpaces.length ? { minLon: Math.min(...mappedSpaces.map(item=>Number(item.longitude))) - 0.002, maxLon: Math.max(...mappedSpaces.map(item=>Number(item.longitude))) + 0.002, minLat: Math.min(...mappedSpaces.map(item=>Number(item.latitude))) - 0.002, maxLat: Math.max(...mappedSpaces.map(item=>Number(item.latitude))) + 0.002 } : null;
  const menu = menus[area];
  const heading = menu.find(item => item.id === section)?.label || 'Painel';
  return <div className="ops-shell">
    <aside className={mobileOpen ? 'ops-sidebar open' : 'ops-sidebar'}>
      <div className="ops-brand"><img src={`${import.meta.env.BASE_URL}IMG/logo-vagafacil.svg`} alt="VagaFácil"/><div><strong>VagaFácil</strong><small>{area === 'admin' ? 'Gestão municipal' : 'Fiscalização de trânsito'}</small></div><button onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={19}/></button></div>
      <div className="ops-profile"><span>{profile.full_name.slice(0,1).toUpperCase()}</span><div><strong>{profile.full_name}</strong><small>{roleText(profile.role)}</small></div></div>
      <nav>{menu.map(item => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => { setSection(item.id); setMobileOpen(false); }}><item.icon size={18}/>{item.label}{item.id === 'alerts' && openAlerts > 0 && <b>{openAlerts}</b>}</button>)}</nav>
      <button className="ops-signout" onClick={onSignOut}><LogOut size={18}/> Sair da conta</button>
    </aside>
    {mobileOpen && <button className="ops-scrim" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"/>}
    <main className="ops-main">
      <header className="ops-topbar"><button className="ops-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={21}/></button><div><small>VAGAFÁCIL / {area === 'admin' ? 'ADMINISTRAÇÃO' : 'OPERAÇÃO'}</small><strong>{heading}</strong></div><div className="ops-top-actions"><span><i/> Dados sincronizados</span><button onClick={() => void load()} aria-label="Atualizar dados"><RefreshCw size={17}/></button><button onClick={onSignOut} aria-label="Sair"><LogOut size={17}/></button></div></header>
      <div className="ops-content">
        <div className="ops-page-heading"><div><span className="ops-eyebrow">{area === 'admin' ? 'CENTRAL DE GESTÃO' : 'CENTRAL DE FISCALIZAÇÃO'}</span><h1>{section === 'overview' ? (area === 'admin' ? 'Visão geral da operação' : 'Painel operacional') : heading}</h1><p>{area === 'admin' ? 'Acompanhe indicadores e gerencie os recursos do estacionamento rotativo.' : 'Consulte a situação das vagas e atenda alertas de fiscalização.'}</p></div><button className="ops-primary" onClick={() => void load()}><RefreshCw size={16}/> Atualizar</button></div>
        {error && <div className="ops-error" role="alert"><AlertTriangle size={17}/>{error}</div>}
        {loading ? <div className="ops-loading">Carregando dados do Supabase...</div> : <>
          {section === 'overview' && <><div className="ops-metrics"><article><span>Sessões em andamento</span><strong>{activeSessions.length}</strong><small>Registros ativos</small></article><article><span>Prazo encerrado</span><strong>{expiredSessions.length}</strong><small>Precisam de atenção</small></article><article><span>Alertas abertos</span><strong>{openAlerts}</strong><small>Na fila de atendimento</small></article>{area === 'admin' && <article><span>Usuários cadastrados</span><strong>{users.length}</strong><small>Todos os perfis</small></article>}</div><div className="ops-panel"><div className="ops-panel-heading"><div><h2>Atividade que exige atenção</h2><p>Dados consultados diretamente no banco</p></div><button onClick={() => setSection(area === 'admin' ? 'sessions' : 'alerts')}>Abrir lista</button></div>{expiredSessions.slice(0,6).map(s=><div className="ops-row" key={s.id}><AlertTriangle size={18}/><div><VehiclePlate value={s.plate_snapshot} compact /><small>{s.parking_spaces?.code || 'Sem vaga vinculada'} · Limite {dateTime(s.expires_at)}</small></div><span className="ops-pill danger">Vencido</span></div>)}{expiredSessions.length === 0 && <div className="ops-empty">Nenhuma sessão vencida identificada.</div>}</div></>}
          {section === 'map' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Mapa de vagas e pontos cadastrados</h2><p>Posições geográficas registradas no cadastro municipal.</p></div><span className="ops-pill info">{mappedSpaces.length} coordenadas</span></div>{mapBounds && mapCenter ? <><iframe title="Mapa de vagas VagaFácil" className="ops-map-frame" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapBounds.minLon}%2C${mapBounds.minLat}%2C${mapBounds.maxLon}%2C${mapBounds.maxLat}&layer=mapnik&marker=${mapCenter.lat}%2C${mapCenter.lon}`} /><p className="ops-hint">O marcador indica o centro aproximado das vagas cadastradas. Abra cada coordenada na lista para visualizar o ponto exato.</p><div className="ops-map-list">{mappedSpaces.map(space=><a key={space.id} href={`https://www.openstreetmap.org/?mlat=${space.latitude}&mlon=${space.longitude}#map=19/${space.latitude}/${space.longitude}`} target="_blank" rel="noreferrer"><MapPin size={16}/><span><strong>{space.code}</strong><small>{space.active?'Vaga ativa':'Vaga inativa'} · {Number(space.latitude).toFixed(6)}, {Number(space.longitude).toFixed(6)}</small></span></a>)}</div></> : <div className="ops-empty">Ainda não existem vagas com latitude e longitude cadastradas. Cadastre as coordenadas para habilitar o mapa.</div>}</div>}
          {section === 'sessions' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Estacionamentos monitorados</h2><p>{filteredSessions.length} registros encontrados</p></div><label className="ops-search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar placa ou coordenadas"/></label></div><div className="ops-table-wrap"><table><thead><tr><th>PLACA</th><th>LOCALIZAÇÃO</th><th>INÍCIO</th><th>VENCIMENTO</th><th>SITUAÇÃO</th>{area === 'admin' && <th>AÇÃO</th>}</tr></thead><tbody>{filteredSessions.map(s=><tr key={s.id}><td><VehiclePlate value={s.plate_snapshot} compact /></td><td>{s.latitude != null && s.longitude != null ? <a className="ops-location-link" href={'https://www.openstreetmap.org/?mlat=' + s.latitude + '&mlon=' + s.longitude + '#map=18/' + s.latitude + '/' + s.longitude} target="_blank" rel="noreferrer" title="Abrir localização no mapa"><MapPin size={15}/><span><strong>{Number(s.latitude).toFixed(6)}, {Number(s.longitude).toFixed(6)}</strong><small>{s.location_accuracy_m != null ? 'Precisão ±' + Math.round(s.location_accuracy_m) + ' m' : 'Precisão não informada'}{s.location_captured_at ? ' · ' + dateTime(s.location_captured_at) : ''}</small></span></a> : <span className="ops-muted-location">Geolocalização não disponível no registro</span>}</td><td>{dateTime(s.started_at)}</td><td>{dateTime(s.expires_at)}</td><td><span className={`ops-pill ${s.status === 'expired' || (s.status === 'active' && new Date(s.expires_at).getTime() <= Date.now()) ? 'danger' : 'success'}`}>{s.status === 'active' && new Date(s.expires_at).getTime() <= Date.now() ? 'Período excedido · em aberto' : statusText(s.status)}</span></td>{area === 'admin' && <td>{s.status === 'active' ? <div className="ops-user-actions"><button className="ops-primary" onClick={() => sendManualAlert(s)} disabled={busy}><Bell size={15}/> Emitir alerta</button><button className="ops-small-action danger" onClick={() => finishSession(s)} disabled={busy}>Encerrar</button></div> : <span className="ops-muted-location">Encerrado</span>}</td>}</tr>)}{filteredSessions.length === 0 && <tr><td colSpan={area === 'admin' ? 6 : 5} className="ops-empty">Nenhum estacionamento encontrado.</td></tr>}</tbody></table></div></div>}
          {section === 'alerts' && area === 'agent' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Fila de fiscalização</h2><p>Assuma um alerta e registre a verificação em campo.</p></div></div>{alerts.map(a=><article className="ops-alert" key={a.id}><div className="ops-alert-icon"><AlertTriangle size={20}/></div><div className="ops-alert-body">{a.parking_sessions?.plate_snapshot ? <VehiclePlate value={a.parking_sessions.plate_snapshot} compact /> : <strong>Veículo não identificado</strong>}<small>{a.severity === 'expired' ? 'Tempo de estacionamento encerrado' : a.severity === 'attention' ? 'Próximo do limite' : 'Solicitação de fiscalização'} · {dateTime(a.created_at)}</small><span className={`ops-pill ${a.status === 'open' ? 'warning' : 'info'}`}>{statusText(a.status)}</span></div><div className="ops-alert-actions">{a.status === 'open' && <button onClick={() => claimAlert(a)} disabled={busy}>Assumir</button>}<button className="ops-primary" onClick={() => setEnforcement(a)}>Registrar fiscalização</button></div></article>)}{alerts.length === 0 && <div className="ops-empty">Nenhum alerta pendente.</div>}</div>}
          {section === 'history' && area === 'agent' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Atendimentos recentes</h2><p>Histórico de fiscalizações registradas pelo sistema.</p></div></div>{history.map(item=><article className="ops-rule" key={item.id}><div><div className="ops-history-title">{item.alerts?.parking_sessions?.plate_snapshot ? <VehiclePlate value={item.alerts.parking_sessions.plate_snapshot} compact /> : <strong>Veículo sem placa</strong>}<strong>{item.result === 'irregular' ? 'Irregularidade constatada' : 'Situação regular'}</strong></div><small>{dateTime(item.created_at)} · {statusText(item.status)}</small><small>{item.notes || 'Sem observações registradas.'}</small>{(historyPhotoUrls[item.id] || []).map((url,index)=><a className="ops-photo-link" key={url} href={url} target="_blank" rel="noreferrer">Ver evidência {index+1}</a>)}</div></article>)}{history.length===0&&<div className="ops-empty">Você ainda não registrou fiscalizações.</div>}</div>}
          {section === 'zones' && area === 'admin' && <div className="ops-two-col"><div className="ops-panel"><div className="ops-panel-heading"><div><h2>Zonas de estacionamento</h2><p>Cadastre e mantenha as áreas regulamentadas.</p></div></div><form className="ops-form" onSubmit={addZone}><label>Nome da zona<input required maxLength={80} value={zoneForm.name} onChange={e=>setZoneForm(v=>({...v,name:e.target.value}))} placeholder="Ex.: Centro"/></label><label>Descrição<input maxLength={200} value={zoneForm.description} onChange={e=>setZoneForm(v=>({...v,description:e.target.value}))} placeholder="Referência ou limites"/></label><button className="ops-primary" disabled={busy}><Plus size={16}/> Adicionar zona</button></form>{zones.map(z=><div className="ops-row" key={z.id}><MapPin size={18}/><div><strong>{z.name}</strong><small>{z.description || 'Sem descrição'} · {z.active ? 'Ativa' : 'Inativa'}</small></div></div>)}</div><div className="ops-panel"><div className="ops-panel-heading"><div><h2>Cadastro de vagas</h2><p>Vincule cada vaga a uma zona.</p></div></div><form className="ops-form" onSubmit={addSpace}><label>Código da vaga<input required maxLength={24} value={spaceForm.code} onChange={e=>setSpaceForm(v=>({...v,code:e.target.value}))} placeholder="C-001"/></label><label>Zona<select value={spaceForm.zone_id} onChange={e=>setSpaceForm(v=>({...v,zone_id:e.target.value}))}><option value="">Sem zona</option>{zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select></label><label>Categoria<select value={spaceForm.category} onChange={e=>setSpaceForm(v=>({...v,category:e.target.value}))}><option value="conventional">Convencional</option><option value="elderly">Idoso</option><option value="accessible">Pessoa com deficiência</option></select></label><div className="ops-form-grid"><label>Latitude<input type="number" step="any" min="-90" max="90" value={spaceForm.latitude} onChange={e=>setSpaceForm(v=>({...v,latitude:e.target.value}))} placeholder="-23.000000"/></label><label>Longitude<input type="number" step="any" min="-180" max="180" value={spaceForm.longitude} onChange={e=>setSpaceForm(v=>({...v,longitude:e.target.value}))} placeholder="-47.000000"/></label></div><button className="ops-primary" disabled={busy}><Plus size={16}/> Cadastrar vaga</button></form>{spaces.map(s=><div className="ops-row" key={s.id}><MapPin size={18}/><div><strong>{s.code}</strong><small>{s.category === 'elderly' ? 'Idoso' : s.category === 'accessible' ? 'Pessoa com deficiência' : 'Convencional'} · {s.active ? 'Ativa' : 'Inativa'}</small></div><button className="ops-small-action" onClick={()=>void run(async()=>{const {error}=await supabase!.from('parking_spaces').update({active:!s.active}).eq('id',s.id);if(error)throw error;})}>{s.active?'Desativar':'Ativar'}</button></div>)}</div></div>}
          {section === 'users' && area === 'admin' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Contas e permissões</h2><p>Cadastre, edite, suspenda ou exclua contas de acesso.</p></div><div className="ops-user-heading-actions"><span className="ops-pill info">{users.length} contas</span><button type="button" className="ops-primary" onClick={openCreateUser}><Plus size={16}/> Novo usuário</button></div></div><div className="ops-table-wrap"><table><thead><tr><th>USUÁRIO</th><th>E-MAIL</th><th>PERFIL</th><th>ACESSO</th><th>AÇÕES</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><strong>{u.full_name}</strong></td><td>{u.email || '—'}</td><td>{roleText(u.role)}</td><td><span className={`ops-pill ${u.is_active?'success':'danger'}`}>{u.is_active?'Ativo':'Suspenso'}</span></td><td><div className="ops-user-actions"><button type="button" className="ops-small-action" onClick={()=>openEditUser(u)}>Editar</button><button type="button" className="ops-small-action danger" onClick={()=>deleteUser(u)} disabled={u.id===profile.id}>Excluir</button></div></td></tr>)}{users.length===0&&<tr><td colSpan={5} className="ops-empty">Nenhum usuário cadastrado.</td></tr>}</tbody></table></div></div>}
          {section === 'rules' && area === 'admin' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Regras de estacionamento</h2><p>Parâmetros vigentes para o estacionamento rotativo.</p></div></div>{rules.map(rule=><article className="ops-rule" key={rule.id}><div><strong>{rule.name}</strong><small>{rule.enabled?'Regra habilitada':'Regra desabilitada'} · Seg–Sex {rule.start_time.slice(0,5)}–{rule.end_time.slice(0,5)} · Sáb {rule.saturday_start?.slice(0,5) || '—'}–{rule.saturday_end?.slice(0,5) || '—'}</small><small>Convencional: {rule.conventional_minutes} min · Especial: {rule.special_minutes} min · Tolerância: {rule.grace_minutes} min</small></div><button onClick={()=>setEditingRule(rule)}>Editar parâmetros</button></article>)}{rules.length===0&&<div className="ops-empty">Nenhuma regra cadastrada.</div>}<p className="ops-hint">Feriados são mantidos na tabela holidays. O gerenciamento de feriados será habilitado após validação das regras municipais aplicáveis.</p></div>}
          {section === 'audit' && area === 'admin' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Trilha de auditoria</h2><p>Eventos gerados automaticamente pelo banco de dados.</p></div><span className="ops-pill info">{auditLogs.length} eventos recentes</span></div><div className="ops-table-wrap"><table><thead><tr><th>DATA / HORA</th><th>RESPONSÁVEL</th><th>EVENTO</th><th>REGISTRO</th></tr></thead><tbody>{auditLogs.map(log=><tr key={log.id}><td>{dateTime(log.created_at)}</td><td>{log.actor_id || 'Sistema'}</td><td><strong>{log.action}</strong></td><td>{log.entity_type} · {log.entity_id || '—'}</td></tr>)}</tbody></table></div>{auditLogs.length===0&&<div className="ops-empty">Nenhum evento registrado.</div>}</div>}
          {section === 'reports' && area === 'admin' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Relatório de estacionamentos</h2><p>Exportação dos registros atualmente consultados.</p></div><button className="ops-primary" onClick={exportCsv}><Download size={16}/> Exportar CSV</button></div><div className="ops-metrics compact"><article><span>Total consultado</span><strong>{sessions.length}</strong></article><article><span>Ativos</span><strong>{activeSessions.length}</strong></article><article><span>Vencidos</span><strong>{expiredSessions.length}</strong></article></div><p className="ops-hint">O arquivo inclui placa, início, vencimento, status, latitude, longitude, precisão e horário da captura da geolocalização. O resultado respeita as permissões de leitura da conta.</p></div>}
        </>}
      </div>
      <footer className="ops-footer">© 2026 VagaFácil · Plataforma municipal de estacionamento rotativo <span>Ambiente autenticado · {profile.full_name}</span></footer>
    </main>
    {userModalOpen && <div className="ops-modal-backdrop"><form className="ops-modal" onSubmit={saveUser}><button type="button" className="ops-modal-close" onClick={()=>setUserModalOpen(false)} aria-label="Fechar"><X size={18}/></button><span className="ops-eyebrow">GESTÃO DE ACESSO</span><h2>{editingUser?'Editar usuário':'Cadastrar usuário'}</h2><label>Nome completo<input value={userForm.full_name} onChange={e=>setUserForm(v=>({...v,full_name:e.target.value}))} maxLength={120} autoComplete="name" required/></label><label>E-mail institucional<input type="email" value={userForm.email} onChange={e=>setUserForm(v=>({...v,email:e.target.value}))} autoComplete="email" required/></label><label>{editingUser?'Nova senha (opcional)':'Senha inicial'}<input type="password" value={userForm.password} onChange={e=>setUserForm(v=>({...v,password:e.target.value}))} minLength={10} autoComplete="new-password" placeholder={editingUser?'Deixe em branco para manter a atual':'Mínimo de 10 caracteres'} required={!editingUser}/></label><label>Perfil de acesso<select value={userForm.role} onChange={e=>setUserForm(v=>({...v,role:e.target.value}))}><option value="citizen">Cidadão</option><option value="agent">Agente</option><option value="supervisor">Supervisor</option><option value="admin">Administrador</option></select></label><label className="ops-checkbox"><input type="checkbox" checked={userForm.is_active} onChange={e=>setUserForm(v=>({...v,is_active:e.target.checked}))}/> Conta ativa</label><button className="ops-primary" disabled={busy}>{busy?'Salvando...':editingUser?'Salvar alterações':'Cadastrar usuário'}</button></form></div>}
    {editingRule && <div className="ops-modal-backdrop"><form className="ops-modal" onSubmit={saveRule}><button type="button" className="ops-modal-close" onClick={()=>setEditingRule(null)} aria-label="Fechar"><X size={18}/></button><h2>Editar regras</h2><label>Nome<input value={editingRule.name} onChange={e=>setEditingRule(v=>v?({...v,name:e.target.value}):v)} required/></label><div className="ops-form-grid"><label>Início (seg–sex)<input type="time" value={editingRule.start_time.slice(0,5)} onChange={e=>setEditingRule(v=>v?({...v,start_time:e.target.value}):v)} required/></label><label>Fim (seg–sex)<input type="time" value={editingRule.end_time.slice(0,5)} onChange={e=>setEditingRule(v=>v?({...v,end_time:e.target.value}):v)} required/></label><label>Início sábado<input type="time" value={editingRule.saturday_start?.slice(0,5)||''} onChange={e=>setEditingRule(v=>v?({...v,saturday_start:e.target.value||null}):v)}/></label><label>Fim sábado<input type="time" value={editingRule.saturday_end?.slice(0,5)||''} onChange={e=>setEditingRule(v=>v?({...v,saturday_end:e.target.value||null}):v)}/></label><label>Minutos convencional<input type="number" min="1" max="1440" value={editingRule.conventional_minutes} onChange={e=>setEditingRule(v=>v?({...v,conventional_minutes:Number(e.target.value)}):v)}/></label><label>Minutos especial<input type="number" min="1" max="1440" value={editingRule.special_minutes} onChange={e=>setEditingRule(v=>v?({...v,special_minutes:Number(e.target.value)}):v)}/></label><label>Tolerância<input type="number" min="0" max="120" value={editingRule.grace_minutes} onChange={e=>setEditingRule(v=>v?({...v,grace_minutes:Number(e.target.value)}):v)}/></label></div><label className="ops-checkbox"><input type="checkbox" checked={editingRule.enabled} onChange={e=>setEditingRule(v=>v?({...v,enabled:e.target.checked}):v)}/> Regra habilitada</label><button className="ops-primary" disabled={busy}>Salvar regras</button></form></div>}
    {enforcement && <div className="ops-modal-backdrop"><form className="ops-modal" onSubmit={saveEnforcement}><button type="button" className="ops-modal-close" onClick={()=>setEnforcement(null)} aria-label="Fechar"><X size={18}/></button><span className="ops-eyebrow">FISCALIZAÇÃO EM CAMPO</span><h2>Registrar verificação</h2><p className="ops-enforcement-vehicle">Veículo: {enforcement.parking_sessions?.plate_snapshot ? <VehiclePlate value={enforcement.parking_sessions.plate_snapshot} compact /> : <strong>Não identificado</strong>}</p><label>Resultado<select value={enforcementResult} onChange={e=>setEnforcementResult(e.target.value)}><option value="regular">Situação regular</option><option value="irregular">Irregularidade constatada</option></select></label><label>Observações<textarea rows={4} maxLength={2000} value={enforcementNotes} onChange={e=>setEnforcementNotes(e.target.value)} placeholder="Descreva a verificação realizada..."/></label><label className="ops-upload"><Camera size={18}/> Fotos da fiscalização<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setEvidenceFiles(Array.from(e.target.files || []).slice(0,5))}/><small>{evidenceFiles.length} arquivo(s) selecionado(s) · máximo 5 MB por imagem</small></label><button className="ops-primary" disabled={busy}>Concluir fiscalização</button></form></div>}
  </div>;
}
