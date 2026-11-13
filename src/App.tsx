import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Apple, Bell, CarFront, CheckCircle2, ChevronDown, Clock3, LockKeyhole, MapPin, Menu, Search, Share2, ShieldCheck, Smartphone, Users, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import CitizenWorkspace from './features/citizen/CitizenWorkspace';
import OperationsWorkspace from './features/operations/OperationsWorkspace';

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

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (installed) return true;
    let promptEvent = installPrompt;
    if (!promptEvent) {
      promptEvent = await new Promise<InstallPromptEvent | null>(resolve => {
        const onPrompt = (event: Event) => {
          event.preventDefault();
          window.clearTimeout(timeout);
          window.removeEventListener('beforeinstallprompt', onPrompt);
          resolve(event as InstallPromptEvent);
        };
        const timeout = window.setTimeout(() => {
          window.removeEventListener('beforeinstallprompt', onPrompt);
          resolve(null);
        }, 2500);
        window.addEventListener('beforeinstallprompt', onPrompt);
      });
    }
    if (!promptEvent) return false;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      return choice.outcome === 'accepted';
    } finally {
      setInstallPrompt(null);
    }
  };

  return { installed, install };
}

const portalRoles: { id: PortalRole; title: string; description: string; action: string; icon: typeof CarFront; featured?: boolean; details: string[] }[] = [
  { id: 'citizen', title: 'Sou cidadão', description: 'Estacione com praticidade. Registre sua vaga, acompanhe o tempo e consulte seu histórico.', action: 'Acessar área do cidadão', icon: CarFront, featured: true, details: ['Registrar estacionamento', 'Acompanhar tempo restante', 'Gerenciar veículos'] },
  { id: 'agent', title: 'Agente de trânsito', description: 'Acesso às ferramentas de fiscalização e consulta em campo.', action: 'Acesso do agente', icon: ShieldCheck, details: ['Consultar placas e sessões', 'Ver alertas operacionais', 'Registrar ocorrências'] },
  { id: 'admin', title: 'Administrador', description: 'Gerencie a operação municipal, regras, zonas e indicadores.', action: 'Acesso administrativo', icon: Users, details: ['Gerenciar zonas e vagas', 'Administrar usuários', 'Acompanhar relatórios'] },
];

