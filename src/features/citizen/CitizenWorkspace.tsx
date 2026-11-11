import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, Bell, CarFront, CheckCircle2, Clock3, History, MapPin, Menu, Plus, Power, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { VehiclePlate } from '../../components/VehiclePlate';

type Vehicle = { id: string; plate: string; make: string | null; model: string | null; color: string | null; vehicle_type: string | null };
type ParkingSpace = { id: string; code: string; category: string; zone_id: string | null; parking_zones?: { name: string } | null };
type BeneficiaryCategory = 'conventional' | 'elderly' | 'accessible';
type ParkingSession = { id: string; plate_snapshot: string; started_at: string; expires_at: string; ended_at: string | null; status: string; space_id: string | null; latitude: number | null; longitude: number | null; location_accuracy_m: number | null; location_captured_at: string | null; beneficiary_category: BeneficiaryCategory; parking_spaces?: { code: string; parking_zones?: { name: string } | null } | null };
type Notice = { id: string; title: string; body: string; kind: string; read_at: string | null; created_at: string };
type Profile = { id: string; full_name: string; role: string };

const platePattern = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
const fmtDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const remaining = (expiresAt: string, now: number) => Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
const timerLabel = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
let alertAudioContext: AudioContext | null = null;
let pendingAlertSound = false;

function playAlertTone(audio: AudioContext) {
  // Toque curto e melódico, com timbre de sino/piano (fundamental + harmônicos suaves).
  const notes = [
    { frequency: 1046.5, at: 0, duration: 0.42 },
    { frequency: 1318.5, at: 0.16, duration: 0.48 },
    { frequency: 1568, at: 0.34, duration: 0.62 },
  ];
  notes.forEach(({ frequency, at, duration }) => {
    const startAt = audio.currentTime + at;
    const fundamental = audio.createOscillator();
    const harmonic = audio.createOscillator();
    const envelope = audio.createGain();
    const harmonicGain = audio.createGain();
    fundamental.type = 'sine';
    harmonic.type = 'sine';
    fundamental.frequency.setValueAtTime(frequency, startAt);
    harmonic.frequency.setValueAtTime(frequency * 2.01, startAt);
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(0.22, startAt + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    harmonicGain.gain.setValueAtTime(0.0001, startAt);
    harmonicGain.gain.exponentialRampToValueAtTime(0.035, startAt + 0.012);
    harmonicGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration * 0.58);
    fundamental.connect(envelope);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(envelope);
    envelope.connect(audio.destination);
    fundamental.start(startAt);
    harmonic.start(startAt);
    fundamental.stop(startAt + duration + 0.02);
    harmonic.stop(startAt + duration * 0.6);
  });
}

async function unlockAlertAudio(): Promise<boolean> {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return false;
    alertAudioContext ??= new AudioContextClass();
    if (alertAudioContext.state !== 'running') await alertAudioContext.resume();
    if (alertAudioContext.state !== 'running') return false;
    if (pendingAlertSound) {
      pendingAlertSound = false;
      playAlertTone(alertAudioContext);
    }
    return true;
  } catch { return false; }
}
const getErrorMessage = (error: unknown, fallback = 'Não foi possível concluir a operação.') => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [value.message, value.details, value.hint]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    const code = typeof value.code === 'string' ? ` [${value.code}]` : '';
    if (parts.length) return `${parts.join(' — ')}${code}`;
  }
  return fallback;
};

function playAlertSound(enabled = true) {
  if (!enabled) { pendingAlertSound = false; return; }
  const audio = alertAudioContext;
  if (!audio || audio.state !== 'running') { pendingAlertSound = true; return; }
  try { playAlertTone(audio); } catch { /* áudio indisponível neste navegador */ }
}

async function showPersistentNotification(title: string, body: string, tag: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      await registration.showNotification(title, { body, tag, requireInteraction: true, icon: `${import.meta.env.BASE_URL}favicon.svg`, badge: `${import.meta.env.BASE_URL}favicon.svg` });
    } else {
      new Notification(title, { body, tag, requireInteraction: true });
    }
  } catch { /* notificações do sistema indisponíveis */ }
}

