import { useAuth } from '../../components/AuthContext';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

export function Rewards() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [achievements, setAchievements] = useState<any[]>([]);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [awardForm, setAwardForm] = useState({ participantId: '', achievementId: '', title: '', note: '' });
  const [rules, setRules] = useState<any[]>([]);
  const [correction, setCorrection] = useState({ ledgerId: '', points: '', reason: '' });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) navigate('/admin/login'); else if (!loading && user?.role !== 'admin') navigate('/'); }, [user, loading, navigate]);
  useEffect(() => { if (user?.role === 'admin') { fetchAchievements(); fetchRules(); } }, [user]);

  const fetchAchievements = async () => { const r = await fetch('/api/admin/achievements'); if (r.ok) setAchievements((await r.json()).achievements); };
  const fetchRules = async () => { const r = await fetch('/api/admin/point-rules'); if (r.ok) setRules((await r.json()).rules); };

  const handleCreateAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/admin/achievements', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify(form) });
    if (res.ok) { setForm({ code: '', name: '', description: '' }); fetchAchievements(); }
    else { const d = await res.json(); setMsg(d.error?.message || d.error || 'Error'); }
  };

  const handleAward = async (e: React.FormEvent) => {
    e.preventDefault();
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const body:any = { participantId: parseInt(awardForm.participantId), title: awardForm.title || undefined, note: awardForm.note || undefined };
    if (awardForm.achievementId) body.achievementId = parseInt(awardForm.achievementId);
    const res = await fetch('/api/admin/awards', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify(body) });
    if (res.ok) { setMsg('Premio otorgado'); setAwardForm({ participantId: '', achievementId: '', title: '', note: '' }); }
    else { const d = await res.json(); setMsg(d.error?.message || d.error || 'Error'); }
  };

  const handleToggleRule = async (r:any) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/admin/point-rules/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ enabled: !r.enabled }) });
    fetchRules();
  };

  const handleCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/admin/point-corrections', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ ledgerId: parseInt(correction.ledgerId), points: parseInt(correction.points), reason: correction.reason }) });
    if (res.ok) { setMsg('Corrección aplicada'); setCorrection({ ledgerId: '', points: '', reason: '' }); }
    else { const d = await res.json(); setMsg(d.error?.message || d.error?.code || 'Error'); }
  };

  if (loading || !user || user.role !== 'admin') return null;

  return (
    <div className="container">
      <div className="header"><h1>RECOMPENSAS</h1><div className="nav"><a href="/admin">VOLVER →</a></div></div>
      {msg && <div className="alert" style={{ marginBottom: '1rem', border: '1px solid var(--neon-cyan)', padding: '0.5rem' }}>{msg}</div>}
      <div className="card">
        <h2>REGLAS DE PUNTOS</h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Afectan solo a futuros premios. No recalculan historial.</p>
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rules.map((r:any) => (
            <div key={r.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h3 style={{ fontSize: '0.875rem' }}>{r.label} ({r.code})</h3><p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{r.points} pts {r.enabled ? '· activo' : '· desactivado'}</p></div>
              <button onClick={() => handleToggleRule(r)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', borderColor: r.enabled ? 'var(--neon-green)' : 'var(--muted)', color: r.enabled ? 'var(--neon-green)' : 'var(--muted)' }}>{r.enabled ? 'DESACTIVAR' : 'ACTIVAR'}</button>
            </div>
          ))}
          {rules.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Sin reglas</p>}
        </div>
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>LOGROS</h2>
        <form onSubmit={handleCreateAchievement} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <input placeholder="Código" value={form.code} onChange={e => setForm({...form, code: e.target.value})} required style={{ flex: 1 }} />
          <input placeholder="Nombre" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required style={{ flex: 1 }} />
          <input placeholder="Descripción" value={form.description} onChange={e => setForm({...form, description: e.target.value})} style={{ flex: 1 }} />
          <button type="submit" className="primary" style={{ fontSize: '0.5rem' }}>CREAR</button>
        </form>
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {achievements.map((a:any) => <div key={a.id} className="list-item"><h3>{a.name}</h3><p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{a.code} — {a.description}</p></div>)}
        </div>
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>OTORGAR PREMIO</h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Requiere participantId y título o achievementId. Nota máx 500.</p>
        <form onSubmit={handleAward} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <input placeholder="Participant ID" value={awardForm.participantId} onChange={e => setAwardForm({...awardForm, participantId: e.target.value})} required />
          <input placeholder="Achievement ID (opcional)" value={awardForm.achievementId} onChange={e => setAwardForm({...awardForm, achievementId: e.target.value})} />
          <input placeholder="Título (requerido si no hay achievementId)" value={awardForm.title} onChange={e => setAwardForm({...awardForm, title: e.target.value})} />
          <input placeholder="Nota (opcional, máx 500)" value={awardForm.note} onChange={e => setAwardForm({...awardForm, note: e.target.value})} maxLength={500} />
          <button type="submit" className="primary" style={{ fontSize: '0.5rem' }}>OTORGAR</button>
        </form>
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>CORRECCIÓN DE PUNTOS</h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Inserta una entrada compensatoria (correction_of). No borra el original. points != 0.</p>
        <form onSubmit={handleCorrection} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <input placeholder="Ledger ID a corregir" value={correction.ledgerId} onChange={e => setCorrection({...correction, ledgerId: e.target.value})} required />
          <input placeholder="Puntos (ej. -10)" type="number" value={correction.points} onChange={e => setCorrection({...correction, points: e.target.value})} required />
          <input placeholder="Motivo" value={correction.reason} onChange={e => setCorrection({...correction, reason: e.target.value})} required maxLength={500} />
          <button type="submit" className="primary" style={{ fontSize: '0.5rem' }}>CORREGIR</button>
        </form>
      </div>
    </div>
  );
}