function Portal({ onSelect }: { onSelect: (role: PortalRole) => void }) {
  const [accessOpen, setAccessOpen] = useState(false);
  const [adminOptionsOpen, setAdminOptionsOpen] = useState(false);
  const [installHelp, setInstallHelp] = useState<'ios' | null>(null);
  const [androidInstallMessage, setAndroidInstallMessage] = useState('');
  const { installed, install } = usePwaInstall();
  const openAndroidInstall = async () => {
    if (installed) return;
    setAndroidInstallMessage('');
    const started = await install();
    if (!started && !window.matchMedia('(display-mode: standalone)').matches) {
      setAndroidInstallMessage('O Chrome ainda não liberou a instalação. Abra esta página no Chrome atualizado e tente novamente.');
    }
  };
  return <main className="portal-page">
    <section className="portal-hero">
      <div className="portal-hero-art" aria-hidden="true">
        <img className="portal-hero-backdrop" src={new URL('../IMG/banner mobile.jpg?rev=20261113-2', import.meta.url).href} alt="" />
        <picture className="portal-hero-picture">
          <source media="(max-width: 760px)" srcSet={new URL('../IMG/banner mobile.jpg?rev=20261113-2', import.meta.url).href} />
          <img className="portal-hero-image" src={new URL('../IMG/banner.jpg?rev=20261113-2', import.meta.url).href} alt="" />
        </picture>
      </div>
      <div className="portal-hero-actions">
        <div className="portal-install-platforms" aria-label="Instalar aplicativo">
          <button type="button" className="portal-platform-install portal-platform-android" onClick={() => void openAndroidInstall()} disabled={installed} aria-label="Instalar no Android"><Smartphone size={17}/><span>{installed ? 'Instalado' : 'Android'}</span></button>
          <button type="button" className="portal-platform-install portal-platform-ios" onClick={() => setInstallHelp('ios')} disabled={installed} aria-label="Instalar no iOS"><Apple size={17}/><span>iOS</span></button>
        </div>
        {androidInstallMessage && <p className="android-install-feedback" role="status">{androidInstallMessage}</p>}
        <button type="button" className="portal-login-trigger portal-hero-login" onClick={() => setAccessOpen(true)}><LockKeyhole size={18}/> Entrar <ArrowUpRight size={17}/></button>
      </div>
      {installHelp && <div className="install-help-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setInstallHelp(null); }}>
        <section className="install-help-dialog" role="dialog" aria-modal="true" aria-labelledby="install-help-title">
          <button type="button" className="access-picker-close" aria-label="Fechar" onClick={() => setInstallHelp(null)}><X size={20}/></button>
          <span className="portal-kicker">VAGAFÁCIL NO SEU CELULAR</span>
          <h2 id="install-help-title">Instalar no iPhone ou iPad</h2>
          <ol className="install-help-steps">
            <li><Share2 size={19}/><span>No Safari, toque em <strong>Compartilhar</strong> (ícone de compartilhar).</span></li>
            <li><span className="install-step-number">2</span><span>Role as opções e escolha <strong>Adicionar à Tela de Início</strong>.</span></li>
            <li><span className="install-step-number">3</span><span>Confirme em <strong>Adicionar</strong>. O VagaFácil ficará disponível como aplicativo.</span></li>
          </ol>
          <p className="install-help-note">A instalação no iOS deve ser feita pelo Safari.</p>
          <button type="button" className="install-help-confirm" onClick={() => setInstallHelp(null)}>Entendi</button>
        </section>
      </div>}
    </section>
    <footer className="portal-footer portal-footer-refined">
      <span>© 2026 VagaFácil · Plataforma municipal de estacionamento rotativo</span>
      <span>Mobilidade mais simples para todos.</span>
    </footer>
    {accessOpen && <div className="access-picker-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAccessOpen(false); }}>
      <section className="access-picker" role="dialog" aria-modal="true" aria-labelledby="access-picker-title">
        <button type="button" className="access-picker-close" aria-label="Fechar" onClick={() => setAccessOpen(false)}><X size={20}/></button>
        <span className="portal-kicker">ACESSO À PLATAFORMA</span><h2 id="access-picker-title">Como deseja entrar?</h2><p>Selecione o ambiente correspondente ao seu perfil.</p>
        <button type="button" className="access-picker-option" onClick={() => { setAccessOpen(false); onSelect('citizen'); }}><span className="portal-role-icon"><CarFront size={22}/></span><span><strong>Sou cidadão</strong><small>Registre estacionamentos, acompanhe o tempo e consulte seus veículos.</small></span><ArrowUpRight size={19}/></button>
        <button type="button" className="access-picker-option" aria-expanded={adminOptionsOpen} onClick={() => setAdminOptionsOpen(value => !value)}><span className="portal-role-icon"><ShieldCheck size={22}/></span><span><strong>Área administrativa</strong><small>Acesso restrito para agentes de trânsito e administradores.</small></span><ChevronDown size={19}/></button>
        {adminOptionsOpen && <div className="access-picker-suboptions">
          <button type="button" className="access-picker-option" onClick={() => { setAccessOpen(false); onSelect('agent'); }}><span className="portal-role-icon"><ShieldCheck size={20}/></span><span><strong>Agente de trânsito</strong><small>Fiscalização e consultas operacionais.</small></span><ArrowUpRight size={18}/></button>
          <button type="button" className="access-picker-option" onClick={() => { setAccessOpen(false); onSelect('admin'); }}><span className="portal-role-icon"><Users size={20}/></span><span><strong>Administrador</strong><small>Gestão da plataforma e da operação municipal.</small></span><ArrowUpRight size={18}/></button>
        </div>}
      </section>
    </div>}
  </main>;
}

type UserProfile = { id: string; full_name: string; role: string; is_active: boolean };

