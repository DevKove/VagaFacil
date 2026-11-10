import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, CarFront, CheckCircle2, ChevronDown, Clock3, LockKeyhole, MapPin, Menu, Search, ShieldCheck, Users, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type Area = 'admin' | 'agent' | 'citizen';
const nav = {
  admin: ['Visão geral', 'Estacionamentos', 'Vagas', 'Fiscalizações', 'Usuários', 'Relatórios', 'Configurações'],
  agent: ['Painel operacional', 'Alertas', 'Fiscalizações', 'Mapa operacional', 'Histórico'],
  citizen: ['Início', 'Registrar estacionamento', 'Meus veículos', 'Histórico', 'Notificações'],
};
const metrics = [
  { label: 'Sessões ativas', value: '248', delta: '+12,8%', icon: CarFront, tone: 'blue' },
  { label: 'Dentro do prazo', value: '196', delta: '79% do total', icon: CheckCircle2, tone: 'green' },
  { label: 'Próximas do limite', value: '32', delta: 'Atenção', icon: Clock3, tone: 'orange' },
  { label: 'Aguardando fiscalização', value: '20', delta: '+4 hoje', icon: AlertTriangle, tone: 'red' },
];
const sessions = [
  { plate: 'FRT-2A48', vehicle: 'Honda Civic · Prata', zone: 'Centro — Rua XV, 120', time: '09:14', remaining: '42 min', status: 'Regular' },
  { plate: 'GKM-8B21', vehicle: 'Fiat Argo · Branco', zone: 'Centro — Praça Matriz', time: '09:02', remaining: '8 min', status: 'Atenção' },
  { plate: 'EPL-4C73', vehicle: 'VW Polo · Cinza', zone: 'Vila Nova — Rua Paraná', time: '08:21', remaining: 'Vencido há 18 min', status: 'Vencido' },
  { plate: 'RTA-9D10', vehicle: 'Chevrolet Onix · Preto', zone: 'Centro — Rua Campos Sales', time: '09:27', remaining: '55 min', status: 'Regular' },
];

type PortalRole = 'citizen' | 'agent' | 'admin';

const portalRoles: { id: PortalRole; title: string; description: string; action: string; icon: typeof CarFront; featured?: boolean; details: string[] }[] = [
  { id: 'citizen', title: 'Sou cidadão', description: 'Estacione com praticidade. Registre sua vaga, acompanhe o tempo e consulte seu histórico.', action: 'Acessar área do cidadão', icon: CarFront, featured: true, details: ['Registrar estacionamento', 'Acompanhar tempo restante', 'Gerenciar veículos'] },
  { id: 'agent', title: 'Sou agente de trânsito', description: 'Acesse as ferramentas de fiscalização e consulta em campo.', action: 'Acesso do agente', icon: ShieldCheck, details: ['Consultar placas e sessões', 'Ver alertas operacionais', 'Registrar ocorrências'] },
  { id: 'admin', title: 'Sou administrador', description: 'Gerencie a operação municipal, regras, zonas e indicadores.', action: 'Acesso administrativo', icon: Users, details: ['Gerenciar zonas e vagas', 'Administrar usuários', 'Acompanhar relatórios'] },
];

