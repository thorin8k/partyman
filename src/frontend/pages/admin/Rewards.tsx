import { useAuth } from '../../components/AuthContext';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

const touchBtn: React.CSSProperties = { minHeight: '44px', fontSize: '0.625rem', padding: '0.75rem 1rem' };

export function Rewards() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [achievements, setAchievements] = useState<any[]>([]);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [participants, setParticipants] = useState<any[]>([]);
  const [participantQuery, setParticipantQuery] = useState('');
  const [awardForm, setAwardForm] = useState({ participantId: '', achievementId: '', title: '', note: '' });
  const [rules, setRules] = useState<any[]>([]);
  const [history, setHistory] = useState<{ ledger: any[]; awards: any[] } | null>(null);
  const [correction, setCorrection] = useState({ ledgerId: '', points: '', reason: '' });
  const [editingAch, setEditingAch] = useState<any | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) navigate('/admin/login'); else if (!loading && user?.role !== 'admin') navigate('/'); }, [user, loading, navigate]);
  useEffect(() => { if (user?.role === 'admin') { fetchAchievements(); fetchRules(); fetchParticipants(); } }, [user]);
  useEffect(() => { if (awardForm.participantId) fetchHistory(awardForm.participantId); else setHistory(null); }, [awardForm.participantId]);

  const fetchAchievements = async () => { const r = await fetch('/api/admin/achievements'); if (r.ok) setAchievements((await r.json()).achievements); };
  const fetchRules = async () => { const r = await fetch('/api/admin/point-rules'); if (r.ok) setRules((await r.json()).rules); };
  const fetchParticipants = async () => { const r = await fetch('/api/admin/participants'); if (r.ok) setParticipants((await r.json()).participants || []); };
  const fetchHistory = async (pid: string) => {
    const r = await fetch(`/api/participants/${pid}/history`).catch(() => null);
    if (r && r.ok) setHistory(await r.json());
    else setHistory(null);
  };

  const showOk = (m: string) => { setMsg(m); setErr(null); };
  const showErr = (m: string) => { setErr(m); setMsg(null); };

  const handleCreateAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/admin/achievements', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify(form) });
    if (res.ok) { setForm({ code: '', name: '', description: '' }); fetchAchievements(); showOk('Logro creado.'); }
    else { const d = await res.json().catch(() => ({})); showErr(d.error?.message || 'Error al crear el logro.'); }
  };

  const handleSaveAchievement = async () => {
    if (!editingAch) return;
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/achievements/${editingAch.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ name: editingAch.name, description: editingAch.description || null }) });
    if (res.ok) { setEditingAch(null); fetchAchievements(); showOk('Logro actualizado.'); }
    else showErr('Error al actualizar el logro.');
  };

  const handleAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!awardForm.participantId) { showErr('Elige un participante.'); return; }
    if (!awardForm.achievementId && !awardForm.title.trim()) { showErr('Indica un título o elige un logro.'); return; }
    if (awardForm.note.length > 500) { showErr('La nota no puede superar 500 caracteres.'); return; }
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const body: any = { participantId: parseInt(awardForm.participantId), note: awardForm.note || undefined };
    if (awardForm.achievementId) body.achievementId = parseInt(awardForm.achievementId);
    if (awardForm.title.trim()) body.title = awardForm.title.trim();
    const res = await fetch('/api/admin/awards', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify(body) });
    if (res.ok) { showOk('Premio otorgado.'); setAwardForm({ participantId: '', achievementId: '', title: '', note: '' }); setHistory(null); }
    else { const d = await res.json().catch(() => ({})); showErr(d.error?.message || 'Error al otorgar el premio.'); }
  };

  const handleToggleRule = async (r: any) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/admin/point-rules/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ enabled: !r.enabled }) });
    fetchRules();
  };

  const handleCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correction.ledgerId) { showErr('Elige el apunte a corregir.'); return; }
    const pts = parseInt(correction.points);
    if (!Number.isInteger(pts) || pts === 0) { showErr('Los puntos deben ser un entero distinto de cero.'); return; }
    if (!correction.reason.trim()) { showErr('Indica el motivo de la corrección.'); return; }
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/admin/point-corrections', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ ledgerId: parseInt(correction.ledgerId), points: pts, reason: correction.reason.trim() }) });
    if (res.ok) { showOk('Corrección aplicada.'); setCorrection({ ledgerId: '', points: '', reason: '' }); if (awardForm.participantId) fetchHistory(awardForm.participantId); }
    else { const d = await res.json().catch(() => ({})); showErr(d.error?.message || d.error?.code || 'Error al corregir.'); }
  };

  if (loading || !user || user.role !== 'admin') return <div className="container"><div className="loading">Cargando…</div></div>;

  const filtered = participants.filter(p => !participantQuery.trim() || p.displayName.toLowerCase().includes(participantQuery.toLowerCase()));

  return (
    <div className="container">
      <div className="header"><h1>RECOMPENSAS</h1><div className="nav"><a href="/admin">VOLVER →</a></div></div>
      {msg && <div className="alert success">{msg} <button onClick={() => setMsg(null)} style={{ ...touchBtn, marginLeft: '0.5rem' }}>X</button></div>}
      {err && <div className="alert error">{err} <button onClick={() => setErr(null)} style={{ ...touchBtn, marginLeft: '0.5rem' }}>X</button></div>}
      <div className="card">
        <h2>REGLAS DE PUNTOS</h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Afectan solo a futuros premios. No recalculan historial.</p>
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rules.map((r: any) => (
            <div key={r.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h3 style={{ fontSize: '0.875rem' }}>{r.label} ({r.code})</h3><p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{r.points} pts {r.enabled ? '· activo' : '· desactivado'}</p></div>
              <button onClick={() => handleToggleRule(r)} style={{ ...touchBtn, borderColor: r.enabled ? 'var(--neon-green)' : 'var(--muted)', color: r.enabled ? 'var(--neon-green)' : 'var(--muted)' }}>{r.enabled ? 'DESACTIVAR' : 'ACTIVAR'}</button>
            </div>
          ))}
          {rules.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Sin reglas</p>}
        </div>
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>LOGROS</h2>
        <form onSubmit={handleCreateAchievement} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <input placeholder="Código" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required style={{ flex: 1 }} />
          <input placeholder="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required style={{ flex: 1 }} />
          <input placeholder="Descripción" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ flex: 1 }} />
          <button type="submit" className="primary" style={touchBtn}>CREAR</button>
        </form>
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {achievements.map((a: any) => (
            <div key={a.id} className="list-item">
              {editingAch?.id === a.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input value={editingAch.name} onChange={e => setEditingAch({ ...editingAch, name: e.target.value })} maxLength={120} />
                  <input value={editingAch.description || ''} onChange={e => setEditingAch({ ...editingAch, description: e.target.value })} placeholder="Descripción" maxLength={500} />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="primary" onClick={handleSaveAchievement} style={touchBtn}>GUARDAR</button>
                    <button onClick={() => setEditingAch(null)} style={touchBtn}>CANCELAR</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><h3>{a.name}</h3><p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{a.code} — {a.description}</p></div>
                  <button onClick={() => setEditingAch({ id: a.id, name: a.name, description: a.description || '' })} style={touchBtn}>EDITAR</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>OTORGAR PREMIO</h2>
        <form onSubmit={handleAward} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <label>PARTICIPANTE *</label>
          <input placeholder="Buscar participante…" value={participantQuery} onChange={e => setParticipantQuery(e.target.value)} />
          <select value={awardForm.participantId} onChange={e => setAwardForm({ ...awardForm, participantId: e.target.value })} required>
            <option value="">Seleccionar participante…</option>
            {filtered.map((p: any) => <option key={p.id} value={String(p.id)}>{p.displayName}</option>)}
          </select>
          <label>LOGRO (OPCIONAL)</label>
          <select value={awardForm.achievementId} onChange={e => setAwardForm({ ...awardForm, achievementId: e.target.value })}>
            <option value="">Sin logro (título manual)…</option>
            {achievements.map((a: any) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </select>
          <input placeholder="Título (requerido si no hay logro)" value={awardForm.title} onChange={e => setAwardForm({ ...awardForm, title: e.target.value })} maxLength={120} />
          <input placeholder="Nota (opcional, máx 500)" value={awardForm.note} onChange={e => setAwardForm({ ...awardForm, note: e.target.value })} maxLength={500} />
          <button type="submit" className="primary" style={touchBtn}>OTORGAR</button>
        </form>
        {history && history.awards.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Premios recientes de este participante:</p>
            {history.awards.slice(0, 5).map((a: any) => <div key={a.id} className="list-item"><h3 style={{ fontSize: '0.875rem' }}>{a.title}</h3><p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{a.note || ''}</p></div>)}
          </div>
        )}
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>CORRECCIÓN DE PUNTOS</h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Elige participante y apunte. Inserta entrada compensatoria, no borra el original.</p>
        <form onSubmit={handleCorrection} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <select value={correction.ledgerId} onChange={e => setCorrection({ ...correction, ledgerId: e.target.value })} required>
            <option value="">{history ? `Apuntes de ${history.ledger.length} disponibles…` : 'Primero elige participante arriba…'}</option>
            {(history?.ledger || []).map((l: any) => <option key={l.id} value={String(l.id)}>#{l.id} · {l.reason} · {l.points} pts · {String(l.created_at).slice(0, 10)}</option>)}
          </select>
          <input placeholder="Puntos (ej. -10)" type="number" value={correction.points} onChange={e => setCorrection({ ...correction, points: e.target.value })} required />
          <input placeholder="Motivo" value={correction.reason} onChange={e => setCorrection({ ...correction, reason: e.target.value })} required maxLength={500} />
          <button type="submit" className="primary" style={touchBtn}>CORREGIR</button>
        </form>
      </div>
    </div>
  );
}