function LoginScreen({ role, onBack, onAuthenticated, onMfaRequired }: { role: PortalRole; onBack: () => void; onAuthenticated: (profile: UserProfile) => void; onMfaRequired: (profile: UserProfile) => void }) {
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

  const redirectUrl = 'https://devkove.github.io/VagaFacil/';
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) { setError('Serviço de autenticação não configurado. Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.'); return; }
    const client = supabase;
    void run(async () => {
      if (mode === 'signup') {
        if (password.length < 10) throw new Error('A senha deve ter pelo menos 10 caracteres.');
        if (!name.trim()) throw new Error('Informe seu nome completo.');
        const { data, error: authError } = await client.auth.signUp({
          email: email.trim().toLowerCase(), password,
          options: { emailRedirectTo: redirectUrl, data: { full_name: name.trim(), phone: phone.trim() || null } },
        });
        if (authError) throw authError;
        if (data.session) {
          const { data: profile, error: profileError } = await client.from('profiles').select('id,full_name,role,is_active').eq('id', data.user!.id).single();
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
        const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${redirectUrl}?recovery=1` });
        if (resetError) throw resetError;
        setMessage('Se o endereço estiver cadastrado, você receberá as instruções para redefinir a senha.');
        return;
      }
      if (mode === 'password') {
        if (password.length < 10) throw new Error('A nova senha deve ter pelo menos 10 caracteres.');
        if (password !== confirmation) throw new Error('As senhas não coincidem.');
        const { error: updateError } = await client.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage('Senha atualizada. Você já pode continuar usando sua conta.');
        window.history.replaceState({}, '', redirectUrl);
        setMode('login');
        return;
      }
      const { data, error: authError } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (authError) throw authError;
      const { data: profile, error: profileError } = await client.from('profiles').select('id,full_name,role,is_active').eq('id', data.user.id).single();
      if (profileError) { await client.auth.signOut(); throw new Error('Perfil não encontrado. Verifique se a migração do banco foi aplicada.'); }
      if (!profile.is_active) { await client.auth.signOut(); throw new Error('Acesso desativado. Procure a administração municipal.'); }
      if (profile.role !== role && !(role === 'admin' && profile.role === 'supervisor')) { await client.auth.signOut(); throw new Error('Esta conta não tem permissão para acessar este ambiente.'); }
      if (profile.role === 'admin' || profile.role === 'supervisor' || profile.role === 'agent') onMfaRequired(profile);
      else onAuthenticated(profile);
    });
  };

  const title = mode === 'signup' ? 'Criar conta de cidadão' : mode === 'recover' ? 'Recuperar acesso' : mode === 'password' ? 'Nova senha' : 'Entrar na sua conta';
  return <div className="auth-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onBack(); }}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <header className="auth-modal-header"><div><span className="portal-kicker">ACESSO SEGURO</span><h2 id="auth-modal-title">{selected.title}</h2></div><button type="button" className="access-picker-close" aria-label="Fechar" onClick={onBack}><X size={20}/></button></header>
      <div className="login-form-section">
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
      </div>
    </section>
  </div>;
}

function AdminMfaScreen({ profile, onVerified, onCancel }: { profile: UserProfile; onVerified: () => void; onCancel: () => void }) {
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(false);
  const [reconfigure, setReconfigure] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (!supabase) { setError('Serviço de autenticação indisponível.'); setBusy(false); return; }
      try {
        const { data, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const verified = data.totp.find(factor => factor.status === 'verified');
        if (verified) {
          // O desafio deve ser criado no momento de cada tentativa de verificação.
          // Desafios antigos/reutilizados podem expirar ou já ter sido consumidos.
          if (active) { setFactorId(verified.id); setSetup(false); }
        } else {
          // Um cadastro TOTP pendente não devolve novamente o QR Code/segredo.
          // Remova apenas fatores pendentes criados por este fluxo antes de gerar outro.
          const pending = data.totp.filter(factor =>
            factor.status !== 'verified' && /vagafácil|vagafacil|localhost/i.test(factor.friendly_name || '')
          );
          for (const factor of pending) {
            const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
            if (unenrollError) throw new Error(`Não foi possível reiniciar a configuração do autenticador: ${unenrollError.message}`);
          }
          const enrollment = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'VagaFácil', issuer: 'VagaFácil' });
          if (enrollment.error) throw enrollment.error;
          if (active) {
            setFactorId(enrollment.data.id);
            setQrCode(enrollment.data.totp.qr_code);
            setSecret(enrollment.data.totp.secret);
            setSetup(true);
          }
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Não foi possível iniciar a autenticação em duas etapas.');
      } finally { if (active) setBusy(false); }
    };
    void initialize();
    return () => { active = false; };
  }, []);

  const verify = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !factorId || !/^\d{6}$/.test(code)) { setError('Informe o código de 6 dígitos do aplicativo autenticador.'); return; }
    void (async () => {
      setBusy(true); setError('');
      try {
        // Sempre solicitar um desafio novo imediatamente antes de validar o TOTP.
        const challenge = await supabase.auth.mfa.challenge({ factorId });
        if (challenge.error) throw challenge.error;
        const result = await supabase.auth.mfa.verify({
          factorId,
          challengeId: challenge.data.id,
          code,
        });
        if (result.error) throw result.error;
        const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.error) throw assurance.error;
        if (assurance.data.currentLevel !== 'aal2') throw new Error('A autenticação em duas etapas ainda não foi concluída.');
        if (reconfigure && !setup) {
          const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
          if (unenrollError) throw unenrollError;
          const enrollment = await supabase.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: 'VagaFácil',
            issuer: 'VagaFácil',
          });
          if (enrollment.error) throw enrollment.error;
          setFactorId(enrollment.data.id);
          setQrCode(enrollment.data.totp.qr_code);
          setSecret(enrollment.data.totp.secret);
          setSetup(true);
          setReconfigure(false);
          setCode('');
          return;
        }
        onVerified();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Código inválido ou expirado. Confira o aplicativo autenticador e tente novamente.');
        setCode('');
      } finally { setBusy(false); }
    })();
  };

  return <div className="auth-modal-backdrop">
    <section className="auth-modal mfa-modal" role="dialog" aria-modal="true" aria-labelledby="mfa-title">
      <header className="auth-modal-header"><div><span className="portal-kicker">VERIFICAÇÃO DE SEGURANÇA</span><h2 id="mfa-title">{setup ? 'Ativar autenticador' : 'Confirme sua identidade'}</h2></div><button type="button" className="access-picker-close" aria-label="Sair" onClick={onCancel}><X size={20}/></button></header>
      <div className="mfa-content">
        {busy && !factorId ? <p>Preparando autenticação segura...</p> : <>
          <p>{setup ? 'Para proteger a área administrativa, vincule um aplicativo autenticador à sua conta. Escaneie o QR Code abaixo.' : 'Abra seu aplicativo autenticador e informe o código temporário de 6 dígitos para continuar.'}</p>
          {setup && qrCode && <div className="mfa-qr"><img src={qrCode} alt="QR Code para configurar o autenticador"/><small>Google Authenticator, Microsoft Authenticator, Authy ou compatível.</small><label>Chave de configuração manual<code>{secret}</code></label></div>}
          <form onSubmit={verify}>
            <label htmlFor="mfa-code">Código do autenticador</label>
            <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0,6))} required />
            <button type="submit" disabled={busy || code.length !== 6}>{busy ? 'Verificando...' : setup ? 'Ativar e continuar' : reconfigure ? 'Verificar e atualizar autenticador' : 'Verificar código'} <ArrowUpRight size={17}/></button>
            {!setup && <button type="button" className="login-create" onClick={()=>{setReconfigure(value=>!value);setError('');setCode('');}}>{reconfigure?'Cancelar atualização':'Atualizar identificação para VagaFácil'}</button>}
            {reconfigure && <small className="ops-hint">Confirme o código atual. Em seguida, será exibido um novo QR Code identificado como VagaFácil.</small>}
          </form>
        </>}
        {error && <div className="auth-feedback error" role="alert">{error}</div>}
        <div className="mfa-account">Conta: <strong>{profile.full_name || 'Usuário administrativo'}</strong></div>
      </div>
    </section>
  </div>;
}

function AuthenticatedHome({ profile, role, onSignOut }: { profile: UserProfile; role: PortalRole; onSignOut: () => void }) {
  if (role === 'citizen') return <CitizenWorkspace profile={profile} onSignOut={onSignOut} />;
  return <OperationsWorkspace profile={profile} area={role} onSignOut={onSignOut} />;
}

export default function App() {
  const [selectedRole, setSelectedRole] = useState<PortalRole | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mfaProfile, setMfaProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    const client = supabase;
    let alive = true;
    const loadProfile = async () => {
      const { data: { session } } = await client.auth.getSession();
      if (!alive) return;
      if (new URLSearchParams(window.location.search).get('recovery') === '1') { setAuthLoading(false); return; }
      if (!session) { setAuthLoading(false); return; }
      const { data, error } = await client.from('profiles').select('id,full_name,role,is_active').eq('id', session.user.id).single();
      if (!alive) return;
      if (error || !data?.is_active) { await client.auth.signOut(); setProfile(null); }
      else if (['admin', 'supervisor', 'agent'].includes(data.role)) {
        const { data: assurance } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance?.currentLevel !== 'aal2') setMfaProfile(data); else setProfile(data);
      } else setProfile(data);
      setAuthLoading(false);
    };
    void loadProfile();
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) { setProfile(null); setAuthLoading(false); return; }
      if (new URLSearchParams(window.location.search).get('recovery') === '1') return;
      window.setTimeout(() => {
        void client.from('profiles').select('id,full_name,role,is_active').eq('id', session.user.id).single()
          .then(async ({ data, error }) => {
            if (!error && data?.is_active) {
              if (['admin', 'supervisor', 'agent'].includes(data.role)) {
                const { data: assurance } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
                if (assurance?.currentLevel !== 'aal2') setMfaProfile(data); else setProfile(data);
              } else setProfile(data);
            }
            setAuthLoading(false);
          });
      }, 0);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  // Mantém o documento como único contêiner de rolagem após sair do modal de autenticação.
  useEffect(() => {
    if (!profile) return;
    const restoreDocumentScroll = () => {
      const html = document.documentElement;
      const body = document.body;
      html.style.setProperty('overflow-x', 'hidden');
      html.style.setProperty('overflow-y', 'auto');
      html.style.removeProperty('position');
      html.style.removeProperty('height');
      body.style.setProperty('overflow', 'visible');
      body.style.setProperty('height', 'auto');
      body.style.removeProperty('position');
      body.style.removeProperty('touch-action');
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    };
    const frame = window.requestAnimationFrame(restoreDocumentScroll);
    const fallback = window.setTimeout(restoreDocumentScroll, 180);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
    };
  }, [profile?.id]);

  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setProfile(null); setMfaProfile(null); setSelectedRole(null); setShowDemo(false); };
  if (authLoading) return <main className="portal-page"><div className="auth-loading">Verificando sessão segura...</div></main>;
  if (mfaProfile) return <AdminMfaScreen profile={mfaProfile} onVerified={() => { setProfile(mfaProfile); setMfaProfile(null); setSelectedRole(null); }} onCancel={signOut}/>;
  if (profile) {
    const role: PortalRole = profile.role === 'admin' || profile.role === 'supervisor' ? 'admin' : profile.role === 'agent' ? 'agent' : 'citizen';
    return <AuthenticatedHome profile={profile} role={role} onSignOut={signOut}/>;
  }
  if (showDemo) return <Dashboard initialArea={selectedRole === 'citizen' ? 'citizen' : selectedRole === 'agent' ? 'agent' : 'admin'} />;
  return <><Portal onSelect={setSelectedRole} />{selectedRole && <LoginScreen role={selectedRole} onBack={() => setSelectedRole(null)} onAuthenticated={setProfile} onMfaRequired={setMfaProfile} />}</>;
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
      <div className="brand"><img className="brand-logo" src={`${import.meta.env.BASE_URL}IMG/logo-vagafacil.svg`} alt="VagaFácil" /><div><strong>VagaFácil</strong><span>Estacionar ficou mais fácil.</span></div><button className="icon-btn close-menu" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X size={18}/></button></div>
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