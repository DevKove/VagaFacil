import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Ad = { id: string; title: string; alt_text: string; image_path: string; link_url: string | null; sort_order: number; duration_seconds: number };

export default function AdsCarousel() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase!.from('ads').select('id,title,alt_text,image_path,link_url,sort_order,duration_seconds').eq('active', true).order('sort_order').order('created_at');
      if (!error && alive) {
        setAds((data || []) as Ad[]);
        setActiveIndex(index => Math.min(index, Math.max(0, (data || []).length - 1)));
      }
    };
    void load();
    const channel = supabase.channel('citizen-ads').on('postgres_changes', { event: '*', schema: 'public', table: 'ads' }, () => void load()).subscribe();
    return () => { alive = false; void supabase!.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (ads.length < 2) return;
    const current = ads[activeIndex];
    const duration = Math.min(120, Math.max(1, Number(current?.duration_seconds) || 5)) * 1000;
    const timer = window.setTimeout(() => setActiveIndex(index => (index + 1) % ads.length), duration);
    return () => window.clearTimeout(timer);
  }, [ads, activeIndex]);

  if (!ads.length || !supabase) return null;
  const ad = ads[activeIndex];
  const imageUrl = supabase.storage.from('vagafacil-ads').getPublicUrl(ad.image_path).data.publicUrl;
  const move = (direction: number) => setActiveIndex(index => (index + direction + ads.length) % ads.length);
  const content = <><img className="citizen-ads-image" src={imageUrl} alt={ad.alt_text || ad.title} loading="eager"/>{ad.title && <span className="citizen-ads-caption">{ad.title}</span>}</>;
  return <section className="citizen-ads" aria-label="Anúncios e comunicados">
    {ad.link_url ? <a key={ad.id} className="citizen-ads-link citizen-ads-slide" href={ad.link_url} target="_blank" rel="noopener noreferrer">{content}</a> : <div key={ad.id} className="citizen-ads-link citizen-ads-slide">{content}</div>}
    {ads.length > 1 && <>
      <button type="button" className="citizen-ads-arrow prev" aria-label="Anúncio anterior" onClick={() => move(-1)}><ChevronLeft size={20}/></button>
      <button type="button" className="citizen-ads-arrow next" aria-label="Próximo anúncio" onClick={() => move(1)}><ChevronRight size={20}/></button>
      <div className="citizen-ads-dots">{ads.map((item,index)=><button key={item.id} type="button" className="citizen-ads-dot" aria-label={`Exibir anúncio ${index+1}`} aria-current={index===activeIndex} onClick={() => setActiveIndex(index)}/>)}</div>
    </>}
  </section>;
}