export default function CitizenWorkspace({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [tab, setTab] = useState<'overview' | 'register' | 'vehicles' | 'history' | 'notifications'>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(() => window.localStorage.getItem(`vagafacil:sound-enabled:${profile.id}`) !== 'false');
  const soundEnabledRef = useRef(soundEnabled);
  const [notificationPromptOpen, setNotificationPromptOpen] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => 'Notification' in window ? Notification.permission : 'denied');
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expiryWarning, setExpiryWarning] = useState<Array<{ sessionId: string; plate: string; body: string }>>([]);
  const seenNotificationIds = useRef<Set<string>>(new Set());
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
      client.from('parking_sessions').select('id,plate_snapshot,started_at,expires_at,ended_at,status,space_id,latitude,longitude,location_accuracy_m,location_captured_at,beneficiary_category,parking_spaces(code,parking_zones(name))').eq('user_id', profile.id).order('started_at', { ascending: false }).limit(50),
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
    const loadedNotices = (noticeResult.data ?? []) as Notice[];
    setNotices(loadedNotices);
    const pendingManualAlerts = loadedNotices.filter(item => item.kind === 'admin_manual_alert' && !item.read_at);
    setExpiryWarning(pendingManualAlerts.map(item => ({ sessionId: item.id, plate: 'ATENÇÃO', body: item.body })));
    if (pendingManualAlerts.length) playAlertSound(soundEnabledRef.current);
    seenNotificationIds.current = new Set(loadedNotices.map(item => item.id));
    setSelectedVehicle(current => current || vehicleResult.data?.[0]?.id || '');
  }, [profile.id]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    if (!soundEnabled) pendingAlertSound = false;
  }, [soundEnabled]);

  useEffect(() => {
    const unlockAudio = () => {
      if (soundEnabledRef.current) void unlockAlertAudio();
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const toggleAlertSound = () => {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    window.localStorage.setItem(`vagafacil:sound-enabled:${profile.id}`, String(next));
    if (next) void unlockAlertAudio();
    else pendingAlertSound = false;
  };

  const enableNotificationsAndSound = () => {
    setPermissionBusy(true);
    const audioActivation = soundEnabledRef.current ? unlockAlertAudio() : Promise.resolve(false);
    const notificationActivation = 'Notification' in window ? Notification.requestPermission() : Promise.resolve('denied' as NotificationPermission);
    void Promise.all([audioActivation, notificationActivation]).then(([, permission]) => {
      setNotificationPermission(permission);
      setNotificationPromptOpen(false);
    }).catch(() => setNotificationPromptOpen(false)).finally(() => setPermissionBusy(false));
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void refresh().catch(err => { if (alive) setError(getErrorMessage(err, 'Falha ao carregar seus dados.')); })
      .finally(() => { if (alive) setLoading(false); });
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const client = supabase;
    const channel = client?.channel(`citizen-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_sessions', filter: `user_id=eq.${profile.id}` }, () => { void refresh(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, payload => {
        const notice = payload.new as Notice;
        if (seenNotificationIds.current.has(notice.id)) return;
        seenNotificationIds.current.add(notice.id);
        setNotices(current => [notice, ...current.filter(item => item.id !== notice.id)].slice(0, 30));
        if (notice.kind === 'admin_manual_alert') {
          setExpiryWarning(current => [...current.filter(item => item.sessionId !== notice.id), { sessionId: notice.id, plate: 'ATENÇÃO', body: notice.body }]);
          playAlertSound(soundEnabledRef.current);
          void showPersistentNotification(notice.title, notice.body, notice.id);
        }
      })
      .subscribe();
    const notificationPoll = window.setInterval(async () => {
      if (!client) return;
      const { data, error: notificationError } = await client.from('notifications')
        .select('id,title,body,kind,read_at,created_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!alive || notificationError || !data) return;
      const incoming = data.filter(item => !seenNotificationIds.current.has(item.id));
      for (const notice of incoming) {
        seenNotificationIds.current.add(notice.id);
        if (notice.kind === 'admin_manual_alert') {
          setExpiryWarning(current => [...current.filter(item => item.sessionId !== notice.id), { sessionId: notice.id, plate: 'ATENÇÃO', body: notice.body }]);
          playAlertSound(soundEnabledRef.current);
          void showPersistentNotification(notice.title, notice.body, notice.id);
        }
      }
      if (incoming.length) setNotices(data as Notice[]);
    }, 5000);
    return () => { alive = false; window.clearInterval(timer); window.clearInterval(notificationPoll); if (client && channel) void client.removeChannel(channel); };
  }, [profile.id, refresh]);

  const activeSessions = useMemo(() => sessions.filter(item => item.status === 'active'), [sessions]);
  const unread = notices.filter(item => !item.read_at).length;

  // Enquanto o aviso estiver aberto, repete o toque a cada 10 segundos.
  // A execução é limitada pelo navegador quando a página fica suspensa/tela apagada.
  useEffect(() => {
    if (!expiryWarning.length) return;
    const repeat = window.setInterval(() => {
      if (soundEnabledRef.current) playAlertSound(true);
      if ('vibrate' in navigator) navigator.vibrate([250, 100, 250]);
    }, 10_000);
    return () => window.clearInterval(repeat);
  }, [expiryWarning]);

  useEffect(() => {
    const active = sessions.filter(session =>
      session.status === 'active' &&
      new Date(session.expires_at).getTime() > now
    );

    for (const session of active) {
      const secondsLeft = remaining(session.expires_at, now);
      const thresholds = [
        { minutes: 10, upper: 600, lower: 300 },
        { minutes: 5, upper: 300, lower: 0 },
      ];

      for (const threshold of thresholds) {
        // Dispara uma vez ao entrar na faixa de 10 ou 5 minutos.
        if (secondsLeft > threshold.upper || secondsLeft <= threshold.lower) continue;

        const alertId = `${session.id}:${threshold.minutes}`;
        const storageKey = `vagafacil:expiry-warning:${profile.id}:${alertId}`;
        const dismissedKey = `vagafacil:expiry-dismissed:${profile.id}:${alertId}`;
        if (window.localStorage.getItem(storageKey)) continue;

        const title = `Veículo ${session.plate_snapshot}`;
        const body = `O período regulamentado se encerra em ${threshold.minutes} minutos.`;
        const notificationBody = body;

        window.localStorage.setItem(storageKey, '1');
        setSuccess('');
        setError('');
        setExpiryWarning(current => [
          ...current.filter(item => item.sessionId !== alertId),
          { sessionId: alertId, plate: session.plate_snapshot, body },
        ]);

        playAlertSound(soundEnabledRef.current);
        void showPersistentNotification(title, notificationBody, storageKey);

        if (supabase) {
          void supabase.from('notifications').insert({
            user_id: profile.id,
            title,
            body,
            kind: 'parking_expiry_warning',
          }).select('id,title,body,kind,read_at,created_at').single()
            .then(({ data, error: insertError }) => {
              if (!insertError && data) setNotices(current => [data as Notice, ...current].slice(0, 30));
            });
        }

        // A chave de dispensa é mantida separada para que o fechamento não
        // impeça o aviso seguinte (10 ou 5 minutos).
        if (window.localStorage.getItem(dismissedKey)) {
          setExpiryWarning(current => current.filter(item => item.sessionId !== alertId));
        }
      }
    }
  }, [sessions, now, profile.id]);

  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setSuccess('');
    try { await action(); } catch (err) { setError(getErrorMessage(err)); }
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
      if (!navigator.geolocation) throw new Error('Este navegador não oferece suporte à geolocalização. Acesse por um navegador atualizado.');
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        });
      }).catch((err: GeolocationPositionError) => {
        if (err.code === 1) throw new Error('Permita o acesso à localização para registrar o estacionamento.');
        if (err.code === 2) throw new Error('Não foi possível determinar sua localização. Verifique o GPS e tente novamente.');
        if (err.code === 3) throw new Error('A localização demorou demais. Ative o GPS e tente novamente.');
        throw new Error('Não foi possível obter a localização do dispositivo.');
      });
      const { error: rpcError } = await client.rpc('start_parking_session', {
        p_vehicle_id: selectedVehicle,
        p_space_id: selectedSpace || null,
        p_beneficiary_category: beneficiaryCategory,
        p_latitude: position.coords.latitude,
        p_longitude: position.coords.longitude,
        p_accuracy_m: position.coords.accuracy,
      });
      if (rpcError) throw rpcError;
      setSuccess('Estacionamento registrado com sucesso. A localização foi salva junto ao registro e o cronômetro já está em andamento.');
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
      <div className="workspace-user"><button className={`workspace-audio-toggle${soundEnabled ? ' is-ready' : ' is-muted'}`} type="button" onClick={toggleAlertSound} aria-pressed={soundEnabled} title={soundEnabled ? 'Desativar alertas sonoros (não recomendado)' : 'Ativar alertas sonoros'}>{soundEnabled ? <Volume2 size={16}/> : <VolumeX size={16}/>}<span>{soundEnabled ? 'Som ativado' : 'Som desativado'}</span></button><span className="workspace-avatar">{(profile.full_name || 'C').slice(0,1).toUpperCase()}</span><span><strong>{profile.full_name || 'Cidadão'}</strong><small>Conta ativa</small></span><button className="workspace-signout" onClick={onSignOut}><Power size={16}/> Sair</button></div>
    </header>
    {notificationPromptOpen && <div className="workspace-permission-backdrop" role="presentation"><section className="workspace-permission-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-permission-title"><span className="workspace-permission-icon"><Bell size={27}/></span><span className="portal-kicker">CENTRAL DE AVISOS · VAGAFÁCIL</span><h2 id="workspace-permission-title">Ative seus avisos</h2><p>Para receber avisos importantes sobre seu estacionamento, permita as notificações do VagaFácil. O som dos alertas fica ativado por padrão e não é recomendado desativá-lo.</p><div className="workspace-permission-features"><div><Bell size={19}/><span><strong>Notificações de texto</strong><small>Avisos na tela e no sistema, mesmo quando outra aba estiver em uso.</small></span></div></div>{notificationPermission === 'denied' && 'Notification' in window && <p className="workspace-permission-hint">As notificações estão bloqueadas nas configurações do navegador. Você ainda poderá receber avisos dentro do VagaFácil.</p>}<button className="workspace-permission-enable" type="button" disabled={permissionBusy} onClick={enableNotificationsAndSound}>{permissionBusy ? 'Ativando...' : 'Permitir notificações'}</button><button className="workspace-permission-later" type="button" onClick={() => setNotificationPromptOpen(false)}>Agora não</button></section></div>}
    <div className="workspace-body">
      {sidebarOpen && <button className="workspace-sidebar-scrim" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`workspace-sidebar${sidebarOpen ? " is-open" : ""}`}><div className="workspace-greeting"><small>PORTAL DO CIDADÃO</small><strong>Olá, {profile.full_name?.split(' ')[0] || 'tudo bem'}!</strong><span>Gerencie seus estacionamentos.</span></div><nav>{navItems.map(item => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { setTab(item.id); setError(''); setSuccess(''); setSidebarOpen(false); }}><Icon size={17}/>{item.label}{item.id === 'notifications' && unread > 0 && <b>{unread}</b>}</button>; })}</nav><div className="workspace-rule-note"><Clock3 size={16}/><span>Rotativo gratuito<br/><strong>Registro livre</strong><small>Todos os dias · qualquer horário<br/>1h comum · 2h especial</small></span></div></aside>
      <section className="workspace-content">
        <div className="workspace-page-heading"><div><span className="portal-kicker">VAGAFÁCIL · SERVIÇOS DIGITAIS</span><h1>{navItems.find(item => item.id === tab)?.label}</h1><p>Seus dados e registros em um só lugar.</p></div>{tab === 'vehicles' && <button className="workspace-primary" onClick={() => setShowVehicleForm(true)}><Plus size={17}/> Adicionar veículo</button>}</div>
        {error && <div className="workspace-alert error" role="alert">{error}</div>}
        {success && <div className="workspace-alert success" role="status">{success}</div>}
        {expiryWarning.map(warning => <div className="workspace-expiry-warning" role="alert" key={warning.sessionId}><span className="workspace-alert-pulse"><Bell size={25}/></span><div className="workspace-alert-copy"><strong>⚠ ATENÇÃO</strong><b className="workspace-alert-title">{warning.plate}</b><span>{warning.body}</span></div><button className="workspace-alert-dismiss" type="button" onClick={() => { setExpiryWarning(current => current.filter(item => item.sessionId !== warning.sessionId)); if (notices.some(item => item.id === warning.sessionId && item.kind === 'admin_manual_alert')) void markRead(warning.sessionId); else window.localStorage.setItem(`vagafacil:expiry-dismissed:${profile.id}:${warning.sessionId}`, '1'); }} aria-label="Marcar aviso como lido e fechar"><X size={19}/></button></div>)}
        {loading ? <div className="workspace-empty">Carregando seus dados...</div> : <>
          {tab === 'overview' && <>
            <div className="workspace-section-title"><div><h2>Estacionamentos em andamento</h2><p>O tempo é atualizado automaticamente.</p></div><button onClick={() => setTab('register')}>Novo registro <Plus size={15}/></button></div>
            {activeSessions.length === 0 ? <div className="workspace-empty"><CarFront size={28}/><strong>Nenhum estacionamento ativo</strong><span>Quando registrar uma vaga, o cronômetro aparecerá aqui.</span><button onClick={() => setTab('register')}>Registrar estacionamento</button></div> : <div className="workspace-session-grid">{activeSessions.map(session => <article className="workspace-session-card" key={session.id}><div className="session-card-top"><span className={`session-live${new Date(session.expires_at).getTime() <= now ? " is-overdue" : ""}`}><i/> {new Date(session.expires_at).getTime() <= now ? "PRAZO EXCEDIDO" : "EM ANDAMENTO"}</span><VehiclePlate value={session.plate_snapshot} compact /></div><strong className={`session-timer${new Date(session.expires_at).getTime() <= now ? " is-overdue" : ""}`}>{new Date(session.expires_at).getTime() <= now ? "+" + timerLabel(Math.max(0, Math.floor((now - new Date(session.expires_at).getTime()) / 1000))) : timerLabel(remaining(session.expires_at, now))}</strong><small>{new Date(session.expires_at).getTime() <= now ? "Tempo excedido · cronômetro continua" : "Tempo restante"}</small>{new Date(session.expires_at).getTime() <= now && <div className="workspace-overdue-message" role="alert"><strong>Período permitido excedido.</strong><span>O estacionamento permanece em aberto até que você ou a administração o encerre.</span></div>}<div className="session-meta"><span><Clock3 size={14}/> Início: {fmtDate(session.started_at)}</span><span><MapPin size={14}/> {session.parking_spaces?.code || 'Vaga não informada'}{session.parking_spaces?.parking_zones?.name ? ` · ${session.parking_spaces.parking_zones.name}` : ''}</span><span>Limite: {fmtDate(session.expires_at)}</span><span>Categoria: {session.beneficiary_category === 'elderly' ? 'Idoso · até 2 horas' : session.beneficiary_category === 'accessible' ? 'Pessoa com deficiência · até 2 horas' : 'Convencional · até 1 hora'}</span></div><button className="workspace-danger-outline" disabled={busy} onClick={() => finishSession(session.id)}><X size={15}/> Encerrar estacionamento</button></article>)}</div>}
            <div className="workspace-metrics"><article><span>Veículos cadastrados</span><strong>{vehicles.length}</strong><CarFront size={21}/></article><article><span>Estacionamentos ativos</span><strong>{activeSessions.length}</strong><Activity size={21}/></article><article><span>Notificações não lidas</span><strong>{unread}</strong><Bell size={21}/></article></div>
            <div className="workspace-section-title"><div><h2>Atividade recente</h2><p>Últimos registros da sua conta.</p></div><button onClick={() => setTab('history')}>Ver histórico <History size={15}/></button></div>
            <SessionTable sessions={sessions.slice(0,5)} now={now}/>
          </>}
          {tab === 'register' && <div className="workspace-form-card"><div className="workspace-form-intro"><span className="workspace-form-icon"><MapPin size={23}/></span><div><h2>Registrar chegada</h2><p>Selecione o veículo e, se disponível, identifique a vaga onde estacionou.</p></div></div>{vehicles.length === 0 ? <div className="workspace-empty"><CarFront size={26}/><strong>Cadastre um veículo primeiro</strong><button onClick={() => {setTab('vehicles');setShowVehicleForm(true);}}>Cadastrar veículo</button></div> : <><label>Veículo<select value={selectedVehicle} onChange={e=>setSelectedVehicle(e.target.value)}>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {[v.make,v.model].filter(Boolean).join(' ') || 'Veículo'}</option>)}</select></label><fieldset className="workspace-beneficiary"><legend>Identificação do usuário</legend><p>Selecione uma opção para aplicar o tempo de permanência correspondente.</p><div className="workspace-beneficiary-options"><label className={beneficiaryCategory === 'conventional' ? 'selected' : ''}><input type="radio" name="beneficiary-category" value="conventional" checked={beneficiaryCategory === 'conventional'} onChange={() => {setBeneficiaryCategory('conventional');setCredentialConfirmed(false);}}/><span><strong>Uso convencional</strong><small>Até 1 hora</small></span></label><label className={beneficiaryCategory === 'elderly' ? 'selected' : ''}><input type="radio" name="beneficiary-category" value="elderly" checked={beneficiaryCategory === 'elderly'} onChange={() => {setBeneficiaryCategory('elderly');setCredentialConfirmed(false);}}/><span><strong>Idoso</strong><small>Até 2 horas</small></span></label><label className={beneficiaryCategory === 'accessible' ? 'selected' : ''}><input type="radio" name="beneficiary-category" value="accessible" checked={beneficiaryCategory === 'accessible'} onChange={() => {setBeneficiaryCategory('accessible');setCredentialConfirmed(false);}}/><span><strong>Pessoa com deficiência</strong><small>Até 2 horas</small></span></label></div>{beneficiaryCategory !== 'conventional' && <div className="workspace-credential-notice" role="note"><strong>Uso condicionado à credencial obrigatória</strong><p>As vagas destinadas a idosos e pessoas com deficiência somente podem ser utilizadas por quem cumprir os requisitos legais aplicáveis e estiver de posse e em uso de credencial de estacionamento válida, emitida pelo órgão de trânsito competente. A credencial deve ser utilizada conforme as regras do órgão emissor. A seleção desta categoria não dispensa a apresentação da credencial em eventual fiscalização.</p><label className="workspace-credential-confirm"><input type="checkbox" checked={credentialConfirmed} onChange={e=>setCredentialConfirmed(e.target.checked)}/><span>Declaro que atendo aos requisitos legais e que estou utilizando credencial válida emitida pelo órgão de trânsito competente.</span></label></div>}</fieldset><label>Vaga (opcional)<select value={selectedSpace} onChange={e=>setSelectedSpace(e.target.value)}><option value="">Não informar agora</option>{spaces.map(s=><option key={s.id} value={s.id}>{s.code}{s.parking_zones?.name ? ` · ${s.parking_zones.name}` : ''}</option>)}</select></label><div className="workspace-rule-callout"><MapPin size={19}/><span><strong>Localização registrada automaticamente</strong><small>Ao confirmar, o navegador solicitará acesso ao GPS. Latitude, longitude e precisão estimada serão salvas com este estacionamento. A localização não será acompanhada continuamente.</small></span></div><div className="workspace-rule-callout"><Clock3 size={19}/><span><strong>{beneficiaryCategory === 'conventional' ? 'Até 1 hora gratuita' : 'Até 2 horas gratuitas'}</strong><small>O registro pode ser feito em qualquer dia e horário. Após a confirmação, o cronômetro contará o tempo de permanência da categoria selecionada.</small></span></div><button className="workspace-primary workspace-full" disabled={busy || !selectedVehicle || activeSessions.length > 0 || (beneficiaryCategory !== 'conventional' && !credentialConfirmed)} onClick={startSession}>{busy ? 'Registrando...' : 'Confirmar estacionamento'} <CheckCircle2 size={17}/></button>{activeSessions.length > 0 && <p className="workspace-inline-note">Você já possui um estacionamento em andamento.</p>}</>}</div>}
          {tab === 'vehicles' && <><div className="workspace-vehicle-grid">{vehicles.map(vehicle=><article className="workspace-vehicle-card" key={vehicle.id}><span><CarFront size={22}/></span><div><VehiclePlate value={vehicle.plate} /><small>{[vehicle.make,vehicle.model].filter(Boolean).join(' ') || 'Modelo não informado'}</small><small>{[vehicle.color,vehicle.vehicle_type].filter(Boolean).join(' · ')}</small></div><button title="Remover veículo" onClick={()=>removeVehicle(vehicle)} disabled={busy}><Trash2 size={16}/></button></article>)}</div>{vehicles.length === 0 && <div className="workspace-empty"><CarFront size={28}/><strong>Nenhum veículo cadastrado</strong><span>Adicione seu primeiro veículo para registrar estacionamentos.</span></div>}</>}
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
  return <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Veículo</th><th>Início</th><th>Limite</th><th>Vaga</th><th>Categoria</th><th>Situação</th></tr></thead><tbody>{sessions.map(s=>{const expired=s.status==='expired'||(s.status==='active'&&new Date(s.expires_at).getTime()<=now);const label=s.status==='finished'?'Encerrado':s.status==='cancelled'?'Cancelado':expired?'Prazo encerrado':'Em andamento';return <tr key={s.id}><td data-label="Veículo"><VehiclePlate value={s.plate_snapshot} compact /></td><td data-label="Início">{fmtDate(s.started_at)}</td><td data-label="Limite">{fmtDate(s.expires_at)}</td><td data-label="Vaga">{s.parking_spaces?.code || '—'}</td><td data-label="Categoria">{s.beneficiary_category === 'elderly' ? 'Idoso' : s.beneficiary_category === 'accessible' ? 'Pessoa com deficiência' : 'Convencional'}</td><td data-label="Situação"><span className={`session-status ${expired?'expired':s.status}`}>{label}</span></td></tr>;})}</tbody></table></div>;
}
