import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';

type ScreenInsets = { enabled: boolean; top: number; bottom: number };
const STORAGE_KEY = 'vagafacil:screen-insets:v1';
const DEFAULTS: ScreenInsets = { enabled: true, top: 24, bottom: 24 };

function readSettings(): ScreenInsets {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULTS;
    const parsed = JSON.parse(saved) as Partial<ScreenInsets>;
    const bounded = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 24;
    // A margem inicia sempre habilitada, mesmo que uma sessão anterior a tenha desativado.
    return { enabled: true, top: bounded(parsed.top), bottom: bounded(parsed.bottom) };
  } catch {
    return DEFAULTS;
  }
}

export default function ScreenAdjuster() {
  const [settings, setSettings] = useState<ScreenInsets>(readSettings);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--screen-extra-top', settings.enabled ? `${settings.top}px` : '0px');
    root.style.setProperty('--screen-extra-bottom', settings.enabled ? `${settings.bottom}px` : '0px');
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* O ajuste continua ativo durante a sessão. */ }
  }, [settings]);

  const update = (patch: Partial<ScreenInsets>) => setSettings(current => ({ ...current, ...patch }));

  return <div className="screen-adjuster">
    {open && <section className="screen-adjuster-panel" aria-label="Ajuste da tela">
      <div className="screen-adjuster-heading"><strong>Ajustar tela do aparelho</strong><button type="button" onClick={() => setOpen(false)} aria-label="Fechar ajuste"><X size={17}/></button></div>
      <p>Crie espaços nas bordas para afastar os itens das áreas ocultas pelo recorte ou pelos controles do iPhone.</p>
      <label className="screen-adjuster-toggle"><input type="checkbox" checked={settings.enabled} onChange={event => update({ enabled: event.target.checked })}/> Ativar margens de segurança</label>
      <label className="screen-adjuster-range"><span>Margem superior <output>{settings.top}px</output></span><input type="range" min="0" max="100" step="4" value={settings.top} disabled={!settings.enabled} onChange={event => update({ top: Number(event.target.value) })}/></label>
      <label className="screen-adjuster-range"><span>Margem inferior <output>{settings.bottom}px</output></span><input type="range" min="0" max="100" step="4" value={settings.bottom} disabled={!settings.enabled} onChange={event => update({ bottom: Number(event.target.value) })}/></label>
      <button type="button" className="screen-adjuster-reset" onClick={() => update({ enabled: true, top: 24, bottom: 24 })}>Restaurar padrão</button>
    </section>}
    <button type="button" className="screen-adjuster-trigger" aria-expanded={open} onClick={() => setOpen(value => !value)}><Smartphone size={17}/><span>Ajustar tela</span></button>
  </div>;
}
