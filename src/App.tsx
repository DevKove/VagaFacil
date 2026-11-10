import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, CarFront, CheckCircle2, ChevronDown, Clock3, LockKeyhole, MapPin, Menu, Search, ShieldCheck, Users, X } from 'lucide-react';
import { isSupabaseConfigured } from './lib/supabase';

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

function Portal({ onSelect }: { onSelect: (role: PortalRole) => void }) {
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
    <footer className="portal-footer"><span>© 2026 VagaFácil · Plataforma municipal de estacionamento rotativo</span><span>Mobilidade mais simples para todos.</span><button className="portal-demo-link" onClick={() => setShowDemo(true)}>Visualizar painel demonstrativo</button></footer>
  </main>;
}

function LoginScreen({ role, onBack }: { role: PortalRole; onBack: () => void }) {
  const selected = portalRoles.find(item => item.id === role)!;
  const Icon = selected.icon;
  return <main className="portal-page login-page">
    <header className="portal-header"><a className="portal-brand" href="#" onClick={e => {e.preventDefault();onBack();}}><span className="portal-brand-mark">V</span><span><strong>VagaFácil</strong><small>Estacionar ficou mais fácil.</small></span></a><button className="portal-back" onClick={onBack}>← Voltar aos perfis</button></header>
    <section className="login-layout">
      <div className="login-intro"><span className="portal-kicker">ÁREA DE ACESSO</span><h1>Bem-vindo ao<br/><em>VagaFácil.</em></h1><p>Entre para continuar usando os serviços da plataforma.</p><div className="login-role-summary"><span className="portal-role-icon"><Icon size={23}/></span><div><strong>{selected.title}</strong><small>{selected.description}</small></div></div></div>
      <form className="login-card" onSubmit={e => e.preventDefault()}>
        <div className="login-card-icon"><Icon size={22}/></div><h2>Entrar na sua conta</h2><p>Informe seus dados de acesso.</p>
        <label>E-mail<input type="email" placeholder="seu@email.com" autoComplete="username" required /></label>
        <label>Senha<input type="password" placeholder="Digite sua senha" autoComplete="current-password" required /></label>
        <button type="submit" disabled>Entrar <ArrowUpRight size={17}/></button>
        <div className="login-unavailable"><LockKeyhole size={16}/><span>A autenticação ainda está em implantação. O acesso será liberado após a configuração do serviço de contas.</span></div>
        {role === 'citizen' && <button type="button" className="login-create" disabled>Criar minha conta em breve</button>}
      </form>
    </section>
    <footer className="portal-footer"><span>© 2026 VagaFácil · Plataforma municipal de estacionamento rotativo</span><span>Ambiente seguro de acesso</span></footer>
  </main>;
}

export default function App() {
  const [selectedRole, setSelectedRole] = useState<PortalRole | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  if (showDemo) return <Dashboard initialArea={selectedRole === 'citizen' ? 'citizen' : selectedRole === 'agent' ? 'agent' : 'admin'} />;
  if (selectedRole) return <LoginScreen role={selectedRole} onBack={() => setSelectedRole(null)} />;
  return <Portal onSelect={setSelectedRole} />;
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