function Portal({ onSelect, onDemo }: { onSelect: (role: PortalRole) => void; onDemo: () => void }) {
  return <main className="portal-page">
    <header className="portal-header">
      <a className="portal-brand" href="#" aria-label="VagaFácil início"><span className="portal-brand-mark">V</span><span><strong>VagaFácil</strong><small>Estacionar ficou mais fácil.</small></span></a>
      <span className="portal-header-note"><i /> Plataforma de estacionamento rotativo</span>
    </header>
    <section className="portal-hero">
      <div className="portal-hero-copy">
        <span className="portal-kicker"><i /> MOBILIDADE URBANA DIGITAL</span>
        <h1>Chegou, estacionou.<br/><em>Simples assim.</em></h1>
        <p>Mais praticidade para quem estaciona. Mais eficiência para quem cuida da mobilidade da cidade.</p>
        <div className="portal-hero-points"><span><CheckCircle2 size={16}/> Rápido e intuitivo</span><span><Clock3 size={16}/> Controle do tempo</span></div>
      </div>
      <div className="portal-hero-art" aria-hidden="true">
        <div className="road-sun"/>
        <div className="road-line"/>
        <div className="road-car"><CarFront size={96} strokeWidth={1.15}/></div>
        <div className="road-sign"><span>P</span><small>ROTATIVO</small></div>
        <div className="road-pin"><MapPin size={18}/><span>Vaga disponível</span></div>
      </div>
    </section>
    <section className="portal-access">
      <div className="portal-section-heading"><div><span className="portal-kicker">ACESSO À PLATAFORMA</span><h2>Como deseja acessar?</h2><p>Escolha seu perfil para continuar.</p></div><span className="portal-secure"><ShieldCheck size={15}/> Acesso por perfil</span></div>
      <div className="portal-role-grid">
        {portalRoles.map(role => <article key={role.id} className={role.featured ? 'portal-role-card featured' : 'portal-role-card'}>
          {role.featured && <span className="portal-featured-tag">MAIS UTILIZADO</span>}
          <div className="portal-role-icon"><role.icon size={24}/></div>
          <h3>{role.title}</h3><p>{role.description}</p>
          <ul>{role.details.map(detail => <li key={detail}><CheckCircle2 size={14}/>{detail}</li>)}</ul>
          <button className={role.featured ? 'portal-role-button primary' : 'portal-role-button'} onClick={() => onSelect(role.id)}>{role.action}<ArrowUpRight size={17}/></button>
        </article>)}
      </div>
      <p className="portal-help">Ainda não tem cadastro? <span>O acesso do cidadão poderá ser criado na própria plataforma.</span></p>
    </section>
    <footer className="portal-footer"><span>© 2026 VagaFácil · Plataforma municipal de estacionamento rotativo</span><span>Mobilidade mais simples para todos.</span><button className="portal-demo-link" onClick={onDemo}>Visualizar painel demonstrativo</button></footer>
  </main>;
}

type UserProfile = { full_name: string; role: string; is_active: boolean };

