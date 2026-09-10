import { useAuth } from '../../components/AuthContext';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

const touchBtn: React.CSSProperties = { minHeight: '44px', fontSize: '0.625rem', padding: '0.75rem 1rem' };

// ponytail: etiquetas humanas para el ledger; el resto de códigos se muestra tal cual.
const REASON_ES: Record<string, string> = {
  party_participation: 'Participación',
  tournament_win: 'Victoria',
  tournament_runner_up: 'Subcampeón',
  activity_participation: 'Actividad',
  tournament_participation: 'Torneo jugado',
};

const reasonLabel = (l: any) => l.correction_of ? `Corrección (${l.reason})` : (REASON_ES[l.reason] || l.reason);
const fmtDate = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? '' : new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit' }).format(d); };
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'logro';

export function Rewards() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [achievements, setAchievements] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [ruleEdits, setRuleEdits] = useState<Record<number, { points: number; enabled: boolean }>>({});
  const [query, setQuery] = useState('');
  const [award, setAward] = useState({ participantId: '', achievementId: '', title: '', note: '' });
  const [newAch, setNewAch] = useState('');
  const [editAch, setEditAch] = useState<{ id: number; name: string } | null>(null);
  const [correctPid, setCorrectPid] = useState('');
  const [ledger, setLedger] = useState<any[]>([]);
  const [motive, setMotive] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) navigate('/admin/login'); else if (!loading && user?.role !== 'admin') navigate('/'); }, [user, loading, navigate]);
  useEffect(() => { if (user?.role === 'admin') { fetchAchievements(); fetchParticipants(); fetchRules(); } }, [user]);
  useEffect(() => {
    if (!correctPid) { setLedger([]); return; }
    fetch(`/api/participants/${correctPid}/history`).then(async r => { if (r.ok) setLedger((await r.json()).ledger || []); }).catch(() => {});
  }, [correctPid]);

  const fetchAchievements = async () => { const r = await fetch('/api/admin/achievements'); if (r.ok) setAchievements((await r.json()).achievements); };
  const fetchParticipants = async () => { const r = await fetch('/api/admin/participants'); if (r.ok) setParticipants((await r.json()).participants || []); };
  const fetchRules = async () => {
    const r = await fetch('/api/admin/point-rules');
    if (!r.ok) return;
    const list = (await r.json()).rules || [];
    setRules(list);
    setRuleEdits(Object.fromEntries(list.map((x: any) => [x.id, { points: x.points, enabled: !!x.enabled }])));
  };
  const showOk = (m: string) => { setMsg(m); setErr(null); };
  const showErr = (m: string) => { setErr(m); setMsg(null); };
  const csrf = () => document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1] || '';

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAch.trim()) return;
    const res = await fetch('/api/admin/achievements', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf() }, body: JSON.stringify({ code: slug(newAch), name: newAch.trim() }) });
    if (res.ok) { setNewAch(''); fetchAchievements(); showOk('Logro creado.'); }
    else showErr('Ese logro ya existe o no es válido.');
  };

  const handleSaveAch = async () => {
    if (!editAch || !editAch.name.trim()) { setEditAch(null); return; }
    const res = await fetch(`/api/admin/achievements/${editAch.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf() }, body: JSON.stringify({ name: editAch.name.trim() }) });
    if (res.ok) { setEditAch(null); fetchAchievements(); showOk('Logro actualizado.'); }
    else showErr('No se pudo actualizar el logro.');
  };

  const handleAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!award.participantId) { showErr('Elige un participante.'); return; }
    const ach = achievements.find(a => String(a.id) === award.achievementId);
    if (!ach && !award.title.trim()) { showErr('Elige un logro o escribe un título.'); return; }
    const res = await fetch('/api/admin/awards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf() },
      body: JSON.stringify({
        participantId: parseInt(award.participantId),
        achievementId: award.achievementId ? parseInt(award.achievementId) : undefined,
        title: award.title.trim() || ach?.name,
        note: award.note || undefined,
      }),
    });
    if (res.ok) { showOk(`«${award.title.trim() || ach?.name}» otorgado.`); setAward({ participantId: '', achievementId: '', title: '', note: '' }); }
    else showErr('No se pudo otorgar.');
  };

  const handleRule = async (rule: any) => {
    const edit = ruleEdits[rule.id];
    if (!edit) return;
    const res = await fetch(`/api/admin/point-rules/${rule.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf() }, body: JSON.stringify({ points: edit.points, enabled: edit.enabled }) });
    if (res.ok) { fetchRules(); showOk('Regla actualizada (solo futuros premios).'); }
    else showErr('No se pudo actualizar la regla.');
  };

  const handleUndo = async (l: any) => {
    if (!(await confirmDialog(`¿Anular ${reasonLabel(l)} (${l.points} pts)?`, { confirmLabel: 'ANULAR', danger: true }))) return;
    const res = await fetch('/api/admin/point-corrections', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf() }, body: JSON.stringify({ ledgerId: l.id, points: -l.points, reason: motive.trim() || 'Anulación por admin' }) });
    if (res.ok) {
      showOk('Puntos anulados.');
      const r = await fetch(`/api/participants/${correctPid}/history`);
      if (r.ok) setLedger((await r.json()).ledger || []);
    } else showErr('No se pudo anular (quizá ya lo está).');
  };

  if (loading) return <div className="container"><div className="loading">Cargando…</div></div>;
  if (!user || user.role !== 'admin') return <div className="container"><div className="loading">Redirigiendo…</div></div>;

  const filtered = participants.filter(p => !query.trim() || p.displayName.toLowerCase().includes(query.toLowerCase()));
  const correctedIds = new Set(ledger.filter(l => l.correction_of).map(l => l.correction_of));
  const visible = ledger.filter(l => !l.correction_of);

  return (
    <div className="container">
      <div className="header"><h1>PREMIOS</h1><div className="nav"><a href="/admin">VOLVER →</a></div></div>
      {msg && <div className="alert success">{msg}</div>}
      {err && <div className="alert error">{err}</div>}

      <div className="card">
        <h2>OTORGAR LOGRO</h2>
        <form onSubmit={handleAward} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <input placeholder="Buscar participante…" value={query} onChange={e => setQuery(e.target.value)} />
          <select value={award.participantId} onChange={e => setAward({ ...award, participantId: e.target.value })} required style={{ minHeight: '44px' }}>
            <option value="">Participante…</option>
            {filtered.map((p: any) => <option key={p.id} value={String(p.id)}>{p.displayName}</option>)}
          </select>
          <select value={award.achievementId} onChange={e => setAward({ ...award, achievementId: e.target.value })} style={{ minHeight: '44px' }}>
            <option value="">Logro (o escribe un título)…</option>
            {achievements.map((a: any) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </select>
          <input placeholder="Título libre (opcional)" value={award.title} onChange={e => setAward({ ...award, title: e.target.value })} maxLength={120} />
          <input placeholder="Nota (opcional)" value={award.note} onChange={e => setAward({ ...award, note: e.target.value })} maxLength={500} />
          <button type="submit" className="primary" style={touchBtn}>OTORGAR</button>
        </form>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>REGLAS DE PUNTOS</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.25rem' }}>Los cambios solo afectan a premios futuros.</p>
        {rules.map((rule: any) => {
          const edit = ruleEdits[rule.id] || { points: rule.points, enabled: !!rule.enabled };
          return (
            <div key={rule.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <span>{rule.label}</span>
              <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="number"
                  value={edit.points}
                  onChange={e => setRuleEdits({ ...ruleEdits, [rule.id]: { ...edit, points: parseInt(e.target.value) || 0 } })}
                  style={{ width: '5rem', minHeight: '44px' }}
                />
                <label style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.75rem' }}>
                  <input type="checkbox" checked={edit.enabled} onChange={e => setRuleEdits({ ...ruleEdits, [rule.id]: { ...edit, enabled: e.target.checked } })} />
                  activa
                </label>
                <button onClick={() => handleRule(rule)} style={touchBtn}>GUARDAR</button>
              </span>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>CORREGIR PUNTOS</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <select value={correctPid} onChange={e => setCorrectPid(e.target.value)} style={{ minHeight: '44px' }}>
            <option value="">Participante…</option>
            {participants.map((p: any) => <option key={p.id} value={String(p.id)}>{p.displayName}</option>)}
          </select>
          {correctPid && visible.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Sin movimientos.</p>}
          {visible.map((l: any) => (
            <div key={l.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{reasonLabel(l)} <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>· {fmtDate(l.created_at)}</span></span>
              <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: l.points < 0 ? 'var(--error)' : 'var(--neon-green)' }}>{l.points > 0 ? `+${l.points}` : l.points}</span>
                {correctedIds.has(l.id)
                  ? <span style={{ fontSize: '0.625rem', color: 'var(--text-dim)' }}>ANULADO</span>
                  : <button onClick={() => handleUndo(l)} style={{ ...touchBtn, borderColor: 'var(--error)', color: 'var(--error)' }}>ANULAR</button>}
              </span>
            </div>
          ))}
          {visible.length > 0 && <input placeholder="Motivo (opcional)" value={motive} onChange={e => setMotive(e.target.value)} maxLength={500} />}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>LOGROS ({achievements.length})</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <input placeholder="Nombre del nuevo logro…" value={newAch} onChange={e => setNewAch(e.target.value)} maxLength={120} style={{ flex: 1 }} />
          <button type="submit" className="primary" style={touchBtn}>CREAR</button>
        </form>
        <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {achievements.map((a: any) => (
            editAch && editAch.id === a.id ? (
              <span key={a.id} style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                <input value={editAch.name} onChange={e => setEditAch({ id: a.id, name: e.target.value })} maxLength={120} style={{ minHeight: '44px' }} autoFocus />
                <button onClick={handleSaveAch} style={touchBtn}>OK</button>
                <button onClick={() => setEditAch(null)} style={touchBtn}>X</button>
              </span>
            ) : (
              <span key={a.id} style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', fontSize: '0.875rem', padding: '0.25rem 0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                {a.name}
                <button onClick={() => setEditAch({ id: a.id, name: a.name })} style={{ padding: '0 0.25rem', minHeight: 'auto', fontSize: '0.75rem' }} title="Editar">✎</button>
              </span>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
