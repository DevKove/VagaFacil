import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, AlertTriangle, Bell, BookOpen, Camera, CarFront, ChevronDown, Clock3, CreditCard, Download, FileText, Filter, Images, KeyRound, LayoutDashboard, LogOut, MapPin, MapPinned, Menu, Pencil, Plus, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { VehiclePlate } from '../../components/VehiclePlate';
import AdsManager from './AdsManager';
import { exportDataset } from '../../utils/export';

type Profile = { id: string; full_name: string; role: string; is_active: boolean; email?: string };
type Session = { id: string; plate_snapshot: string; started_at: string; expires_at: string; ended_at: string | null; status: string; user_id: string; space_id: string | null; latitude?: number | null; longitude?: number | null; location_accuracy_m?: number | null; location_captured_at?: string | null; parking_spaces?: { code: string; latitude?: number | null; longitude?: number | null; parking_zones?: { name: string } | null } | null };
type Alert = { id: string; status: string; severity: string; created_at: string; session_id: string; claimed_by: string | null; parking_sessions?: Session | null };
type Zone = { id: string; name: string; description: string | null; active: boolean };
type Space = { id: string; code: string; category: string; active: boolean; zone_id: string | null; latitude: number | null; longitude: number | null };
type AuditLog = { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; created_at: string };
type EnforcementHistory = { id: string; status: string; result: string | null; notes: string | null; created_at: string; alert_id: string; alerts?: { parking_sessions?: { plate_snapshot: string } | null } | null; enforcement_photos?: { storage_path: string }[] };
type Rule = { id: string; name: string; enabled: boolean; start_time: string; end_time: string; saturday_start: string | null; saturday_end: string | null; conventional_minutes: number; special_minutes: number; grace_minutes: number };
type PhysicalCardSession = { id: string; plate_snapshot: string; category: string; started_at: string; expires_at: string; ended_at: string | null; status: string; zone_id: string | null; space_id: string | null; created_by: string; created_by_name: string; created_at: string; notes: string | null; latitude: number; longitude: number; location_accuracy_m: number | null; location_captured_at: string };
const localDateTimeParts = (value = new Date()) => { const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString(); return { date: local.slice(0,10), time: local.slice(11,16) }; };
const getDeviceLocation = () => new Promise<{ latitude: number; longitude: number; accuracy: number }>((resolve, reject) => {
  if (!navigator.geolocation) { reject(new Error('Este dispositivo não disponibiliza geolocalização.')); return; }
  navigator.geolocation.getCurrentPosition(
    position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
    error => reject(new Error(error.code === error.PERMISSION_DENIED ? 'Permita o acesso à localização do dispositivo para registrar o cartão.' : error.code === error.POSITION_UNAVAILABLE ? 'Não foi possível determinar a localização. Verifique o GPS e tente novamente.' : 'A localização demorou para responder. Ative o GPS e tente novamente.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
});


const menus = {
  agent: [{ id: 'overview', label: 'Painel operacional', icon: LayoutDashboard }, { id: 'sessions', label: 'Sessões em andamento', icon: CarFront }, { id: 'card', label: 'Cartão', icon: CreditCard }, { id: 'alerts', label: 'Alertas e fiscalização', icon: AlertTriangle }, { id: 'history', label: 'Histórico de ações', icon: FileText }, { id: 'map', label: 'Mapa operacional', icon: MapPinned }, { id: 'manual', label: 'Manual', icon: BookOpen }],
  admin: [{ id: 'overview', label: 'Visão geral', icon: LayoutDashboard }, { id: 'sessions', label: 'Estacionamentos', icon: CarFront }, { id: 'card', label: 'Cartão', icon: CreditCard }, { id: 'zones', label: 'Zonas e vagas', icon: MapPin }, { id: 'users', label: 'Usuários e agentes', icon: Users }, { id: 'rules', label: 'Regras e feriados', icon: Clock3 }, { id: 'reports', label: 'Relatórios', icon: FileText }, { id: 'map', label: 'Mapa de vagas', icon: MapPinned }, { id: 'ads', label: 'Ads', icon: Images }, { id: 'audit', label: 'Auditoria', icon: ShieldCheck }],
};
const agentManualTopics = [
  { id: 'overview', title: 'Painel operacional', summary: 'Entenda os indicadores e atalhos da tela inicial.', target: 'overview', keywords: 'painel indicadores alertas atendimento fiscalizações vencidos', steps: ['Acesse o painel para visualizar os indicadores atualizados da operação.', 'Use os cartões de indicadores para abrir diretamente alertas, histórico ou sessões.', 'Na área de acesso rápido, abra as funções mais utilizadas durante o trabalho em campo.'], tip: 'Os números são carregados dos registros disponíveis para sua conta.' },
  { id: 'sessions', title: 'Consultar sessões em andamento', summary: 'Pesquise veículos, placas, horários e localização.', target: 'sessions', keywords: 'sessões estacionamento placa vencimento localização veículo consulta', steps: ['Abra “Sessões em andamento” no menu lateral.', 'Pesquise pela placa ou consulte os dados de início, vencimento e situação.', 'Quando houver coordenadas, selecione o link de localização para abrir o ponto no mapa.', 'Observe a situação para identificar sessões em andamento ou com período excedido.'], tip: 'A localização depende da permissão de GPS concedida no momento do registro.' },
  { id: 'card', title: 'Registrar cartão físico', summary: 'Lance um estacionamento realizado por cartão físico.', target: 'card', keywords: 'cartão físico lançamento placa gps zona vaga categoria horário', steps: ['Abra “Cartão” e escolha a opção para cadastrar um novo registro.', 'Informe a placa, a categoria e os dados de zona ou vaga solicitados.', 'Confira a data e o horário de início antes de salvar.', 'Permita o acesso à localização do dispositivo para registrar as coordenadas do lançamento.', 'Consulte a lista de registros para acompanhar o vencimento e, quando permitido, editar ou encerrar o lançamento.'], tip: 'O GPS precisa estar ativo e autorizado. O sistema calcula o vencimento conforme a duração configurada para a categoria.' },
  { id: 'alerts', title: 'Atender alertas e realizar fiscalização', summary: 'Assuma alertas e registre o resultado da verificação em campo.', target: 'alerts', keywords: 'alertas fila assumir fiscalização ocorrência fotos evidência irregular regular', steps: ['Abra “Alertas e fiscalização” para consultar os alertas disponíveis.', 'Selecione “Assumir” para indicar que você está atendendo um alerta.', 'Use “Registrar fiscalização” após verificar o veículo no local.', 'Informe se a situação está regular ou se foi constatada irregularidade.', 'Adicione observações e, se necessário, anexe até cinco fotos de evidência.', 'Conclua o registro para finalizar o atendimento e atualizar a situação do alerta.'], tip: 'As imagens aceitas são JPG, PNG ou WEBP, com até 5 MB cada.' },
  { id: 'history', title: 'Consultar histórico de ações', summary: 'Revise fiscalizações já registradas por você.', target: 'history', keywords: 'histórico atendimentos ações registros fiscalização fotos resultado observações', steps: ['Abra “Histórico de ações” no menu lateral.', 'Consulte o veículo, o resultado, a data e a situação de cada atendimento.', 'Leia as observações registradas e abra os links para visualizar evidências anexadas, quando disponíveis.'], tip: 'O histórico apresenta os atendimentos vinculados à sua conta.' },
  { id: 'map', title: 'Usar o mapa operacional', summary: 'Visualize os pontos de vagas e referências geográficas disponíveis.', target: 'map', keywords: 'mapa localização geolocalização vagas pontos coordenadas', steps: ['Abra “Mapa operacional”.', 'Consulte os pontos georreferenciados que estiverem disponíveis para a operação.', 'Use a localização exibida para orientar a verificação em campo.'], tip: 'A exibição depende de coordenadas cadastradas para os locais.' },
  { id: 'security', title: 'Acesso e segurança da conta', summary: 'Cuide da autenticação e encerre sua sessão corretamente.', target: null, keywords: 'login senha autenticador dois fatores mfa sair segurança conta', steps: ['O acesso operacional exige autenticação em duas etapas quando configurada para o perfil.', 'Mantenha o código do aplicativo autenticador em sigilo e nunca o compartilhe.', 'Ao terminar o expediente ou utilizar um dispositivo compartilhado, selecione “Sair da conta”.'], tip: 'Se perder acesso ao autenticador, solicite à administração a redefinição da autenticação.' },
] as const;
const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
const dateOnly = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
const timeOnly = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium' }).format(new Date(value));
const statusText = (status: string) => ({ active: 'Em andamento', expired: 'Vencido', finished: 'Encerrado', open: 'Aberto', claimed: 'Em atendimento', resolved: 'Resolvido', dismissed: 'Descartado' }[status] || status);
const roleText = (role: string) => ({ admin: 'Administrador', supervisor: 'Supervisor', agent: 'Agente', citizen: 'Cidadão' }[role] || role);
const auditActionText = (action: string) => {
  const value = action.trim().toUpperCase();
  const labels: Record<string, string> = {
    INSERT: 'Cadastro criado',
    CREATE: 'Cadastro criado',
    UPDATE: 'Registro atualizado',
    DELETE: 'Registro excluído',
    LOGIN: 'Acesso realizado',
    LOGOUT: 'Saída do sistema',
    SIGN_IN: 'Acesso realizado',
    SIGN_OUT: 'Saída do sistema',
  };
  return labels[value] || action.replace(/[_-]+/g, ' ').toLocaleLowerCase('pt-BR').replace(/^[a-zá-ú]/i, letter => letter.toLocaleUpperCase('pt-BR'));
};
const auditEntityText = (entity: string) => ({
  profiles: 'Usuário',
  users: 'Usuário',
  parking_sessions: 'Estacionamento',
  physical_card_sessions: 'Cartão físico',
  parking_zones: 'Zona',
  parking_spaces: 'Vaga',
  parking_rules: 'Regra de estacionamento',
  alerts: 'Alerta',
  enforcements: 'Fiscalização',
  ads: 'Anúncio',
}[entity] || entity.replace(/[_-]+/g, ' '));



async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const records: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await fetchPage(offset, offset + 999);
    if (error) throw error;
    const page = data || [];
    records.push(...page);
    if (page.length < 1000) return records;
  }
}

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
  const [manualSearch, setManualSearch] = useState('');
  const [manualExpanded, setManualExpanded] = useState('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [physicalCardSessions, setPhysicalCardSessions] = useState<PhysicalCardSession[]>([]);
  const [editingCard, setEditingCard] = useState<PhysicalCardSession | null>(null);
  const [cardForm, setCardForm] = useState(() => ({ plate: '', category: 'conventional', zone_id: '', space_id: '', ...{ started_date: localDateTimeParts().date, started_time: localDateTimeParts().time }, notes: '' }));
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
  const [globalSearch, setGlobalSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sectionFilter, setSectionFilter] = useState('');
  const [sectionStatus, setSectionStatus] = useState('all');
  const [reportFilters, setReportFilters] = useState({ startDate: '', endDate: '', status: 'all', zone: '', plate: '' });
  const [zoneForm, setZoneForm] = useState({ name: '', description: '' });
  const [spaceForm, setSpaceForm] = useState({ code: '', zone_id: '', category: 'conventional', latitude: '', longitude: '' });
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userList, setUserList] = useState<'operational' | 'citizens'>('operational');
  const [userForm, setUserForm] = useState({ full_name: '', email: '', password: '', role: 'citizen', is_active: true });
  const [enforcement, setEnforcement] = useState<Alert | null>(null);
  const [enforcementResult, setEnforcementResult] = useState('regular');
  const [enforcementNotes, setEnforcementNotes] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    const client = supabase;
    setLoading(true);
    setError('');
    try {
      const [sessionRows, alertRows, spaceRows, zoneRows, cardRows] = await Promise.all([
        fetchAllPages((from,to) => client.from('parking_sessions').select('id,plate_snapshot,started_at,expires_at,ended_at,status,user_id,space_id,latitude,longitude,location_accuracy_m,location_captured_at,parking_spaces(code,latitude,longitude,parking_zones(name))').order('started_at', { ascending: false }).range(from,to)),
        fetchAllPages((from,to) => client.from('alerts').select('id,status,severity,created_at,session_id,claimed_by,parking_sessions(id,plate_snapshot,started_at,expires_at,status,user_id,space_id,latitude,longitude,parking_spaces(code,latitude,longitude,parking_zones(name)))').in('status', ['open','claimed']).order('created_at', { ascending: false }).range(from,to)),
        fetchAllPages((from,to) => client.from('parking_spaces').select('id,code,category,active,zone_id,latitude,longitude').order('code').range(from,to)),
        fetchAllPages((from,to) => client.from('parking_zones').select('id,name,description,active').order('name').range(from,to)),
        area === 'agent' || profile.role === 'admin' || profile.role === 'supervisor' ? fetchAllPages((from,to) => client.from('physical_card_sessions').select('id,plate_snapshot,category,started_at,expires_at,ended_at,status,zone_id,space_id,created_by,created_by_name,created_at,notes,latitude,longitude,location_accuracy_m,location_captured_at').order('started_at', { ascending: false }).range(from,to)) : Promise.resolve([]),
      ]);
      setSessions(sessionRows as unknown as Session[]);
      setZones(zoneRows as Zone[]);
      setPhysicalCardSessions(cardRows as PhysicalCardSession[]);
      setAlerts(alertRows as unknown as Alert[]);
      setSpaces(spaceRows as Space[]);
      if (area === 'agent') {
        const historyRows = await fetchAllPages((from,to) => client.from('enforcements').select('id,status,result,notes,created_at,alert_id,alerts(parking_sessions(plate_snapshot)),enforcement_photos(storage_path)').eq('agent_id', profile.id).order('created_at', { ascending: false }).range(from,to));
        const historyItems = historyRows as unknown as EnforcementHistory[];
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
        const [userRes, ruleRows, auditRows] = await Promise.all([
          invokeUserManagement({ action: 'list' }),
          fetchAllPages((from,to) => client.from('parking_rules').select('id,name,enabled,start_time,end_time,saturday_start,saturday_end,conventional_minutes,special_minutes,grace_minutes').order('created_at', { ascending: false }).range(from,to)),
          fetchAllPages((from,to) => client.from('audit_logs').select('id,actor_id,action,entity_type,entity_id,created_at').order('created_at', { ascending: false }).range(from,to)),
        ]);
        setUsers((userRes?.users || []) as Profile[]);
        setRules(ruleRows as Rule[]);
        setAuditLogs(auditRows as AuditLog[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar os dados do ambiente.');
    } finally {
      setLoading(false);
    }
  }, [area, profile.id]);

  useEffect(() => { void load(); }, [load]);
  const normalizedSectionFilter = sectionFilter.trim().toLocaleLowerCase('pt-BR');
  const matchesSectionFilter = (values: unknown[]) => !normalizedSectionFilter || values.some(value => String(value ?? '').toLocaleLowerCase('pt-BR').includes(normalizedSectionFilter));
  const monitoredSessions = useMemo(() => [
    ...sessions.map(session => ({ ...session, source: 'citizen' as const })),
    ...physicalCardSessions.map(item => {
      const space = spaces.find(value => value.id === item.space_id);
      const zone = zones.find(value => value.id === item.zone_id);
      return { id: item.id, plate_snapshot: item.plate_snapshot, started_at: item.started_at, expires_at: item.expires_at, ended_at: item.ended_at, status: item.status === 'finished' ? 'finished' : new Date(item.expires_at).getTime() <= Date.now() ? 'expired' : 'active', user_id: item.created_by, created_by_name: item.created_by_name, space_id: item.space_id, latitude: item.latitude, longitude: item.longitude, location_accuracy_m: item.location_accuracy_m, location_captured_at: item.location_captured_at, parking_spaces: space ? { code: space.code, parking_zones: zone ? { name: zone.name } : null } : null, source: 'physical_card' as const };
    }),
  ].sort((a,b)=>new Date(b.started_at).getTime()-new Date(a.started_at).getTime()), [sessions,physicalCardSessions,spaces,zones]);
  const filteredMonitoredSessions = monitoredSessions.filter(item => {
    const terms=[item.plate_snapshot,item.latitude,item.longitude,item.parking_spaces?.code,item.parking_spaces?.parking_zones?.name,item.source==='physical_card'?'cartão físico agente':'aplicativo cidadão'];
    const statusMatches=sectionStatus==='all'||(sectionStatus==='expired'?item.status==='expired'||(item.status==='active'&&new Date(item.expires_at).getTime()<=Date.now()):item.status===sectionStatus);
    return terms.join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))&&matchesSectionFilter(terms)&&statusMatches;
  });
  const filteredUsers = users.filter(u => matchesSectionFilter([u.full_name,u.email,u.role,u.is_active ? 'ativo' : 'suspenso']) && (sectionStatus === 'all' || (sectionStatus === 'active' ? u.is_active : sectionStatus === 'inactive' ? !u.is_active : true)));
  const globalSearchTerm = globalSearch.trim().toLocaleLowerCase('pt-BR');
  const globalSearchResults = useMemo(() => {
    if (!globalSearchTerm) return [];
    const results: { id: string; title: string; detail: string; section: string }[] = [];
    const add = (id: string, title: string, detail: string, section: string, values: unknown[]) => {
      if (values.some(value => String(value ?? '').toLocaleLowerCase('pt-BR').includes(globalSearchTerm))) results.push({ id, title, detail, section });
    };
    monitoredSessions.forEach(item => { const creatorName = item.source === 'physical_card' ? item.created_by_name : undefined; add('session-'+item.source+'-'+item.id,item.plate_snapshot,[item.source === 'physical_card' ? 'Cartão físico' : 'Aplicativo',item.parking_spaces?.parking_zones?.name,item.parking_spaces?.code,creatorName].filter(Boolean).join(' · '),'sessions',[item.plate_snapshot,item.source === 'physical_card' ? 'cartão físico' : 'aplicativo',item.parking_spaces?.parking_zones?.name,item.parking_spaces?.code,creatorName,item.latitude,item.longitude]); });
    users.forEach(item => add('user-'+item.id,item.full_name,[item.email,roleText(item.role),item.is_active?'Ativo':'Suspenso'].filter(Boolean).join(' · '),'users',[item.full_name,item.email,item.role,item.is_active?'ativo':'suspenso']));
    zones.forEach(item => add('zone-'+item.id,item.name,item.description || 'Zona de estacionamento','zones',[item.name,item.description]));
    spaces.forEach(item => add('space-'+item.id,item.code,'Vaga · '+item.category,'zones',[item.code,item.category]));
    alerts.forEach(item => add('alert-'+item.id,item.parking_sessions?.plate_snapshot || 'Alerta de fiscalização',[statusText(item.status),item.severity].join(' · '),'alerts',[item.parking_sessions?.plate_snapshot,item.status,item.severity]));
    rules.forEach(item => add('rule-'+item.id,item.name,'Regra de estacionamento','rules',[item.name,item.enabled?'habilitada':'desabilitada']));
    auditLogs.forEach(item => add('audit-'+item.id,item.action,[item.entity_type,item.entity_id,item.actor_id].filter(Boolean).join(' · '),'audit',[item.action,item.entity_type,item.entity_id,item.actor_id]));
    return results.slice(0,60);
  }, [globalSearchTerm,monitoredSessions,users,zones,spaces,alerts,rules,auditLogs]);
  const filteredOperationalUsers = filteredUsers.filter(u => ['admin','supervisor','agent'].includes(u.role));
  const filteredCitizenUsers = filteredUsers.filter(u => u.role === 'citizen');
  const filteredAlerts = alerts.filter(a => matchesSectionFilter([a.parking_sessions?.plate_snapshot,a.severity,a.status]) && (sectionStatus === 'all' || a.status === sectionStatus));
  const filteredHistory = history.filter(item => matchesSectionFilter([item.alerts?.parking_sessions?.plate_snapshot,item.result,item.status,item.notes]) && (sectionStatus === 'all' || item.status === sectionStatus));
  const filteredZones = zones.filter(z => matchesSectionFilter([z.name,z.description,z.active ? 'ativa' : 'inativa']) && (sectionStatus === 'all' || (sectionStatus === 'active' ? z.active : sectionStatus === 'inactive' ? !z.active : true)));
  const filteredSpaces = spaces.filter(item => matchesSectionFilter([item.code,item.category,item.active ? 'ativa' : 'inativa']) && (sectionStatus === 'all' || (sectionStatus === 'active' ? item.active : sectionStatus === 'inactive' ? !item.active : true)));
  const filteredRules = rules.filter(rule => matchesSectionFilter([rule.name,rule.enabled ? 'habilitada' : 'desabilitada']) && (sectionStatus === 'all' || (sectionStatus === 'active' ? rule.enabled : sectionStatus === 'inactive' ? !rule.enabled : true)));
  const filteredAuditLogs = auditLogs.filter(log => { const actor = users.find(user => user.id === log.actor_id); return matchesSectionFilter([actor?.full_name,actor?.email,log.actor_id,log.action,auditActionText(log.action),log.entity_type,auditEntityText(log.entity_type),log.entity_id]); });
  const auditTodayCount = auditLogs.filter(log => new Date(log.created_at).toDateString() === new Date().toDateString()).length;
  const auditActorCount = new Set(auditLogs.map(log => log.actor_id).filter(Boolean)).size;
  const activeSessions = sessions.filter(s => s.status === 'active');
  const expiredSessions = sessions.filter(s => s.status === 'expired' || (s.status === 'active' && new Date(s.expires_at).getTime() <= Date.now()));
  const openAlerts = alerts.filter(a => a.status === 'open').length;
  const reportSessions = useMemo(() => monitoredSessions.filter(session => {
    const started = new Date(session.started_at);
    const start = reportFilters.startDate ? new Date(`${reportFilters.startDate}T00:00:00`) : null;
    const end = reportFilters.endDate ? new Date(`${reportFilters.endDate}T23:59:59.999`) : null;
    const normalizedStatus = session.status === 'active' && new Date(session.expires_at).getTime() <= Date.now() ? 'expired' : session.status;
    const zoneName = session.parking_spaces?.parking_zones?.name || '';
    return (!start || started >= start) && (!end || started <= end)
      && (reportFilters.status === 'all' || normalizedStatus === reportFilters.status)
      && (!reportFilters.zone || zoneName === reportFilters.zone)
      && (!reportFilters.plate || session.plate_snapshot.toLowerCase().includes(reportFilters.plate.trim().toLowerCase()))
      && (!normalizedSectionFilter || [session.plate_snapshot, zoneName, session.status].some(value => String(value ?? '').toLocaleLowerCase('pt-BR').includes(normalizedSectionFilter)));
  }), [monitoredSessions, reportFilters, normalizedSectionFilter]);
  const reportMetrics = useMemo(() => ({
    total: reportSessions.length,
    active: reportSessions.filter(session => session.status === 'active' && new Date(session.expires_at).getTime() > Date.now()).length,
    expired: reportSessions.filter(session => session.status === 'expired' || (session.status === 'active' && new Date(session.expires_at).getTime() <= Date.now())).length,
    finished: reportSessions.filter(session => session.status === 'finished').length,
  }), [reportSessions]);

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
  const resetUserAuthenticator = (user: Profile) => {
    if (!window.confirm(`Resetar o autenticador de ${user.full_name} (${user.email || 'e-mail não informado'})? Os fatores MFA serão removidos e as sessões ativas poderão ser encerradas.`)) return;
    void run(async () => {
      await invokeUserManagement({ action: 'reset_mfa', id: user.id });
    });
  };
  const savePhysicalCardSession = (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    const plate = cardForm.plate.replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) { setError('Informe uma placa válida no padrão ABC1D23 ou ABC1234.'); return; }
    const startedAt = new Date(`${cardForm.started_date}T${cardForm.started_time}`);
    if (!cardForm.started_date || !cardForm.started_time || Number.isNaN(startedAt.getTime()) || startedAt.getTime() > Date.now()) { setError('Informe uma data e um horário de início válidos, não futuros.'); return; }
    void run(async () => {
      const location = await getDeviceLocation();
      const { error } = await supabase!.rpc('register_physical_card_session', {
        p_plate: plate,
        p_category: cardForm.category,
        p_zone_id: cardForm.zone_id || null,
        p_space_id: cardForm.space_id || null,
        p_started_at: startedAt.toISOString(),
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_location_accuracy_m: location.accuracy,
        p_notes: cardForm.notes.trim() || null,
      });
      if (error) throw error;
      setCardForm({ plate: '', category: 'conventional', zone_id: '', space_id: '', started_date: localDateTimeParts().date, started_time: localDateTimeParts().time, notes: '' });
    });
  };
  const openEditPhysicalCard = (item: PhysicalCardSession) => {
    const parts = localDateTimeParts(new Date(item.started_at));
    setEditingCard(item);
    setCardForm({ plate: item.plate_snapshot, category: item.category, zone_id: item.zone_id || '', space_id: item.space_id || '', started_date: parts.date, started_time: parts.time, notes: item.notes || '' });
  };
  const saveEditedPhysicalCard = (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !editingCard) return;
    const plate = cardForm.plate.replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) { setError('Informe uma placa válida no padrão ABC1D23 ou ABC1234.'); return; }
    const startedAt = new Date(`${cardForm.started_date}T${cardForm.started_time}`);
    if (!cardForm.started_date || !cardForm.started_time || Number.isNaN(startedAt.getTime()) || startedAt.getTime() > Date.now()) { setError('Informe uma data e um horário de início válidos, não futuros.'); return; }
    void run(async () => {
      const { error } = await supabase!.rpc('update_physical_card_session', { p_session_id: editingCard.id, p_plate: plate, p_category: cardForm.category, p_zone_id: cardForm.zone_id || null, p_space_id: cardForm.space_id || null, p_started_at: startedAt.toISOString(), p_notes: cardForm.notes.trim() || null });
      if (error) throw error;
      setEditingCard(null);
      setCardForm({ plate: '', category: 'conventional', zone_id: '', space_id: '', started_date: localDateTimeParts().date, started_time: localDateTimeParts().time, notes: '' });
    });
  };
  const finishPhysicalCardSession = (item: PhysicalCardSession) => {
    if (!supabase || item.status === 'finished') return;
    if (!window.confirm(`Encerrar definitivamente o registro do veículo ${item.plate_snapshot}?`)) return;
    void run(async () => { const { error } = await supabase!.rpc('finish_physical_card_session', { p_session_id: item.id }); if (error) throw error; });
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
      const { data: notice, error } = await supabase!.from('notifications').insert({
        user_id: session.user_id,
        title: 'Atenção ao estacionamento',
        body: `Veículo ${session.plate_snapshot}: verifique as informações do seu registro de estacionamento.`,
        kind: 'admin_manual_alert',
      }).select('id').single();
      if (error) throw error;
      const { data: pushResult, error: pushError } = await supabase!.functions.invoke('send-web-push', {
        body: { notificationId: notice.id },
      });
      if (pushError) {
        throw new Error('Alerta registrado no sistema, mas o envio ao celular não foi concluído. Verifique a configuração do Web Push no Supabase.');
      }
      if (!pushResult || pushResult.sent < 1) {
        throw new Error(pushResult?.message || 'Alerta registrado no sistema, mas este cidadão ainda não possui um aparelho inscrito para receber notificações push.');
      }
      if (pushResult.failed > 0) {
        throw new Error(`Alerta enviado a ${pushResult.sent} aparelho(s), mas ${pushResult.failed} envio(s) falharam. Verifique a inscrição dos aparelhos.`);
      }
    });
  };
  const saveRule = (event: FormEvent) => { event.preventDefault(); if (!supabase || !editingRule) return; void run(async () => { const { id, name, enabled, start_time, end_time, saturday_start, saturday_end, conventional_minutes, special_minutes, grace_minutes } = editingRule; const { error } = await supabase!.from('parking_rules').update({ name, enabled, start_time, end_time, saturday_start, saturday_end, conventional_minutes, special_minutes, grace_minutes }).eq('id', id); if (error) throw error; setEditingRule(null); }); };
  const claimAlert = (alert: Alert) => { if (!supabase) return; void run(async () => { const { error } = await supabase!.from('alerts').update({ status: 'claimed', claimed_by: profile.id, claimed_at: new Date().toISOString() }).eq('id', alert.id).eq('status', 'open'); if (error) throw error; }); };
  const saveEnforcement = (event: FormEvent) => { event.preventDefault(); if (!supabase || !enforcement) return; void run(async () => { if (evidenceFiles.length > 5) throw new Error('Anexe no máximo 5 fotos por fiscalização.'); if (evidenceFiles.some(file => file.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))) throw new Error('Cada foto deve ser JPG, PNG ou WEBP e ter até 5 MB.'); const { data, error } = await supabase!.from('enforcements').insert({ alert_id: enforcement.id, agent_id: profile.id, status: 'closed', result: enforcementResult, notes: enforcementNotes.trim() || null, verified_at: new Date().toISOString(), closed_at: new Date().toISOString() }).select('id').single(); if (error) throw error; const uploaded: string[] = []; try { for (const file of evidenceFiles) { const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]; const path = `${profile.id}/${data.id}/${crypto.randomUUID()}.${ext}`; const { error: uploadError } = await supabase!.storage.from('enforcement-evidence').upload(path, file, { contentType: file.type, upsert: false }); if (uploadError) throw uploadError; uploaded.push(path); } if (uploaded.length) { const { error: photoError } = await supabase!.from('enforcement_photos').insert(uploaded.map(storage_path => ({ enforcement_id: data.id, storage_path }))); if (photoError) throw photoError; } } catch (uploadFailure) { if (uploaded.length) await supabase!.storage.from('enforcement-evidence').remove(uploaded); await supabase!.from('enforcements').delete().eq('id', data.id); throw uploadFailure; } const { error: alertError } = await supabase!.from('alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', enforcement.id); if (alertError) throw alertError; setEnforcement(null); setEnforcementNotes(''); setEvidenceFiles([]); }); };

  const canExportReports = profile.role === 'admin' || profile.role === 'supervisor';
  const sessionExportRows = (items: typeof monitoredSessions) => items.map(item => [item.plate_snapshot,item.source === 'physical_card' ? 'Cartão físico' : 'Aplicativo',item.parking_spaces?.parking_zones?.name || '',item.parking_spaces?.code || '',item.started_at,item.expires_at,item.ended_at || '',statusText(item.status),item.source === 'physical_card' ? item.created_by_name : '',item.latitude ?? '',item.longitude ?? '',item.location_accuracy_m ?? '',item.location_captured_at || '']);
  const exportCurrent = (format: 'pdf' | 'excel') => {
    if (!canExportReports) return;
    const sessionHeaders = ['Placa','Origem','Zona','Vaga','Início','Vencimento','Encerramento','Situação','Responsável','Latitude','Longitude','Precisão GPS (m)','GPS capturado em'];
    if (section === 'sessions' || section === 'reports') return exportDataset(section === 'reports' ? 'Relatório de estacionamentos' : 'Estacionamentos monitorados',sessionHeaders,sessionExportRows(section === 'reports' ? reportSessions : filteredMonitoredSessions),format);
    if (section === 'card') return exportDataset('Cartões físicos',['Placa','Categoria','Início','Vencimento','Encerramento','Situação','Zona','Vaga','Responsável','Observações','Latitude','Longitude','Precisão GPS (m)','GPS capturado em'],physicalCardSessions.map(item=>[item.plate_snapshot,item.category,item.started_at,item.expires_at,item.ended_at || '',statusText(item.status),zones.find(z=>z.id===item.zone_id)?.name || '',spaces.find(sp=>sp.id===item.space_id)?.code || '',item.created_by_name,item.notes || '',item.latitude,item.longitude,item.location_accuracy_m ?? '',item.location_captured_at]),format);
    if (section === 'users') { const list = userList === 'citizens' ? filteredCitizenUsers : filteredOperationalUsers; return exportDataset(userList === 'citizens' ? 'Cidadãos' : 'Usuários e agentes',['Nome','E-mail','Perfil','Acesso'],list.map(item=>[item.full_name,item.email || '',roleText(item.role),item.is_active?'Ativo':'Suspenso']),format); }
    if (section === 'zones') return exportDataset('Zonas e vagas',['Tipo','Nome ou código','Descrição ou categoria','Zona vinculada','Situação','Latitude','Longitude'],[...filteredZones.map(item=>['Zona',item.name,item.description || '', '',item.active?'Ativa':'Inativa','','']),...filteredSpaces.map(item=>['Vaga',item.code,item.category,zones.find(z=>z.id===item.zone_id)?.name || '',item.active?'Ativa':'Inativa',item.latitude ?? '',item.longitude ?? ''])],format);
    if (section === 'rules') return exportDataset('Regras de estacionamento',['Regra','Situação','Segunda a sexta','Sábado','Convencional (min)','Especial (min)','Tolerância (min)'],filteredRules.map(item=>[item.name,item.enabled?'Habilitada':'Desabilitada',item.start_time+' às '+item.end_time,(item.saturday_start || '—')+' às '+(item.saturday_end || '—'),item.conventional_minutes,item.special_minutes,item.grace_minutes]),format);
    if (section === 'audit') return exportDataset('Auditoria do sistema',['Data e hora','Responsável','E-mail','Ação','Tipo de registro','Identificador'],filteredAuditLogs.map(log=>{const actor=users.find(user=>user.id===log.actor_id);return [log.created_at,actor?.full_name || (log.actor_id?'Usuário não identificado':'Sistema'),actor?.email || '',auditActionText(log.action),auditEntityText(log.entity_type),log.entity_id || ''];}),format);
    if (section === 'map') return exportDataset('Mapa de vagas',['Código','Categoria','Situação','Latitude','Longitude','Zona'],mappedSpaces.map(item=>[item.code,item.category,item.active?'Ativa':'Inativa',item.latitude,item.longitude,zones.find(z=>z.id===item.zone_id)?.name || '']),format);
    if (section === 'alerts') return exportDataset('Alertas de fiscalização',['Placa','Severidade','Situação','Criado em','Responsável'],filteredAlerts.map(item=>[item.parking_sessions?.plate_snapshot || '',item.severity,statusText(item.status),item.created_at,users.find(user=>user.id===item.claimed_by)?.full_name || '']),format);
    if (section === 'history') return exportDataset('Histórico de fiscalizações',['Placa','Data e hora','Situação','Resultado','Observações'],filteredHistory.map(item=>[item.alerts?.parking_sessions?.plate_snapshot || '',item.created_at,statusText(item.status),item.result === 'irregular'?'Irregularidade constatada':item.result === 'regular'?'Situação regular':item.result || '',item.notes || '']),format);
    const allRows = [
      ...sessionExportRows(monitoredSessions).map(row=>['Estacionamento',...row]),
      ...users.map(item=>['Usuário',item.full_name,item.email || '',roleText(item.role),item.is_active?'Ativo':'Suspenso']),
      ...zones.map(item=>['Zona',item.name,item.description || '',item.active?'Ativa':'Inativa']),
      ...spaces.map(item=>['Vaga',item.code,item.category,zones.find(z=>z.id===item.zone_id)?.name || '',item.active?'Ativa':'Inativa']),
      ...alerts.map(item=>['Alerta',item.parking_sessions?.plate_snapshot || '',statusText(item.status),item.severity,item.created_at]),
      ...rules.map(item=>['Regra',item.name,item.enabled?'Habilitada':'Desabilitada',item.start_time,item.end_time]),
      ...auditLogs.map(item=>['Auditoria',item.created_at,auditActionText(item.action),auditEntityText(item.entity_type),item.actor_id || '']),
    ];
    return exportDataset('Base geral de registros',['Tipo','Campo 1','Campo 2','Campo 3','Campo 4','Campo 5','Campo 6','Campo 7','Campo 8','Campo 9','Campo 10','Campo 11','Campo 12','Campo 13'],allRows,format);
  };


  const filteredManualTopics = agentManualTopics.filter(topic => `${topic.title} ${topic.summary} ${topic.keywords} ${topic.steps.join(' ')}`.toLocaleLowerCase('pt-BR').includes(manualSearch.trim().toLocaleLowerCase('pt-BR')));
  const mappedSpaces = spaces.filter(item => item.latitude !== null && item.longitude !== null);
  const mapCenter = mappedSpaces.length ? { lat: mappedSpaces.reduce((sum,item)=>sum + Number(item.latitude),0)/mappedSpaces.length, lon: mappedSpaces.reduce((sum,item)=>sum + Number(item.longitude),0)/mappedSpaces.length } : null;
  const mapBounds = mappedSpaces.length ? { minLon: Math.min(...mappedSpaces.map(item=>Number(item.longitude))) - 0.002, maxLon: Math.max(...mappedSpaces.map(item=>Number(item.longitude))) + 0.002, minLat: Math.min(...mappedSpaces.map(item=>Number(item.latitude))) - 0.002, maxLat: Math.max(...mappedSpaces.map(item=>Number(item.latitude))) + 0.002 } : null;
  const menu = area === 'admin' && profile.role === 'admin' ? menus.admin : area === 'admin' ? menus.admin.filter(item => item.id !== 'ads' && item.id !== 'card') : menus.agent.filter(item => !['alerts', 'history', 'map'].includes(item.id));
  const heading = menu.find(item => item.id === section)?.label || 'Painel';
  return <div className={`ops-shell${area === 'admin' ? ' ops-admin-shell' : ''}`}>
    <aside className={mobileOpen ? 'ops-sidebar open' : 'ops-sidebar'}>
      <div className="ops-brand"><img src={`${import.meta.env.BASE_URL}IMG/logo-vagafacil.svg`} alt="VagaFácil"/><div><strong>VagaFácil</strong><small>{area === 'admin' ? 'Gestão municipal' : 'Fiscalização de trânsito'}</small></div><button onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={19}/></button></div>
      <div className="ops-profile"><span>{profile.full_name.slice(0,1).toUpperCase()}</span><div><strong>{profile.full_name}</strong><small>{roleText(profile.role)}</small></div></div>
      <nav>{menu.map(item => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => { setSection(item.id); setMobileOpen(false); }}><item.icon size={18}/>{item.label}{item.id === 'alerts' && openAlerts > 0 && <b>{openAlerts}</b>}</button>)}</nav>
      <button className="ops-signout" onClick={onSignOut}><LogOut size={18}/> Sair da conta</button>
      <div className="ops-sidebar-partner"><img src={"https://raw.githubusercontent.com/DevKove/VagaFacil/main/IMG/PMAS.png"} alt="Prefeitura Municipal de Pilar do Sul" loading="lazy"/></div>
    </aside>
    {mobileOpen && <button className="ops-scrim" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"/>}
    <main className="ops-main">
      <header className={`ops-topbar${area === 'agent' ? ' ops-agent-topbar' : ''}`}><button className="ops-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={21}/></button>{area === 'agent' ? <><div className="ops-agent-brand"><img src={`${import.meta.env.BASE_URL}IMG/logo-vagafacil.svg`} alt=""/><span><strong>VagaFácil</strong><small>Fiscalização de trânsito</small></span></div><div className="ops-agent-top-actions"><div className="ops-agent-identity"><span>{profile.full_name.slice(0,1).toUpperCase()}</span><div><strong>{profile.full_name}</strong><small>{roleText(profile.role)}</small></div></div><button onClick={() => void load()} aria-label="Atualizar dados" title="Atualizar dados"><RefreshCw size={17}/></button><button onClick={onSignOut} aria-label="Sair da conta" title="Sair da conta"><LogOut size={17}/></button></div></> : <><div><small>VAGAFÁCIL / ADMINISTRAÇÃO</small><strong>{heading}</strong></div><div className="ops-top-actions"><span><i/> Dados sincronizados</span><button onClick={() => void load()} aria-label="Atualizar dados"><RefreshCw size={17}/></button><button onClick={onSignOut} aria-label="Sair"><LogOut size={17}/></button></div></>}</header>
      <div className="ops-content">
        {area === 'admin' && <div className="ops-page-heading"><div><span className="ops-eyebrow">{area === 'admin' ? 'CENTRAL DE GESTÃO' : 'CENTRAL DE FISCALIZAÇÃO'}</span><h1>{section === 'overview' ? (area === 'admin' ? 'Visão geral da operação' : 'Painel operacional') : heading}</h1><p>{area === 'admin' ? 'Acompanhe indicadores e gerencie os recursos do estacionamento rotativo.' : 'Consulte a situação das vagas e atenda alertas de fiscalização.'}</p></div><div className="ops-page-actions">{section !== 'ads' && canExportReports && <><button type="button" className="ops-small-action ops-export-action" onClick={() => exportCurrent('pdf')} title="Gerar PDF"><FileText size={16}/> PDF</button><button type="button" className="ops-small-action ops-export-action" onClick={() => exportCurrent('excel')} title="Exportar para Excel"><Download size={16}/> Excel</button></>}<button type="button" className="ops-filter-trigger" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><Filter size={17}/> Filtros</button><button className="ops-primary" onClick={() => void load()}><RefreshCw size={16}/> Atualizar</button></div></div>}
        {filtersOpen && <section className="ops-section-filter-menu" aria-label="Filtros da seção atual"><div className="ops-section-filter-heading"><strong>Filtrar: {heading}</strong><button type="button" className="ops-filter-close" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros"><X size={17}/></button></div><div className="ops-section-filter-fields"><label>Pesquisar nesta seção<div className="ops-search-control"><input autoFocus value={sectionFilter} onChange={event => setSectionFilter(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') setFiltersOpen(false); }} placeholder="Digite nome, placa, descrição ou palavra-chave"/><button type="button" aria-label="Pesquisar" title="Pesquisar" onClick={() => setFiltersOpen(false)}><Search size={17}/></button></div></label>{section === 'sessions' || section === 'alerts' || section === 'history' || section === 'users' || section === 'zones' || section === 'rules' ? <label>Situação<select value={sectionStatus} onChange={event => setSectionStatus(event.target.value)}><option value="all">Todas</option>{(section === 'sessions' ? [['active','Em andamento'],['expired','Vencidos'],['finished','Encerrados']] : section === 'alerts' ? [['open','Abertos'],['claimed','Em atendimento'],['resolved','Resolvidos']] : section === 'users' || section === 'zones' || section === 'rules' ? [['active','Ativos'],['inactive','Inativos']] : [['open','Abertos'],['closed','Encerrados']]).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}</div><div className="ops-section-filter-footer"><span>Os filtros são aplicados somente à seção aberta.</span><button type="button" className="ops-small-action" onClick={() => { setSectionFilter(''); setSectionStatus('all'); }}>Limpar filtros</button></div></section>}
        {error && <div className="ops-error" role="alert"><AlertTriangle size={17}/>{error}</div>}
        {section === 'manual' ? <section className="ops-manual">
          <div className="ops-manual-hero"><div className="ops-manual-hero-icon"><BookOpen size={27}/></div><div><span className="ops-eyebrow">CENTRAL DE AJUDA · PERFIL AGENTE</span><h2>Manual do agente</h2><p>Encontre orientações rápidas para utilizar as ferramentas de fiscalização e consulta em campo.</p></div></div>
          <label className="ops-manual-search"><Search size={19}/><input value={manualSearch} onChange={event => { setManualSearch(event.target.value); setManualExpanded(''); }} placeholder="Buscar por assunto, função ou palavra-chave..." aria-label="Buscar no manual"/><span>{filteredManualTopics.length} tópicos</span></label>
          <div className="ops-manual-layout"><nav className="ops-manual-index" aria-label="Tópicos do manual"><strong>Conteúdo do manual</strong>{filteredManualTopics.map(topic => <button key={topic.id} type="button" className={manualExpanded === topic.id ? 'active' : ''} onClick={() => { setManualExpanded(topic.id); document.getElementById(`ops-manual-${topic.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}>{topic.title}</button>)}</nav>
            <div className="ops-manual-topics">{filteredManualTopics.map((topic,index) => <article id={`ops-manual-${topic.id}`} key={topic.id} className={`ops-manual-topic ${manualExpanded === topic.id ? 'expanded' : ''}`}><button type="button" className="ops-manual-topic-toggle" aria-expanded={manualExpanded === topic.id} onClick={() => setManualExpanded(value => value === topic.id ? '' : topic.id)}><span className="ops-manual-topic-number">{String(index+1).padStart(2,'0')}</span><span><strong>{topic.title}</strong><small>{topic.summary}</small></span><ChevronDown size={19}/></button>{manualExpanded === topic.id && <div className="ops-manual-topic-content"><ol>{topic.steps.map(step => <li key={step}>{step}</li>)}</ol><div className="ops-manual-tip"><ShieldCheck size={17}/><span><strong>Dica</strong>{topic.tip}</span></div>{topic.target && <button type="button" className="ops-primary ops-manual-open" onClick={() => setSection(topic.target!)}>Abrir esta funcionalidade <span aria-hidden="true">→</span></button>}</div>}</article>)}{filteredManualTopics.length === 0 && <div className="ops-manual-empty"><Search size={23}/><strong>Nenhum tópico encontrado</strong><span>Tente buscar por outra palavra, como “alerta”, “GPS” ou “placa”.</span></div>}</div>
          </div><p className="ops-manual-footnote">Este conteúdo apresenta as funções disponíveis atualmente para o perfil de agente. As permissões da sua conta continuam sendo respeitadas pelo sistema.</p>
        </section> : loading ? <div className="ops-loading">Carregando dados do Supabase...</div> : <>
          {section === 'overview' && (area === 'agent' ? <section className="ops-agent-dashboard">
             <div className="ops-agent-welcome">
               <div><span className="ops-agent-kicker">CENTRAL DO AGENTE</span><h2>Olá, {profile.full_name?.trim() || 'Agente'}.</h2><p>Acompanhe sua área de atuação, priorize os alertas e registre as fiscalizações em campo.</p></div>
               <div className="ops-agent-status"><i/> Operação conectada</div>
             </div>
             <div className="ops-agent-dashboard-actions">
               <button type="button" className="ops-filter-trigger" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><Filter size={17}/> Filtrar</button>
               <button type="button" className="ops-primary" onClick={() => void load()}><RefreshCw size={16}/> Atualizar</button>
             </div>
             <div className="ops-agent-metrics">
               <button type="button" onClick={() => setSection('alerts')}><span className="ops-agent-metric-icon urgent"><AlertTriangle size={19}/></span><span>Alertas disponíveis</span><strong>{alerts.filter(item => item.status === 'open').length}</strong><small>Aguardando atendimento</small></button>
               <button type="button" onClick={() => setSection('alerts')}><span className="ops-agent-metric-icon assigned"><Activity size={19}/></span><span>Em meu atendimento</span><strong>{alerts.filter(item => item.status === 'claimed' && item.claimed_by === profile.id).length}</strong><small>Alertas assumidos por você</small></button>
               <button type="button" onClick={() => setSection('history')}><span className="ops-agent-metric-icon completed"><ShieldCheck size={19}/></span><span>Fiscalizações hoje</span><strong>{history.filter(item => new Date(item.created_at).toDateString() === new Date().toDateString()).length}</strong><small>Registros realizados hoje</small></button>
               <button type="button" onClick={() => setSection('sessions')}><span className="ops-agent-metric-icon expired"><Clock3 size={19}/></span><span>Estacionamentos vencidos</span><strong>{expiredSessions.length}</strong><small>Exigem verificação</small></button>
             </div>
             <section className="ops-panel ops-agent-sessions">
               <div className="ops-panel-heading"><div><h2>Sessões em andamento</h2><p>Veículos atualmente registrados no estacionamento rotativo</p></div><button type="button" onClick={() => setSection('sessions')}>Ver todas</button></div>
               {monitoredSessions.filter(item => item.status === 'active' && new Date(item.expires_at).getTime() > Date.now()).slice(0,8).map(item => <div className="ops-row" key={item.source+'-'+item.id}><CarFront size={18}/><div><VehiclePlate value={item.plate_snapshot} compact/><small>{item.source === 'physical_card' ? 'Cartão físico' : 'Aplicativo'} · Início {dateTime(item.started_at)} · Vencimento {timeOnly(item.expires_at)}</small></div><span className="ops-pill success">Em andamento</span></div>)}
               {monitoredSessions.filter(item => item.status === 'active' && new Date(item.expires_at).getTime() > Date.now()).length === 0 && <div className="ops-agent-empty"><CarFront size={24}/><strong>Nenhuma sessão em andamento</strong><span>Quando houver veículos registrados e dentro do prazo, eles aparecerão aqui.</span></div>}
             </section>
             <section className="ops-agent-quick-actions"><div><strong>Acesso rápido</strong><span>Ferramentas essenciais para o trabalho em campo</span></div><button type="button" onClick={() => setSection('alerts')}><AlertTriangle size={17}/> Atender alertas</button><button type="button" onClick={() => setSection('sessions')}><CarFront size={17}/> Consultar estacionamentos</button><button type="button" onClick={() => setSection('map')}><MapPinned size={17}/> Abrir mapa operacional</button></section>
           </section> : <section className="ops-admin-dashboard">
             <div className="ops-admin-global-search">
               <label htmlFor="ops-global-search"><Search size={19}/> Pesquisa geral do sistema</label>
               <div className="ops-search-control"><input id="ops-global-search" value={globalSearch} onChange={event=>setGlobalSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}} placeholder="Pesquisar placas, usuários, zonas, vagas, alertas e registros..."/><button type="button" aria-label="Pesquisar em todo o sistema" title="Pesquisar em todo o sistema"><Search size={18}/></button></div>
               {globalSearchTerm && <div className="ops-admin-global-results"><div className="ops-panel-heading"><div><h2>Resultados da pesquisa</h2><p>{globalSearchResults.length} resultado(s) encontrados nas informações carregadas.</p></div><button type="button" className="ops-small-action" onClick={()=>setGlobalSearch('')}>Limpar</button></div>
                 {globalSearchResults.map(result=><button type="button" className="ops-admin-global-result" key={result.id} onClick={()=>{setSection(result.section);setSectionFilter(globalSearch);setSearch(globalSearch);setGlobalSearch('');}}><span><strong>{result.title}</strong><small>{result.detail}</small></span><span>{({sessions:'Estacionamentos',users:'Usuários e agentes',zones:'Zonas e vagas',alerts:'Alertas',rules:'Regras',audit:'Auditoria'} as Record<string,string>)[result.section]} <span aria-hidden="true">→</span></span></button>)}
                 {globalSearchResults.length===0&&<div className="ops-empty">Nenhum registro encontrado para essa pesquisa.</div>}
               </div>}
             </div>
             <div className="ops-metrics"><article><span>Sessões em andamento</span><strong>{activeSessions.length}</strong><small>Registros ativos</small></article><article><span>Prazo encerrado</span><strong>{expiredSessions.length}</strong><small>Precisam de atenção</small></article><article><span>Alertas abertos</span><strong>{openAlerts}</strong><small>Na fila de atendimento</small></article><article><span>Usuários cadastrados</span><strong>{users.length}</strong><small>Todos os perfis</small></article></div>
             <div className="ops-panel">
               <div className="ops-panel-heading"><div><span className="ops-eyebrow">CENTRAL DE GESTÃO</span><h2>Estacionamentos monitorados</h2><p>Acompanhe indicadores e gerencie os recursos do estacionamento rotativo.</p></div><div className="ops-page-actions"><button type="button" className="ops-filter-trigger" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(value=>!value)}><Filter size={17}/> Filtros</button><button type="button" className="ops-primary" onClick={()=>void load()}><RefreshCw size={16}/> Atualizar</button></div></div>
               <div className="ops-table-wrap ops-sessions-table-wrap"><table><thead><tr><th>PLACA</th><th>ORIGEM</th><th>LOCALIZAÇÃO</th><th>DATA</th><th>CHEGADA</th><th>VENCIMENTO</th><th>SITUAÇÃO</th></tr></thead><tbody>{filteredMonitoredSessions.slice(0,12).map(item=><tr key={item.source+'-'+item.id}><td><VehiclePlate value={item.plate_snapshot} compact/></td><td><span className={'ops-pill '+(item.source==='physical_card'?'info':'success')}>{item.source==='physical_card'?'Cartão físico':'Aplicativo'}</span>{item.source==='physical_card'&&<small className="ops-report-cell-sub">{item.created_by_name}</small>}</td><td>{item.latitude!=null&&item.longitude!=null?<a className="ops-location-link" href={'https://www.openstreetmap.org/?mlat='+item.latitude+'&mlon='+item.longitude+'#map=18/'+item.latitude+'/'+item.longitude} target="_blank" rel="noreferrer"><MapPin size={14}/> Ver mapa</a>:item.parking_spaces?.parking_zones?.name||'Não informada'}</td><td>{dateOnly(item.started_at)}</td><td>{timeOnly(item.started_at)}</td><td>{timeOnly(item.expires_at)}</td><td><span className={'ops-pill '+(item.status==='finished'?'info':item.status==='expired'?'danger':'success')}>{statusText(item.status)}</span></td></tr>)}{filteredMonitoredSessions.length===0&&<tr><td colSpan={7} className="ops-empty">Nenhum estacionamento monitorado.</td></tr>}</tbody></table></div>
               <div className="ops-panel-footer"><button type="button" className="ops-small-action" onClick={()=>setSection('sessions')}>Ver todos os estacionamentos <span aria-hidden="true">→</span></button></div>
             </div>
           </section>)}
           {section === 'map' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Mapa de vagas e pontos cadastrados</h2><p>Posições geográficas registradas no cadastro municipal.</p></div><span className="ops-pill info">{mappedSpaces.length} coordenadas</span></div>{mapBounds && mapCenter ? <><iframe title="Mapa de vagas VagaFácil" className="ops-map-frame" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapBounds.minLon}%2C${mapBounds.minLat}%2C${mapBounds.maxLon}%2C${mapBounds.maxLat}&layer=mapnik&marker=${mapCenter.lat}%2C${mapCenter.lon}`} /><p className="ops-hint">O marcador indica o centro aproximado das vagas cadastradas. Abra cada coordenada na lista para visualizar o ponto exato.</p><div className="ops-map-list">{mappedSpaces.map(space=><a key={space.id} href={`https://www.openstreetmap.org/?mlat=${space.latitude}&mlon=${space.longitude}#map=19/${space.latitude}/${space.longitude}`} target="_blank" rel="noreferrer"><MapPin size={16}/><span><strong>{space.code}</strong><small>{space.active?'Vaga ativa':'Vaga inativa'} · {Number(space.latitude).toFixed(6)}, {Number(space.longitude).toFixed(6)}</small></span></a>)}</div></> : <div className="ops-empty">Ainda não existem vagas com latitude e longitude cadastradas. Cadastre as coordenadas para habilitar o mapa.</div>}</div>}
          {section === 'sessions' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Estacionamentos monitorados</h2><p>{filteredMonitoredSessions.length} registros encontrados</p></div><label className="ops-search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} placeholder="Buscar placa, zona ou vaga"/><button type="button" aria-label="Pesquisar" title="Pesquisar" onClick={() => setSearch(value => value.trim())}><Search size={16}/></button></label></div><div className="ops-table-wrap ops-sessions-table-wrap"><table><thead><tr><th>PLACA</th><th>ORIGEM</th><th>LOCALIZAÇÃO</th><th>DATA</th><th>CHEGADA</th><th>VENCIMENTO</th><th>ENCERRAMENTO</th><th>SITUAÇÃO</th>{(area === 'admin' || area === 'agent') && <th>AÇÃO</th>}</tr></thead><tbody>{filteredMonitoredSessions.map(s => { const isCard=s.source==='physical_card'; const expired=s.status==='expired'||(s.status==='active'&&new Date(s.expires_at).getTime()<=Date.now()); const originalSession=isCard?null:sessions.find(item=>item.id===s.id); return <tr key={s.source+'-'+s.id}><td><VehiclePlate value={s.plate_snapshot} compact /></td><td><span className={'ops-pill '+(isCard?'info':'success')}>{isCard?'Cartão físico':'Aplicativo'}</span>{isCard&&<small className="ops-report-cell-sub">{s.source==='physical_card'?s.created_by_name:'—'}</small>}</td><td>{s.latitude!=null&&s.longitude!=null?<a className="ops-location-link" href={'https://www.openstreetmap.org/?mlat='+s.latitude+'&mlon='+s.longitude+'#map=18/'+s.latitude+'/'+s.longitude} target="_blank" rel="noreferrer" title="Abrir localização no mapa"><MapPin size={15}/><span><strong>{Number(s.latitude).toFixed(6)}, {Number(s.longitude).toFixed(6)}</strong><small>{s.location_accuracy_m!=null?'Precisão ±'+Math.round(s.location_accuracy_m)+' m':'Precisão não informada'}{s.location_captured_at?' · '+dateTime(s.location_captured_at):''}</small></span></a>:<span className="ops-muted-location">{isCard?[s.parking_spaces?.parking_zones?.name,s.parking_spaces?.code].filter(Boolean).join(' · ')||'Local não informado':'Geolocalização não disponível no registro'}</span>}</td><td>{dateOnly(s.started_at)}</td><td>{timeOnly(s.started_at)}</td><td><strong className="ops-expiry-time">{timeOnly(s.expires_at)}</strong></td><td>{s.ended_at?timeOnly(s.ended_at):'—'}</td><td><span className={'ops-pill '+(expired?'danger':'success')}>{expired?'Período excedido · em aberto':statusText(s.status)}</span></td>{(area==='admin'||area==='agent')&&<td>{isCard?(()=>{const card=physicalCardSessions.find(item=>item.id===s.id);const canManage=!!card&&(profile.role==='admin'||card.created_by===profile.id)&&card.status!=='finished';return card&&canManage?<div className="ops-user-actions"><button type="button" className="ops-small-action" onClick={()=>{openEditPhysicalCard(card);setSection('card');}} disabled={busy}><Pencil size={14}/> Editar</button><button type="button" className="ops-small-action danger" onClick={()=>finishPhysicalCardSession(card)} disabled={busy}>Encerrar</button></div>:<span className="ops-muted-location">{card?.status==='finished'?'Encerrado':'Sem permissão'}</span>;})():area==='admin'&&originalSession?.status==='active'?<div className="ops-user-actions"><button className="ops-primary" onClick={()=>sendManualAlert(originalSession)} disabled={busy}><Bell size={15}/> Emitir alerta</button><button className="ops-small-action danger" onClick={()=>finishSession(originalSession)} disabled={busy}>Encerrar</button></div>:<span className="ops-muted-location">{originalSession?.status==='finished'?'Encerrado':'—'}</span>}</td>}</tr>; })}{filteredMonitoredSessions.length===0&&<tr><td colSpan={(area==='admin'||area==='agent')?9:8} className="ops-empty">Nenhum estacionamento encontrado.</td></tr>}</tbody></table></div></div>}{section === 'card' && <div className="ops-card-layout">
            <section className="ops-panel ops-card-form-panel">
              <div className="ops-panel-heading"><div><h2>{editingCard?'Editar registro de cartão':'Novo registro com cartão físico'}</h2><p>{editingCard?'Atualize os dados do lançamento. A localização e o responsável originais serão mantidos.':'Informe os dados do veículo, o início real e capture a localização do dispositivo ao salvar.'}</p></div><span className="ops-card-heading-icon"><CreditCard size={22}/></span></div>
              <form className="ops-form" onSubmit={editingCard?saveEditedPhysicalCard:savePhysicalCardSession}>
                <label>Placa do veículo<input value={cardForm.plate} onChange={e=>setCardForm(v=>({...v,plate:e.target.value.toUpperCase()}))} placeholder="ABC1D23" maxLength={7} autoComplete="off" required/></label>
                <div className="ops-form-grid">
                  <label>Categoria<select value={cardForm.category} onChange={e=>setCardForm(v=>({...v,category:e.target.value,space_id:''}))}><option value="conventional">Convencional</option><option value="elderly">Idoso</option><option value="accessible">Pessoa com deficiência</option></select></label>
                  <label>Zona<select value={cardForm.zone_id} onChange={e=>setCardForm(v=>({...v,zone_id:e.target.value,space_id:''}))}><option value="">Não informada</option>{zones.map(zone=><option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
                </div>
                <label>Vaga (opcional)<select value={cardForm.space_id} onChange={e=>setCardForm(v=>({...v,space_id:e.target.value}))}><option value="">Sem vaga específica</option>{spaces.filter(space=>space.active && (!cardForm.zone_id || space.zone_id===cardForm.zone_id)).map(space=><option key={space.id} value={space.id}>{space.code}</option>)}</select></label>
                <div className="ops-form-grid ops-card-start-fields"><label>Data de início<input type="date" value={cardForm.started_date} max={localDateTimeParts().date} onChange={e=>setCardForm(v=>({...v,started_date:e.target.value}))} required/></label><label>Horário de início<input type="time" value={cardForm.started_time} max={cardForm.started_date===localDateTimeParts().date?localDateTimeParts().time:undefined} onChange={e=>setCardForm(v=>({...v,started_time:e.target.value}))} required/></label></div><small className="ops-card-start-help">Informe separadamente a data e o horário em que o cartão físico começou a ser utilizado. O lançamento pode ser feito posteriormente.</small>
                <label>Observações (opcional)<textarea rows={3} maxLength={500} value={cardForm.notes} onChange={e=>setCardForm(v=>({...v,notes:e.target.value}))} placeholder="Informações complementares do atendimento"/></label>
                {!editingCard&&<div className="ops-card-notice"><MapPin size={17}/><span>A localização GPS do agente ou administrador será capturada no momento do registro. Autorize o acesso à localização no navegador para concluir.</span></div>}{editingCard&&<div className="ops-card-notice"><MapPin size={17}/><span>A localização original e a identificação de quem lançou o cartão serão preservadas.</span></div>}<div className="ops-card-notice"><Clock3 size={17}/><span>O vencimento será calculado automaticamente a partir do horário de início informado, conforme a duração configurada para a categoria.</span></div>
                <div className="ops-user-actions"><button className="ops-primary" disabled={busy}><CreditCard size={16}/> {editingCard?'Salvar alterações':'Registrar cartão físico'}</button>{editingCard&&<button type="button" className="ops-small-action" onClick={()=>{setEditingCard(null);setCardForm({plate:'',category:'conventional',zone_id:'',space_id:'',started_date:localDateTimeParts().date,started_time:localDateTimeParts().time,notes:''});}} disabled={busy}>Cancelar edição</button>}</div>
              </form>
            </section>
            <section className="ops-panel">
              <div className="ops-panel-heading"><div><h2>Registros de cartão físico</h2><p>{physicalCardSessions.length} registro(s) recentes · lançamentos feitos por agentes e administradores</p></div><span className="ops-pill info">{physicalCardSessions.filter(item=>item.status!=='finished'&&item.expires_at>new Date().toISOString()).length} em andamento</span></div>
              <div className="ops-table-wrap"><table><thead><tr><th>PLACA</th><th>INÍCIO</th><th>VENCIMENTO</th><th>ENCERRAMENTO</th><th>ZONA / VAGA</th><th>LOCALIZAÇÃO DO LANÇAMENTO</th><th>LANÇADO POR</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead><tbody>{physicalCardSessions.map(item=>{const expired=new Date(item.expires_at).getTime()<=Date.now();const zone=zones.find(value=>value.id===item.zone_id);const space=spaces.find(value=>value.id===item.space_id);return <tr key={item.id}><td><VehiclePlate value={item.plate_snapshot} compact/></td><td>{dateTime(item.started_at)}</td><td><strong className="ops-expiry-time">{dateTime(item.expires_at)}</strong></td><td>{item.ended_at?dateTime(item.ended_at):'—'}</td><td>{zone?.name||'—'}<small className="ops-report-cell-sub">{space?.code||'Sem vaga vinculada'}</small></td><td><a className="ops-location-link" href={'https://www.openstreetmap.org/?mlat='+item.latitude+'&mlon='+item.longitude+'#map=18/'+item.latitude+'/'+item.longitude} target="_blank" rel="noreferrer"><MapPin size={14}/><span><strong>{Number(item.latitude).toFixed(6)}, {Number(item.longitude).toFixed(6)}</strong><small>{item.location_accuracy_m!=null?'Precisão ±'+Math.round(item.location_accuracy_m)+' m':'Precisão não informada'}</small></span></a></td><td>{item.created_by_name || (item.created_by===profile.id?profile.full_name:'Usuário não identificado')}</td><td><span className={`ops-pill ${item.status==='finished'?'info':expired?'danger':'success'}`}>{item.status==='finished'?'Encerrado':expired?'Vencido':'Em andamento'}</span></td><td><div className="ops-user-actions">{(profile.role==='admin'||item.created_by===profile.id)&&item.status!=='finished'?<><button type="button" className="ops-small-action" onClick={()=>openEditPhysicalCard(item)} disabled={busy}><Pencil size={14}/> Editar</button><button type="button" className="ops-small-action danger" onClick={()=>finishPhysicalCardSession(item)} disabled={busy}>Encerrar</button></>:<span className="ops-muted-location">—</span>}</div></td></tr>})}{physicalCardSessions.length===0&&<tr><td colSpan={9} className="ops-empty">Nenhum registro com cartão físico até o momento.</td></tr>}</tbody></table></div>
            </section>
          </div>}
          {section === 'alerts' && area === 'agent' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Fila de fiscalização</h2><p>Assuma um alerta e registre a verificação em campo.</p></div></div>{filteredAlerts.map(a=><article className="ops-alert" key={a.id}><div className="ops-alert-icon"><AlertTriangle size={20}/></div><div className="ops-alert-body">{a.parking_sessions?.plate_snapshot ? <VehiclePlate value={a.parking_sessions.plate_snapshot} compact /> : <strong>Veículo não identificado</strong>}<small>{a.severity === 'expired' ? 'Tempo de estacionamento encerrado' : a.severity === 'attention' ? 'Próximo do limite' : 'Solicitação de fiscalização'} · {dateTime(a.created_at)}</small><span className={`ops-pill ${a.status === 'open' ? 'warning' : 'info'}`}>{statusText(a.status)}</span></div><div className="ops-alert-actions">{a.status === 'open' && <button onClick={() => claimAlert(a)} disabled={busy}>Assumir</button>}<button className="ops-primary" onClick={() => setEnforcement(a)}>Registrar fiscalização</button></div></article>)}{filteredAlerts.length === 0 && <div className="ops-empty">Nenhum alerta pendente.</div>}</div>}
          {section === 'history' && area === 'agent' && <div className="ops-panel"><div className="ops-panel-heading"><div><h2>Atendimentos recentes</h2><p>Histórico de fiscalizações registradas pelo sistema.</p></div></div>{filteredHistory.map(item=><article className="ops-rule" key={item.id}><div><div className="ops-history-title">{item.alerts?.parking_sessions?.plate_snapshot ? <VehiclePlate value={item.alerts.parking_sessions.plate_snapshot} compact /> : <strong>Veículo sem placa</strong>}<strong>{item.result === 'irregular' ? 'Irregularidade constatada' : 'Situação regular'}</strong></div><small>{dateTime(item.created_at)} · {statusText(item.status)}</small><small>{item.notes || 'Sem observações registradas.'}</small>{(historyPhotoUrls[item.id] || []).map((url,index)=><a className="ops-photo-link" key={url} href={url} target="_blank" rel="noreferrer">Ver evidência {index+1}</a>)}</div></article>)}{filteredHistory.length===0&&<div className="ops-empty">Você ainda não registrou fiscalizações.</div>}</div>}
          {section === 'zones' && area === 'admin' && <div className="ops-two-col"><div className="ops-panel"><div className="ops-panel-heading"><div><h2>Zonas de estacionamento</h2><p>Cadastre e mantenha as áreas regulamentadas.</p></div></div><form className="ops-form" onSubmit={addZone}><label>Nome da zona<input required maxLength={80} value={zoneForm.name} onChange={e=>setZoneForm(v=>({...v,name:e.target.value}))} placeholder="Ex.: Centro"/></label><label>Descrição<input maxLength={200} value={zoneForm.description} onChange={e=>setZoneForm(v=>({...v,description:e.target.value}))} placeholder="Referência ou limites"/></label><button className="ops-primary" disabled={busy}><Plus size={16}/> Adicionar zona</button></form>{filteredZones.map(z=><div className="ops-row" key={z.id}><MapPin size={18}/><div><strong>{z.name}</strong><small>{z.description || 'Sem descrição'} · {z.active ? 'Ativa' : 'Inativa'}</small></div></div>)}</div><div className="ops-panel"><div className="ops-panel-heading"><div><h2>Cadastro de vagas</h2><p>Vincule cada vaga a uma zona.</p></div></div><form className="ops-form" onSubmit={addSpace}><label>Código da vaga<input required maxLength={24} value={spaceForm.code} onChange={e=>setSpaceForm(v=>({...v,code:e.target.value}))} placeholder="C-001"/></label><label>Zona<select value={spaceForm.zone_id} onChange={e=>setSpaceForm(v=>({...v,zone_id:e.target.value}))}><option value="">Sem zona</option>{zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select></label><label>Categoria<select value={spaceForm.category} onChange={e=>setSpaceForm(v=>({...v,category:e.target.value}))}><option value="conventional">Convencional</option><option value="elderly">Idoso</option><option value="accessible">Pessoa com deficiência</option></select></label><div className="ops-form-grid"><label>Latitude<input type="number" step="any" min="-90" max="90" value={spaceForm.latitude} onChange={e=>setSpaceForm(v=>({...v,latitude:e.target.value}))} placeholder="-23.000000"/></label><label>Longitude<input type="number" step="any" min="-180" max="180" value={spaceForm.longitude} onChange={e=>setSpaceForm(v=>({...v,longitude:e.target.value}))} placeholder="-47.000000"/></label></div><button className="ops-primary" disabled={busy}><Plus size={16}/> Cadastrar vaga</button></form>{filteredSpaces.map(s=><div className="ops-row" key={s.id}><MapPin size={18}/><div><strong>{s.code}</strong><small>{s.category === 'elderly' ? 'Idoso' : s.category === 'accessible' ? 'Pessoa com deficiência' : 'Convencional'} · {s.active ? 'Ativa' : 'Inativa'}</small></div><button className="ops-small-action" onClick={()=>void run(async()=>{const {error}=await supabase!.from('parking_spaces').update({active:!s.active}).eq('id',s.id);if(error)throw error;})}>{s.active?'Desativar':'Ativar'}</button></div>)}</div></div>}
          {section === 'users' && area === 'admin' && <div className="ops-users-lists">
            <div className="ops-panel">
              <div className="ops-panel-heading">
                <div><h2>Gestão de cadastros</h2><p>Escolha qual lista deseja consultar e administrar.</p></div>
                <div className="ops-user-heading-actions"><span className="ops-pill info">{userList === 'operational' ? filteredOperationalUsers.length : filteredCitizenUsers.length} cadastros</span><button type="button" className="ops-primary" onClick={()=>{openCreateUser();setUserForm({full_name:'',email:'',password:'',role:userList==='citizens'?'citizen':'agent',is_active:true});}}><Plus size={16}/> Novo {userList === 'citizens' ? 'cidadão' : 'cadastro'}</button></div>
              </div>
              <div className="ops-user-list-switch" role="tablist" aria-label="Selecionar lista de usuários">
                <button type="button" role="tab" aria-selected={userList === 'operational'} className={userList === 'operational' ? 'active' : ''} onClick={()=>setUserList('operational')}>Usuários e agentes <span>{filteredOperationalUsers.length}</span></button>
                <button type="button" role="tab" aria-selected={userList === 'citizens'} className={userList === 'citizens' ? 'active' : ''} onClick={()=>setUserList('citizens')}>Cidadãos <span>{filteredCitizenUsers.length}</span></button>
              </div>
              <div className="ops-table-wrap ops-users-table-wrap"><table><thead><tr><th>USUÁRIO</th><th>E-MAIL</th><th>PERFIL</th><th>ACESSO</th><th>AÇÕES</th></tr></thead><tbody>
                {(userList === 'operational' ? filteredOperationalUsers : filteredCitizenUsers).map(u=><tr key={u.id}><td><strong>{u.full_name}</strong></td><td>{u.email || '—'}</td><td>{roleText(u.role)}</td><td><span className={`ops-pill ${u.is_active?'success':'danger'}`}>{u.is_active?'Ativo':'Suspenso'}</span></td><td><div className="ops-user-actions"><button type="button" className="ops-small-action" onClick={()=>openEditUser(u)}>Editar</button><button type="button" className="ops-small-action danger" onClick={()=>deleteUser(u)} disabled={u.id===profile.id}>Excluir</button></div></td></tr>)}
                {(userList === 'operational' ? filteredOperationalUsers : filteredCitizenUsers).length===0&&<tr><td colSpan={5} className="ops-empty">{userList === 'citizens' ? 'Nenhum cidadão corresponde aos filtros.' : 'Nenhum administrador, supervisor ou agente corresponde aos filtros.'}</td></tr>}
              </tbody></table></div>
            </div>
          </div>}
          {section === 'rules' && area === 'admin' && <div className="ops-panel ops-rules-page">
            <div className="ops-panel-heading ops-rules-heading">
              <div><span className="ops-rules-eyebrow">CONFIGURAÇÃO OPERACIONAL</span><h2>Regras de estacionamento</h2><p>Gerencie os horários de funcionamento, a duração das permanências e os parâmetros aplicados ao estacionamento rotativo.</p></div>
              <span className="ops-rules-heading-icon"><ShieldCheck size={25}/></span>
            </div>
            <section className="ops-rules-section">
              <div className="ops-rules-section-title"><div><span className="ops-rules-kicker">01 · PARÂMETROS GERAIS</span><h3>Regras vigentes</h3><p>Configurações que orientam o funcionamento das vagas.</p></div></div>
              {filteredRules.map(rule=><article className="ops-rule ops-rule-modern" key={rule.id}>
                <div className="ops-rule-top"><div><span className="ops-rule-label">REGRA OPERACIONAL</span><h3>{rule.name}</h3></div><span className={`ops-rule-status ${rule.enabled?'is-enabled':'is-disabled'}`}><i/>{rule.enabled?'Habilitada':'Desabilitada'}</span></div>
                <div className="ops-rule-schedule"><div className="ops-rule-schedule-icon"><Clock3 size={20}/></div><div><strong>Horários de funcionamento</strong><span>Segunda a sexta-feira <b>{rule.start_time.slice(0,5)} às {rule.end_time.slice(0,5)}</b></span><span>Sábados <b>{rule.saturday_start?.slice(0,5) || '—'} às {rule.saturday_end?.slice(0,5) || '—'}</b></span></div></div>
                <div className="ops-rule-metrics"><div><span>Vaga convencional</span><strong>{rule.conventional_minutes}<small>min</small></strong><em>Tempo máximo</em></div><div><span>Vaga especial</span><strong>{rule.special_minutes}<small>min</small></strong><em>Tempo máximo</em></div><div><span>Tolerância</span><strong>{rule.grace_minutes}<small>min</small></strong><em>Período adicional</em></div></div>
                <div className="ops-rule-actions"><span>Os parâmetros podem ser ajustados conforme a regulamentação municipal.</span><button type="button" onClick={()=>setEditingRule(rule)}>Editar parâmetros <span>→</span></button></div>
              </article>)}
              {rules.length===0&&<div className="ops-empty">Nenhuma regra cadastrada.</div>}
            </section>
            <section className="ops-holidays-card"><div className="ops-holidays-icon"><Clock3 size={22}/></div><div className="ops-holidays-content"><span className="ops-rules-kicker">02 · CALENDÁRIO MUNICIPAL</span><h3>Feriados e datas especiais</h3><p>Os registros de feriados são armazenados na base de dados do VagaFácil. A gestão do calendário — incluindo cadastro, edição e aplicação de exceções ao estacionamento rotativo — será liberada após a validação das regras municipais aplicáveis.</p><div className="ops-holidays-note"><ShieldCheck size={15}/> A aplicação de regras especiais depende de validação normativa.</div></div><span className="ops-holidays-status">Disponibilização futura</span></section>
          </div>}
          {section === 'audit' && area === 'admin' && <div className="ops-audit-page">
            <section className="ops-audit-intro">
              <div><span className="ops-audit-kicker">CONTROLE E TRANSPARÊNCIA</span><h2>Auditoria do sistema</h2><p>Consulte as atividades registradas no VagaFácil, identifique quem realizou cada ação e veja quando ela aconteceu.</p></div>
              <div className="ops-audit-intro-icon"><ShieldCheck size={28}/></div>
            </section>
            <section className="ops-audit-summary" aria-label="Resumo da auditoria">
              <article><span>Eventos recentes</span><strong>{auditLogs.length}</strong><small>Últimos registros carregados</small></article>
              <article><span>Eventos de hoje</span><strong>{auditTodayCount}</strong><small>Atividades desde 00h</small></article>
              <article><span>Responsáveis</span><strong>{auditActorCount}</strong><small>Contas distintas nos registros</small></article>
            </section>
            <section className="ops-panel ops-audit-list">
              <div className="ops-panel-heading"><div><h3>Registro de atividades</h3><p>Mais recentes primeiro. Use o botão “Filtros” acima para pesquisar por responsável, ação ou registro.</p></div><span className="ops-pill info">{filteredAuditLogs.length} de {auditLogs.length} exibidos</span></div>
              <div className="ops-audit-legend"><span><i className="ops-audit-dot"/> Ação registrada</span><span>Os eventos são gravados automaticamente para consulta administrativa.</span></div>
              <div className="ops-table-wrap"><table className="ops-audit-table"><thead><tr><th>QUANDO</th><th>QUEM REALIZOU</th><th>O QUE ACONTECEU</th><th>ITEM RELACIONADO</th></tr></thead><tbody>
                {filteredAuditLogs.map(log => { const actor = users.find(user => user.id === log.actor_id); return <tr key={log.id}><td><strong>{dateOnly(log.created_at)}</strong><small>{timeOnly(log.created_at)}</small></td><td><strong>{actor?.full_name || (log.actor_id ? 'Usuário não identificado' : 'Sistema')}</strong><small>{actor?.email || (log.actor_id ? 'Conta sem identificação disponível' : 'Ação automática')}</small></td><td><span className="ops-audit-action">{auditActionText(log.action)}</span><small className="ops-audit-technical">Tipo: {log.action}</small></td><td><strong>{auditEntityText(log.entity_type)}</strong><small>{log.entity_id ? 'Identificador: '+log.entity_id.slice(0,8)+'…' : 'Sem identificador associado'}</small></td></tr>; })}
                {filteredAuditLogs.length===0&&<tr><td colSpan={4} className="ops-empty">{auditLogs.length===0?'Ainda não há atividades registradas.':'Nenhum evento corresponde à pesquisa. Limpe os filtros e tente novamente.'}</td></tr>}
              </tbody></table></div>
              <p className="ops-audit-footnote">Por segurança, esta tela é somente para consulta. Os registros não podem ser alterados por aqui.</p>
            </section>
          </div>}
          {section === 'ads' && area === 'admin' && profile.role === 'admin' && <AdsManager />}
          {section === 'reports' && area === 'admin' && <div className="ops-report-layout"><section className="ops-panel ops-report-filters"><div className="ops-panel-heading"><div><h2>Filtros do relatório</h2><p>Defina o período e os critérios para consultar os estacionamentos.</p></div><button type="button" className="ops-small-action" onClick={() => setReportFilters({ startDate: '', endDate: '', status: 'all', zone: '', plate: '' })}>Limpar filtros</button></div><div className="ops-report-filter-grid"><label>Data inicial<input type="date" value={reportFilters.startDate} max={reportFilters.endDate || undefined} onChange={e => setReportFilters(v => ({ ...v, startDate: e.target.value }))}/></label><label>Data final<input type="date" value={reportFilters.endDate} min={reportFilters.startDate || undefined} onChange={e => setReportFilters(v => ({ ...v, endDate: e.target.value }))}/></label><label>Situação<select value={reportFilters.status} onChange={e => setReportFilters(v => ({ ...v, status: e.target.value }))}><option value="all">Todas as situações</option><option value="active">Em andamento</option><option value="expired">Vencidos</option><option value="finished">Encerrados</option></select></label><label>Zona<select value={reportFilters.zone} onChange={e => setReportFilters(v => ({ ...v, zone: e.target.value }))}><option value="">Todas as zonas</option>{zones.map(zone => <option key={zone.id} value={zone.name}>{zone.name}</option>)}</select></label><label className="ops-report-plate">Placa<div className="ops-search-control"><input value={reportFilters.plate} onChange={e => setReportFilters(v => ({ ...v, plate: e.target.value.toUpperCase() }))} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} placeholder="Digite a placa" maxLength={10}/><button type="button" aria-label="Pesquisar placa" title="Pesquisar placa" onClick={() => setReportFilters(v => ({ ...v, plate: v.plate.trim().toUpperCase() }))}><Search size={17}/></button></div></label></div></section><section className="ops-report-results"><div className="ops-metrics compact ops-report-metrics"><article><span>Registros encontrados</span><strong>{reportMetrics.total}</strong></article><article><span>Em andamento</span><strong>{reportMetrics.active}</strong></article><article><span>Vencidos</span><strong>{reportMetrics.expired}</strong></article><article><span>Encerrados</span><strong>{reportMetrics.finished}</strong></article></div><div className="ops-panel"><div className="ops-panel-heading ops-report-result-heading"><div><h2>Resultado do relatório</h2><p>{reportSessions.length} registro(s) correspondem aos filtros aplicados.</p></div>{canExportReports && <div className="ops-report-export-actions"><button className="ops-small-action ops-export-action" onClick={() => exportCurrent('pdf')} disabled={reportSessions.length === 0}><FileText size={16}/> PDF</button><button className="ops-primary" onClick={() => exportCurrent('excel')} disabled={reportSessions.length === 0}><Download size={16}/> Excel</button></div>}</div><div className="ops-table-wrap"><table><thead><tr><th>PLACA</th><th>ORIGEM</th><th>ZONA / VAGA</th><th>DATA</th><th>CHEGADA</th><th>VENCIMENTO</th><th>ENCERRAMENTO</th><th>SITUAÇÃO</th><th>LOCALIZAÇÃO</th></tr></thead><tbody>{reportSessions.map(session => { const expired = session.status === 'expired' || (session.status === 'active' && new Date(session.expires_at).getTime() <= Date.now()); return <tr key={session.id}><td><VehiclePlate value={session.plate_snapshot} compact/></td><td>{session.source === 'physical_card' ? 'Cartão físico' : 'Aplicativo'}</td><td>{session.parking_spaces?.parking_zones?.name || '—'}<small className="ops-report-cell-sub">{session.parking_spaces?.code || 'Sem vaga vinculada'}</small></td><td>{dateOnly(session.started_at)}</td><td>{timeOnly(session.started_at)}</td><td><strong className="ops-expiry-time">{timeOnly(session.expires_at)}</strong></td><td>{session.ended_at ? timeOnly(session.ended_at) : "—"}</td><td><span className={`ops-pill ${expired ? 'danger' : session.status === 'finished' ? 'info' : 'success'}`}>{expired ? 'Vencido' : statusText(session.status)}</span></td><td>{session.latitude != null && session.longitude != null ? <a className="ops-location-link" href={`https://www.openstreetmap.org/?mlat=${session.latitude}&mlon=${session.longitude}#map=18/${session.latitude}/${session.longitude}`} target="_blank" rel="noreferrer"><MapPin size={14}/> Ver mapa</a> : 'Não disponível'}</td></tr>; })}{reportSessions.length === 0 && <tr><td colSpan={9} className="ops-empty">Nenhum registro corresponde aos filtros selecionados.</td></tr>}</tbody></table></div></div></section></div>}
        </>}
      </div>
      <footer className="ops-footer">© 2026 VagaFácil · Plataforma municipal de estacionamento rotativo <span>Ambiente autenticado · {profile.full_name}</span></footer>
    </main>
    {userModalOpen && <div className="ops-modal-backdrop"><form className="ops-modal" onSubmit={saveUser}><button type="button" className="ops-modal-close" onClick={()=>setUserModalOpen(false)} aria-label="Fechar"><X size={18}/></button><span className="ops-eyebrow">GESTÃO DE ACESSO</span><h2>{editingUser?'Editar usuário':'Cadastrar usuário'}</h2><label>Nome completo<input value={userForm.full_name} onChange={e=>setUserForm(v=>({...v,full_name:e.target.value}))} maxLength={120} autoComplete="name" required/></label><label>E-mail<input type="email" value={userForm.email} onChange={e=>setUserForm(v=>({...v,email:e.target.value}))} autoComplete="email" required/></label><label>{editingUser?'Nova senha (opcional)':'Senha inicial'}<input type="password" value={userForm.password} onChange={e=>setUserForm(v=>({...v,password:e.target.value}))} minLength={10} autoComplete="new-password" placeholder={editingUser?'Deixe em branco para manter a atual':'Mínimo de 10 caracteres'} required={!editingUser}/></label><label>Perfil de acesso<select value={userForm.role} onChange={e=>setUserForm(v=>({...v,role:e.target.value}))}><option value="citizen">Cidadão</option><option value="agent">Agente</option><option value="supervisor">Supervisor</option><option value="admin">Administrador</option></select></label><label className="ops-checkbox"><input type="checkbox" checked={userForm.is_active} onChange={e=>setUserForm(v=>({...v,is_active:e.target.checked}))}/> Conta ativa</label>{editingUser && <div className="ops-user-mfa-reset"><div><strong>Autenticação em duas etapas</strong><small>Remove o autenticador atual para permitir um novo cadastro no próximo acesso.</small></div><button type="button" className="ops-small-action danger" onClick={()=>resetUserAuthenticator(editingUser)} disabled={busy}><KeyRound size={15}/> Resetar autenticador</button></div>}<button className="ops-primary" disabled={busy}>{busy?'Salvando...':editingUser?'Salvar alterações':'Cadastrar usuário'}</button></form></div>}
    {editingRule && <div className="ops-modal-backdrop"><form className="ops-modal" onSubmit={saveRule}><button type="button" className="ops-modal-close" onClick={()=>setEditingRule(null)} aria-label="Fechar"><X size={18}/></button><h2>Editar regras</h2><label>Nome<input value={editingRule.name} onChange={e=>setEditingRule(v=>v?({...v,name:e.target.value}):v)} required/></label><div className="ops-form-grid"><label>Início (seg–sex)<input type="time" value={editingRule.start_time.slice(0,5)} onChange={e=>setEditingRule(v=>v?({...v,start_time:e.target.value}):v)} required/></label><label>Fim (seg–sex)<input type="time" value={editingRule.end_time.slice(0,5)} onChange={e=>setEditingRule(v=>v?({...v,end_time:e.target.value}):v)} required/></label><label>Início sábado<input type="time" value={editingRule.saturday_start?.slice(0,5)||''} onChange={e=>setEditingRule(v=>v?({...v,saturday_start:e.target.value||null}):v)}/></label><label>Fim sábado<input type="time" value={editingRule.saturday_end?.slice(0,5)||''} onChange={e=>setEditingRule(v=>v?({...v,saturday_end:e.target.value||null}):v)}/></label><label>Minutos convencional<input type="number" min="1" max="1440" value={editingRule.conventional_minutes} onChange={e=>setEditingRule(v=>v?({...v,conventional_minutes:Number(e.target.value)}):v)}/></label><label>Minutos especial<input type="number" min="1" max="1440" value={editingRule.special_minutes} onChange={e=>setEditingRule(v=>v?({...v,special_minutes:Number(e.target.value)}):v)}/></label><label>Tolerância<input type="number" min="0" max="120" value={editingRule.grace_minutes} onChange={e=>setEditingRule(v=>v?({...v,grace_minutes:Number(e.target.value)}):v)}/></label></div><label className="ops-checkbox"><input type="checkbox" checked={editingRule.enabled} onChange={e=>setEditingRule(v=>v?({...v,enabled:e.target.checked}):v)}/> Regra habilitada</label><button className="ops-primary" disabled={busy}>Salvar regras</button></form></div>}
    {enforcement && <div className="ops-modal-backdrop"><form className="ops-modal" onSubmit={saveEnforcement}><button type="button" className="ops-modal-close" onClick={()=>setEnforcement(null)} aria-label="Fechar"><X size={18}/></button><span className="ops-eyebrow">FISCALIZAÇÃO EM CAMPO</span><h2>Registrar verificação</h2><p className="ops-enforcement-vehicle">Veículo: {enforcement.parking_sessions?.plate_snapshot ? <VehiclePlate value={enforcement.parking_sessions.plate_snapshot} compact /> : <strong>Não identificado</strong>}</p><label>Resultado<select value={enforcementResult} onChange={e=>setEnforcementResult(e.target.value)}><option value="regular">Situação regular</option><option value="irregular">Irregularidade constatada</option></select></label><label>Observações<textarea rows={4} maxLength={2000} value={enforcementNotes} onChange={e=>setEnforcementNotes(e.target.value)} placeholder="Descreva a verificação realizada..."/></label><label className="ops-upload"><Camera size={18}/> Fotos da fiscalização<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setEvidenceFiles(Array.from(e.target.files || []).slice(0,5))}/><small>{evidenceFiles.length} arquivo(s) selecionado(s) · máximo 5 MB por imagem</small></label><button className="ops-primary" disabled={busy}>Concluir fiscalização</button></form></div>}
  </div>;
}