function LoginScreen({ role, onBack, onAuthenticated }: { role: PortalRole; onBack: () => void; onAuthenticated: (profile: UserProfile) => void }) {
  const selected = portalRoles.find(item => item.id === role)!;
  const Icon = selected.icon;
  const [mode, setMode] = useState<'login' | 'signup' | 'recover' | 'password'>(
    new URLSearchParams(window.location.search).get('recovery') === '1' ? 'password' : 'login'
  );
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) { setError('Serviço de autenticação não configurado. Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.'); return; }
    void run(async () => {
      if (mode === 'signup') {
        if (password.length < 10) throw new Error('A senha deve ter pelo menos 10 caracteres.');
        if (!name.trim()) throw new Error('Informe seu nome completo.');
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(), password,
          options: { emailRedirectTo: redirectUrl, data: { full_name: name.trim(), phone: phone.trim() || null } },
        });
        if (authError) throw authError;
        if (data.session) {
          const { data: profile, error: profileError } = await supabase.from('profiles').select('full_name,role,is_active').eq('id', data.user!.id).single();
          if (profileError) throw profileError;
          if (profile.role !== 'citizen' || !profile.is_active) throw new Error('Este cadastro não possui autorização para a área do cidadão.');
          onAuthenticated(profile);
        } else {
          setMessage('Cadastro recebido. Verifique seu e-mail para confirmar a conta e depois entre na plataforma.');
          setMode('login');
        }
        return;
      }
      if (mode === 'recover') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${redirectUrl}?recovery=1` });
        if (resetError) throw resetError;
        setMessage('Se o endereço estiver cadastrado, você receberá as instruções para redefinir a senha.');
        return;
      }
      if (mode === 'password') {
        if (password.length < 10) throw new Error('A nova senha deve ter pelo menos 10 caracteres.');
        if (password !== confirmation) throw new Error('As senhas não coincidem.');
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage('Senha atualizada. Você já pode continuar usando sua conta.');
        window.history.replaceState({}, '', redirectUrl);
        setMode('login');
        return;
      }
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (authError) throw authError;
      const { data: profile, error: profileError } = await supabase.from('profiles').select('full_name,role,is_active').eq('id', data.user.id).single();
      if (profileError) { await supabase.auth.signOut(); throw new Error('Perfil não encontrado. Verifique se a migração do banco foi aplicada.'); }
      if (!profile.is_active) { await supabase.auth.signOut(); throw new Error('Acesso desativado. Procure a administração municipal.'); }
      if (profile.role !== role && !(role === 'admin' && profile.role === 'supervisor')) { await supabase.auth.signOut(); throw new Error('Esta conta não tem permissão para acessar este ambiente.'); }
      onAuthenticated(profile);
    });
  };

  const title = mode === 'signup' ? 'Criar conta de cidadão' : mode === 'recover' ? 'Recuperar acesso' : mode === 'password' ? 'Nova senha' : 'Entrar na sua conta';
  return <main className="portal-page login-page">
    <header className="portal-header"><a className="portal-brand" href="#" onClick={e => {e.preventDefault();onBack();}}><span className="portal-brand-mark">V</span><span><strong>VagaFácil</strong><small>Estacionar ficou mais fácil.</small></span></a><button className="portal-back" onClick={onBack}>← Voltar aos perfis</button></header>
    <section className="login-layout">
      <div className="login-intro"><span className="portal-kicker">ÁREA DE ACESSO</span><h1>Bem-vindo ao<br/><em>VagaFácil.</em></h1><p>Entre para continuar usando os serviços da plataforma.</p><div className="login-role-summary"><span className="portal-role-icon"><Icon size={23}/></span><div><strong>{selected.title}</strong><small>{selected.description}</small></div></div></div>
      <form className="login-card" onSubmit={submit}>
        <div className="login-card-icon"><Icon size={22}/></div><h2>{title}</h2><p>{mode === 'signup' ? 'Preencha seus dados para começar.' : mode === 'recover' ? 'Informe seu e-mail cadastrado.' : mode === 'password' ? 'Escolha uma senha segura.' : 'Informe seus dados de acesso.'}</p>
        {mode === 'signup' && <><label>Nome completo<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" maxLength={120} required /></label><label>Telefone (opcional)<input value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" maxLength={20} /></label></>}
        {mode !== 'password' && <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" required /></label>}
        {(mode === 'login' || mode === 'signup' || mode === 'password') && <label>{mode === 'password' ? 'Nova senha' : 'Senha'}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 10 caracteres" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={10} required /></label>}
        {mode === 'password' && <label>Confirmar nova senha<input type="password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="new-password" minLength={10} required /></label>}
        <button type="submit" disabled={busy || !isSupabaseConfigured}>{busy ? 'Aguarde...' : mode === 'signup' ? 'Criar minha conta' : mode === 'recover' ? 'Enviar instruções' : mode === 'password' ? 'Salvar nova senha' : 'Entrar'} <ArrowUpRight size={17}/></button>
        {error && <div className="auth-feedback error" role="alert">{error}</div>}
        {message && <div className="auth-feedback success" role="status">{message}</div>}
        {!isSupabaseConfigured && <div className="login-unavailable"><LockKeyhole size={16}/><span>Configure as credenciais públicas do Supabase para habilitar o acesso.</span></div>}
        {role === 'citizen' && mode === 'login' && <div className="auth-links"><button type="button" onClick={()=>{setMode('recover');setError('');setMessage('');}}>Esqueci minha senha</button><button type="button" onClick={()=>{setMode('signup');setError('');setMessage('');}}>Criar minha conta</button></div>}
        {mode !== 'login' && <button type="button" className="login-create" onClick={()=>{setMode('login');setError('');setMessage('');}}>Voltar para entrar</button>}
      </form>
    </section>
    <footer className="portal-footer"><span>© 2026 VagaFácil · Plataforma municipal de estacionamento rotativo</span><span>Ambiente seguro de acesso</span></footer>
  </main>;
}

function AuthenticatedHome({ profile, role, onSignOut }: { profile: UserProfile; role: PortalRole; onSignOut: () => void }) {
  const label = role === 'citizen' ? 'Área do cidadão' : role === 'agent' ? 'Área do agente' : 'Área administrativa';
  return <main className="portal-page authenticated-page">
    <header className="portal-header"><a className="portal-brand" href="#"><span className="portal-brand-mark">V</span><span><strong>VagaFácil</strong><small>Estacionar ficou mais fácil.</small></span></a><button className="portal-back" onClick={onSignOut}>Sair da conta</button></header>
    <section className="authenticated-card"><div className="login-card-icon"><CheckCircle2 size={23}/></div><span className="portal-kicker">ACESSO AUTENTICADO</span><h1>Olá, {profile.full_name || 'usuário'}.</h1><p>Sua conta foi autenticada com sucesso.</p><div className="auth-feedback success">{label} · Perfil ativo</div><p className="auth-pending">Os recursos operacionais deste ambiente serão liberados nas próximas etapas de desenvolvimento. Nenhum dado demonstrativo está sendo apresentado como dado real.</p></section>
    <footer className="portal-footer"><span>© 2026 VagaFácil · Plataforma municipal de estacionamento rotativo</span><span>Conexão segura</span></footer>
  </main>;
}

export default function App() {
  const [selectedRole, setSelectedRole] = useState<PortalRole | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let alive = true;
    const loadProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (new URLSearchParams(window.location.search).get('recovery') === '1') { setAuthLoading(false); return; }
      if (!session) { setAuthLoading(false); return; }
      const { data, error } = await supabase.from('profiles').select('full_name,role,is_active').eq('id', session.user.id).single();
      if (!alive) return;
      if (error || !data?.is_active) { await supabase.auth.signOut(); setProfile(null); }
      else setProfile(data);
      setAuthLoading(false);
    };
    void loadProfile();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setProfile(null); setAuthLoading(false); }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setProfile(null); setSelectedRole(null); setShowDemo(false); };
  if (authLoading) return <main className="portal-page"><div className="auth-loading">Verificando sessão segura...</div></main>;
  if (profile) {
    const role: PortalRole = profile.role === 'admin' ? 'admin' : profile.role === 'agent' ? 'agent' : 'citizen';
    return <AuthenticatedHome profile={profile} role={role} onSignOut={signOut}/>;
  }
  if (showDemo) return <Dashboard initialArea={selectedRole === 'citizen' ? 'citizen' : selectedRole === 'agent' ? 'agent' : 'admin'} />;
  if (selectedRole) return <LoginScreen role={selectedRole} onBack={() => setSelectedRole(null)} onAuthenticated={setProfile} />;
  return <Portal onSelect={setSelectedRole} onDemo={() => setShowDemo(true)} />;
}

function Dashboard({ initialArea = 'admin' }: { initialArea?: Area }) {
  const [area, setArea] = useState<Area>(initialArea);
  const [active, setActive] = useState(nav[initialArea][0]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const items = nav[area];
  const filtered = useMemo(() => sessions.filter(s => [s.plate, s.vehicle, s.zone].join(' ').toLowerCase().includes(query.toLowerCase())), [query]);
  const title = area === 'admin' ? 'Central de controle' : area === 'agent' ? 'Painel operacional' : 'Olá, motorista!';
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark">V</div><div><strong>VagaFácil</strong><span>Estacionar ficou mais fácil.</span></div><button className="icon-btn close-menu" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X size={18}/></button></div>
      <div className="workspace-label">AMBIENTE DE TRABALHO</div>
      <div className="area-switch">
        <button className={area === 'admin' ? 'selected' : ''} onClick={() => {setArea('admin');setActive(nav.admin[0]);}}>Administração</button>
        <button className={area === 'agent' ? 'selected' : ''} onClick={() => {setArea('agent');setActive(nav.agent[0]);}}>Agente</button>
        <button className={area === 'citizen' ? 'selected' : ''} onClick={() => {setArea('citizen');setActive(nav.citizen[0]);}}>Cidadão</button>
      </div>
      <nav className="nav-list">{items.map((item,i) => <button key={item} className={active === item ? 'nav-item active' : 'nav-item'} onClick={() => {setActive(item);setMenuOpen(false);}}><span className="nav-icon">{i===0?<Activity size={18}/>:i===1?<CarFront size={18}/>:i===2?<MapPin size={18}/>:i===3?<ShieldCheck size={18}/>:i===4?<Users size={18}/>:<Clock3 size={18}/>}</span>{item}{item==='Alertas'&&<i className="nav-count">3</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><ShieldCheck size={18}/></div><strong>Mobilidade mais simples</strong><p>Transparência e eficiência para a cidade.</p></div><div className="profile"><div className="avatar">VF</div><div><strong>Operador municipal</strong><span>{area === 'admin' ? 'Administrador' : area === 'agent' ? 'Agente de trânsito' : 'Cidadão'}</span></div><ChevronDown size={16}/></div></div>
    </aside>
    {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"/>}
    <main className="main">
      <header className="topbar"><div className="top-left"><button className="icon-btn mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={21}/></button><div className="breadcrumb">VagaFácil <span>/</span> {active}</div></div><div className="top-actions"><div className="system-status"><i/> Sistema operacional</div><button className="icon-btn notification-btn" onClick={() => setNoticeOpen(!noticeOpen)} aria-label="Notificações"><Bell size={19}/><b/></button><div className="top-avatar">OM</div></div></header>
      {noticeOpen && <div className="notification-pop"><strong>Notificações</strong><p><span className="dot orange"/> 3 estacionamentos próximos do vencimento.</p><p><span className="dot red"/> 1 ocorrência aguardando análise.</p></div>}
      <div className="content">
        <section className="welcome-row"><div><div className="eyebrow">TERÇA-FEIRA, 10 DE NOVEMBRO</div><h1>{active === items[0] ? title : active}</h1><p>Acompanhe a operação do estacionamento rotativo em tempo real.</p></div><div className="welcome-actions"><button className="btn-secondary"><Clock3 size={16}/> Últimas 24 horas <ChevronDown size={15}/></button><button className="btn-primary" onClick={() => setActive(area==='citizen'?'Registrar estacionamento':area==='agent'?'Alertas':'Relatórios')}>+ {area==='citizen'?'Registrar estacionamento':area==='agent'?'Ver alertas':'Novo relatório'}</button></div></section>
        {!isSupabaseConfigured && <div className="config-banner"><AlertTriangle size={18}/><div><strong>Ambiente de demonstração</strong><span>Conecte o Supabase para habilitar autenticação, dados reais e sincronização entre os três ambientes.</span></div></div>}
        <section className="metric-grid">{metrics.map((m,i)=><article className="metric-card" key={m.label}><div className="metric-top"><span>{m.label}</span><div className={`metric-icon ${m.tone}`}><m.icon size={19}/></div></div><div className="metric-value">{m.value}</div><div className={`metric-delta ${i===3?'negative':i===2?'warning':''}`}>{i===3?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>} {m.delta}</div><div className="metric-bar"><i style={{width:[78,79,34,20][i]+'%'}}/></div></article>)}</section>
        <section className="overview-grid"><article className="panel activity-panel"><div className="panel-heading"><div><h2>Movimentação de hoje</h2><p>Volume de registros ao longo do dia</p></div><button className="text-action">Ver relatório <ArrowUpRight size={15}/></button></div><div className="chart-summary"><strong>1.284</strong><span className="positive"><ArrowUpRight size={14}/> 8,4%</span><small>registros realizados</small></div><div className="chart"><div className="chart-y"><span>300</span><span>200</span><span>100</span><span>0</span></div><div className="chart-main"><div className="grid-lines"><i/><i/><i/><i/></div><svg viewBox="0 0 650 190" preserveAspectRatio="none" role="img" aria-label="Gráfico de movimentação crescente durante o dia"><defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#24a8df" stopOpacity=".22"/><stop offset="100%" stopColor="#24a8df" stopOpacity="0"/></linearGradient></defs><path d="M0 158 C35 150 45 126 80 132 S130 110 160 119 S210 92 245 106 S290 76 325 88 S370 57 405 75 S450 49 485 61 S535 32 570 43 S620 18 650 24 L650 190 L0 190Z" fill="url(#areaFill)"/><path d="M0 158 C35 150 45 126 80 132 S130 110 160 119 S210 92 245 106 S290 76 325 88 S370 57 405 75 S450 49 485 61 S535 32 570 43 S620 18 650 24" fill="none" stroke="#169bd2" strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg><div className="chart-x"><span>06h</span><span>08h</span><span>10h</span><span>12h</span><span>14h</span><span>16h</span><span>18h</span></div></div></div></article>
          <article className="panel distribution-panel"><div className="panel-heading"><div><h2>Situação das sessões</h2><p>Distribuição em tempo real</p></div><button className="icon-btn"><Activity size={17}/></button></div><div className="donut-wrap"><div className="donut"><div><strong>248</strong><span>sessões</span></div></div></div><div className="legend"><div><i className="lg-green"/><span>Regulares</span><strong>196 <small>79%</small></strong></div><div><i className="lg-orange"/><span>Atenção</span><strong>32 <small>13%</small></strong></div><div><i className="lg-red"/><span>Vencidas</span><strong>20 <small>8%</small></strong></div></div></article></section>
        <section className="panel table-panel"><div className="panel-heading table-heading"><div><h2>Estacionamentos recentes</h2><p>Monitoramento dos registros ativos</p></div><div className="table-tools"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar placa ou local..."/></label><button className="btn-secondary compact">Ver todos</button></div></div><div className="table-scroll"><table><thead><tr><th>VEÍCULO</th><th>LOCALIZAÇÃO</th><th>INÍCIO</th><th>TEMPO RESTANTE</th><th>SITUAÇÃO</th><th/></tr></thead><tbody>{filtered.map(s=><tr key={s.plate}><td><div className="vehicle-cell"><div className="car-thumb"><CarFront size={18}/></div><div><strong>{s.plate}</strong><span>{s.vehicle}</span></div></div></td><td><span className="location-cell"><MapPin size={14}/>{s.zone}</span></td><td>{s.time}</td><td className={s.status==='Vencido'?'expired-time':''}>{s.remaining}</td><td><span className={`status-pill ${s.status.toLowerCase()}`}><i/>{s.status}</span></td><td><button className="row-more" aria-label={`Ações para ${s.plate}`}>•••</button></td></tr>)}{filtered.length===0&&<tr><td colSpan={6} className="empty-row">Nenhum registro encontrado.</td></tr>}</tbody></table></div><div className="table-footer">Exibindo {filtered.length} de 248 registros <button className="text-action">Acessar monitoramento completo <ArrowUpRight size={14}/></button></div></section>
        <footer>© 2026 VagaFácil · Plataforma municipal de estacionamento rotativo <span>Dados demonstrativos</span></footer>
      </div>
    </main>
  </div>;
}