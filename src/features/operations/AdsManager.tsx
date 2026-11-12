import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Download, Edit3, FileText, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportDataset } from '../../utils/export';

type Ad = { id: string; title: string; alt_text: string; image_path: string; link_url: string | null; active: boolean; sort_order: number; duration_seconds: number; created_at: string };
type AdForm = { title: string; alt_text: string; link_url: string; active: boolean; sort_order: number; duration_seconds: number };
const emptyForm: AdForm = { title: '', alt_text: '', link_url: '', active: true, sort_order: 0, duration_seconds: 5 };
const bucket = 'vagafacil-ads';

export default function AdsManager() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [form, setForm] = useState<AdForm>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: queryError } = await supabase.from('ads').select('*').order('sort_order').order('created_at', { ascending: false });
    if (queryError) setError(queryError.message); else setAds((data || []) as Ad[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!file) { setPreview(editing && supabase ? supabase.storage.from(bucket).getPublicUrl(editing.image_path).data.publicUrl : ''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, editing]);

  const reset = () => { setEditing(null); setForm(emptyForm); setFile(null); setPreview(''); };
  const chooseEdit = (ad: Ad) => { setEditing(ad); setForm({ title: ad.title, alt_text: ad.alt_text, link_url: ad.link_url || '', active: ad.active, sort_order: ad.sort_order, duration_seconds: ad.duration_seconds || 5 }); setFile(null); setError(''); setSuccess(''); };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    if (!editing && !file) { setError('Selecione uma imagem para o anúncio.'); return; }
    if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) { setError('Use uma imagem JPG, PNG ou WebP de até 8 MB.'); return; }
    setBusy(true); setError(''); setSuccess('');
    let uploadedPath: string | null = null;
    try {
      if (file) {
        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        uploadedPath = `ads/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(uploadedPath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const payload = { ...form, title: form.title.trim(), alt_text: form.alt_text.trim(), link_url: form.link_url.trim() || null, ...(uploadedPath ? { image_path: uploadedPath } : {}) };
      const result = editing
        ? await supabase.from('ads').update(payload).eq('id', editing.id)
        : await supabase.from('ads').insert(payload);
      if (result.error) throw result.error;
      if (uploadedPath && editing) await supabase.storage.from(bucket).remove([editing.image_path]);
      reset(); setSuccess(editing ? 'Anúncio atualizado.' : 'Anúncio cadastrado.'); await load();
    } catch (err) {
      if (uploadedPath) await supabase.storage.from(bucket).remove([uploadedPath]);
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o anúncio.');
    } finally { setBusy(false); }
  };

  const remove = async (ad: Ad) => {
    if (!supabase || !window.confirm(`Excluir o anúncio "${ad.title}"?`)) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const { error: deleteError } = await supabase.from('ads').delete().eq('id', ad.id);
      if (deleteError) throw deleteError;
      await supabase.storage.from(bucket).remove([ad.image_path]);
      if (editing?.id === ad.id) reset();
      setSuccess('Anúncio excluído.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível excluir o anúncio.'); }
    finally { setBusy(false); }
  };

  const exportAds = (format: 'pdf' | 'excel') => exportDataset('Anúncios cadastrados',['Título','Texto alternativo','Link de destino','Ordem de exibição','Permanência (segundos)','Situação','Imagem'],ads.map(ad=>[ad.title,ad.alt_text,ad.link_url || '',ad.sort_order,ad.duration_seconds || 5,ad.active?'Ativo':'Inativo',ad.image_path]),format);

  const toggle = async (ad: Ad) => {
    if (!supabase) return;
    setBusy(true); setError('');
    const { error: updateError } = await supabase.from('ads').update({ active: !ad.active }).eq('id', ad.id);
    if (updateError) setError(updateError.message); else await load();
    setBusy(false);
  };

  return <div className="ops-ads-manager">
    <section className="ops-panel">
      <div className="ops-panel-heading"><div><h2>Gerenciamento de Ads</h2><p>Imagens exibidas na área do cidadão; cada anúncio respeita seu próprio tempo de permanência.</p></div><span className="ops-pill info">{ads.length} anúncios</span></div>
      {error && <div className="ops-error" role="alert">{error}</div>}{success && <div className="ops-success" role="status">{success}</div>}
      <form className="ops-ads-form" onSubmit={save}>
        <label>Título / chamada<input value={form.title} maxLength={120} onChange={e=>setForm(v=>({...v,title:e.target.value}))} placeholder="Ex.: Campanha de conscientização"/></label>
        <label>Texto alternativo da imagem<input value={form.alt_text} maxLength={180} required onChange={e=>setForm(v=>({...v,alt_text:e.target.value}))} placeholder="Descreva a imagem"/></label>
        <label>Link de destino (opcional)<input type="url" value={form.link_url} onChange={e=>setForm(v=>({...v,link_url:e.target.value}))} placeholder="https://..."/></label>
        <label>Ordem de exibição<input type="number" min="0" max="9999" value={form.sort_order} onChange={e=>setForm(v=>({...v,sort_order:Number(e.target.value)}))}/></label>
        <label>Tempo de permanência (segundos)<input type="number" min="1" max="120" step="1" required value={form.duration_seconds} onChange={e=>setForm(v=>({...v,duration_seconds:Math.min(120,Math.max(1,Number(e.target.value)||1))}))}/><small>De 1 a 120 segundos para cada anúncio.</small></label>
        <label className="wide">Imagem (JPG, PNG ou WebP · até 8 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0] || null)} required={!editing}/></label>
        {preview && <img className="ops-ads-preview wide" src={preview} alt="Pré-visualização do anúncio"/>}
        <label className="ops-checkbox wide"><input type="checkbox" checked={form.active} onChange={e=>setForm(v=>({...v,active:e.target.checked}))}/> Anúncio ativo e visível aos cidadãos</label>
        <div className="wide" style={{display:'flex',gap:10,flexWrap:'wrap'}}><button className="ops-primary" disabled={busy}><Check size={16}/>{busy?'Salvando...':editing?'Salvar alterações':'Cadastrar anúncio'}</button>{editing && <button type="button" className="ops-small-action" onClick={reset}><X size={16}/> Cancelar edição</button>}</div>
      </form>
    </section>
    <section className="ops-panel"><div className="ops-panel-heading"><div><h2>Anúncios cadastrados</h2><p>Somente anúncios ativos aparecem para os cidadãos.</p></div><div className="ops-ads-export-actions"><button className="ops-small-action" type="button" onClick={()=>exportAds('pdf')} disabled={!ads.length}><FileText size={15}/> PDF</button><button className="ops-small-action" type="button" onClick={()=>exportAds('excel')} disabled={!ads.length}><Download size={15}/> Excel</button><button className="ops-small-action" type="button" onClick={()=>{reset();setError('');setSuccess('');}}><Plus size={16}/> Novo anúncio</button></div></div>
      {loading ? <div className="ops-loading">Carregando anúncios...</div> : ads.length ? <div className="ops-ads-list">{ads.map(ad=>{const url=supabase!.storage.from(bucket).getPublicUrl(ad.image_path).data.publicUrl;return <article className="ops-ads-item" key={ad.id}><img src={url} alt={ad.alt_text}/><div className="ops-ads-item-info"><strong>{ad.title || 'Anúncio sem título'}</strong><small>Ordem {ad.sort_order} · {ad.duration_seconds || 5}s de permanência · {ad.active?'Ativo':'Inativo'}</small><small>{ad.link_url || 'Sem link de destino'}</small></div><div className="ops-ads-item-actions"><button type="button" onClick={()=>chooseEdit(ad)}><Edit3 size={14}/> Editar</button><button type="button" onClick={()=>void toggle(ad)} disabled={busy}>{ad.active?'Desativar':'Ativar'}</button><button type="button" className="danger" onClick={()=>void remove(ad)} disabled={busy}><Trash2 size={14}/> Excluir</button></div></article>})}</div> : <div className="ops-empty">Nenhum anúncio cadastrado. Adicione a primeira imagem para exibir o carrossel aos cidadãos.</div>}
    </section>
  </div>;
}
