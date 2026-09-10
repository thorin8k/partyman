import { useAuth } from '../../components/AuthContext';
import { apiError } from '../../components/apiError';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

interface Activity {
  id: number;
  partyId: number;
  gameId: number | null;
  gameTitleSnapshot: string | null;
  gameImage: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  notes: string | null;
  status: string;
  participantCount: number;
  participants: Array<{ id: number; displayName: string }>;
}

interface Game { id: number; title: string; }

export function AdminPlanning() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [proposals, setProposals] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [partyId, setPartyId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', gameId: '', startsAt: '', endsAt: '', capacity: '', notes: '' });

  useEffect(() => {
    if (!loading && !user) navigate('/admin/login');
    else if (!loading && user?.role !== 'admin') navigate('/');
  }, [user, loading, navigate]);

  useEffect(() => { if (user?.role === 'admin') { fetchParties(); fetchGames(); fetchProposals(); } }, [user]);
  useEffect(() => { if (user?.role === 'admin' && partyId) fetchActivities(partyId); }, [partyId]);

  const fetchParties = async () => {
    const res = await fetch('/api/parties').catch(() => null);
    if (res && res.ok) {
      const list = (await res.json()).parties || [];
      setParties(list);
      const active = list.find((p: any) => p.status === 'active');
      setPartyId(active ? String(active.id) : (list[0] ? String(list[0].id) : ''));
    }
  };

  const fetchProposals = async () => {
    const res = await fetch('/api/activity-proposals');
    if (res.ok) setProposals((await res.json()).proposals || []);
  };

  const handleApprove = async (id: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/activity-proposals/${id}/approve`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (res.ok) { fetchProposals(); if (partyId) fetchActivities(partyId); }
  };

  const handleReject = async (id: number) => {
    if (!confirm('¿Rechazar esta propuesta?')) return;
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/activity-proposals/${id}`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } });
    fetchProposals();
  };

  const fetchActivities = async (pid?: string) => {
    const id = pid || partyId;
    if (!id) {
      const partyRes = await fetch('/api/parties/active');
      const partyData = await partyRes.json();
      if (!partyData.party) return;
      setPartyId(String(partyData.party.id));
      const res = await fetch(`/api/admin/parties/${partyData.party.id}/activities`);
      if (res.ok) setActivities((await res.json()).activities);
      return;
    }
    const res = await fetch(`/api/admin/parties/${id}/activities`);
    if (res.ok) setActivities((await res.json()).activities);
  };

  const fetchGames = async () => {
    const res = await fetch('/api/admin/games');
    if (res.ok) setGames((await res.json()).games);
  };

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity);
    setForm({
      title: activity.title,
      gameId: activity.gameId?.toString() || '',
      startsAt: new Date(activity.startsAt).toISOString().slice(0, 16),
      endsAt: new Date(activity.endsAt).toISOString().slice(0, 16),
      capacity: activity.capacity?.toString() || '',
      notes: '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const body = {
      title: form.title,
      gameId: form.gameId ? parseInt(form.gameId) : null,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      capacity: form.capacity ? parseInt(form.capacity) : null,
      notes: form.notes || null,
    };
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];

    if (editingActivity) {
      const res = await fetch(`/api/admin/activities/${editingActivity.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify(body),
      });
      if (res.ok) { setShowForm(false); setEditingActivity(null); setForm({ title: '', gameId: '', startsAt: '', endsAt: '', capacity: '', notes: '' }); if (partyId) fetchActivities(partyId); }
      else { const err = await res.json(); setError(apiError(err)); }
      return;
    }

    if (!partyId) { setError('Selecciona una party'); return; }

    const res = await fetch(`/api/admin/parties/${partyId}/activities`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify(body),
    });
    if (res.ok) { setShowForm(false); setForm({ title: '', gameId: '', startsAt: '', endsAt: '', capacity: '', notes: '' }); fetchActivities(partyId); }
    else { const err = await res.json(); setError(apiError(err)); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta actividad?')) return;
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/admin/activities/${id}`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (partyId) fetchActivities(partyId);
  };

  // ponytail: vía de escape manual fuera del automatismo (errores, cambios de plan).
  const handleStatus = async (id: number, status: string, label: string) => {
    if (!confirm(`¿Marcar como ${label}?`)) return;
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/admin/activities/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ status }) });
    if (partyId) fetchActivities(partyId);
  };

  if (loading) return <div className="container"><div className="loading">Cargando…</div></div>;
  if (!user || user.role !== 'admin') return <div className="container"><div className="loading">Redirigiendo…</div></div>;

  return (
    <div className="container">
      <div className="header">
        <h1>ADMIN</h1>
        <div className="nav">
          <a href="/admin">VOLVER →</a>
          <a href="/display" target="_blank">DISPLAY →</a>
          <button onClick={logout} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>SALIR</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ borderColor: 'var(--neon-cyan)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2>PARTY</h2>
          <select value={partyId} onChange={e => setPartyId(e.target.value)} style={{ minWidth: '200px', flex: '1 1 auto', maxWidth: '320px' }}>
            <option value="">Seleccionar party…</option>
            {parties.map((p: any) => <option key={p.id} value={String(p.id)}>{p.name} ({p.status})</option>)}
          </select>
        </div>
      </div>

      {proposals.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--neon-cyan)' }}>
          <h2>PROPUESTAS DE ACTIVIDADES ({proposals.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
            {proposals.map((p: any) => (
              <div key={p.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '0.875rem' }}>{p.title}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{p.gameTitle || 'Sin juego'} · {new Date(p.startsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button onClick={() => handleApprove(p.id)} className="primary" style={{ minHeight: '44px', fontSize: '0.625rem', padding: '0.5rem 0.75rem' }}>APROBAR</button>
                  <button onClick={() => handleReject(p.id)} style={{ minHeight: '44px', fontSize: '0.625rem', padding: '0.5rem 0.75rem' }}>RECHAZAR</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm ? (
        <div className="card">
          <h2>{editingActivity ? 'EDITAR ACTIVIDAD' : 'NUEVA ACTIVIDAD'}</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group"><label>TÍTULO *</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} maxLength={120} required /></div>
            <div className="form-group"><label>JUEGO</label>
              <select value={form.gameId} onChange={e => setForm({...form, gameId: e.target.value})}>
                <option value="">Ninguno</option>
                {games.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group"><label>INICIO *</label><input type="datetime-local" value={form.startsAt} onChange={e => setForm({...form, startsAt: e.target.value})} required /></div>
              <div className="form-group"><label>FIN *</label><input type="datetime-local" value={form.endsAt} onChange={e => setForm({...form, endsAt: e.target.value})} required /></div>
            </div>
            <div className="form-group"><label>CAPACIDAD</label><input type="number" min="1" max="100" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} /></div>
            <div className="form-group"><label>NOTAS</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} /></div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="primary">{editingActivity ? 'GUARDAR' : 'CREAR'}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditingActivity(null); }}>CANCELAR</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2>ACTIVIDADES ({activities.length})</h2>
            <button className="primary" style={{ fontSize: '0.5rem' }} onClick={() => setShowForm(true)}>+ NUEVA ACTIVIDAD</button>
          </div>
          {activities.length === 0 ? (
            <div className="empty-state"><h3>SIN ACTIVIDADES</h3><p style={{ fontSize: '0.875rem' }}>No hay actividades programadas.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {activities.map(a => (
                <div key={a.id} className="list-item" style={{ padding: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {a.gameImage && <img src={a.gameImage} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <h3 style={{ marginBottom: '0.25rem' }}>{a.title}</h3>
                          {(() => {
                            if (a.status === 'cancelled') return <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-display)', color: 'var(--error)', border: '1px solid var(--error)', padding: '0.125rem 0.375rem' }}>CANCELADA</span>;
                            if (a.status === 'finished') return <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-display)', color: 'var(--muted)', border: '1px solid var(--muted)', padding: '0.125rem 0.375rem' }}>FINALIZADA</span>;
                            const now = new Date(); const live = new Date(a.startsAt) <= now && now <= new Date(a.endsAt);
                            return live ? <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-display)', color: 'var(--neon-green)', border: '1px solid var(--neon-green)', padding: '0.125rem 0.375rem' }}>EN CURSO</span> : null;
                          })()}
                        </div>
                        <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                          {a.gameTitleSnapshot ? `${a.gameTitleSnapshot} · ` : ''}
                          {new Date(a.startsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {new Date(a.endsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          {a.capacity ? ` · ${a.participantCount || 0}/${a.capacity}` : ''}
                        </p>
                        {a.notes && <p style={{ margin: '0.25rem 0 0', color: 'var(--text-dim)', fontSize: '0.7rem', fontStyle: 'italic' }}>{a.notes}</p>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {(a.status === 'scheduled' || a.status === 'in_progress') && (
                        <>
                          <button onClick={() => handleStatus(a.id, 'finished', 'FINALIZADA')} style={{ minHeight: '44px', fontSize: '0.625rem', padding: '0.5rem 0.75rem', borderColor: 'var(--neon-green)', color: 'var(--neon-green)' }}>TERMINAR</button>
                          <button onClick={() => handleStatus(a.id, 'cancelled', 'CANCELADA')} style={{ minHeight: '44px', fontSize: '0.625rem', padding: '0.5rem 0.75rem' }}>CANCELAR</button>
                        </>
                      )}
                      {(a.status === 'finished' || a.status === 'cancelled') && (
                        <button onClick={() => handleStatus(a.id, 'scheduled', 'REABIERTA')} style={{ minHeight: '44px', fontSize: '0.625rem', padding: '0.5rem 0.75rem' }}>REABRIR</button>
                      )}
                      <button onClick={() => handleEdit(a)} style={{ minHeight: '44px', fontSize: '0.625rem', padding: '0.5rem 0.75rem' }}>EDITAR</button>
                      <button className="danger" onClick={() => handleDelete(a.id)} style={{ minHeight: '44px', fontSize: '0.625rem', padding: '0.5rem 0.75rem' }}>ELIMINAR</button>
                    </div>
                  </div>
                  {a.participants && a.participants.length > 0 && (
                    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '0.625rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>INSCRITOS ({a.participants.length}):</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {a.participants.map(p => (
                          <span key={p.id} style={{ fontSize: '0.75rem', padding: '0.125rem 0.5rem', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>{p.displayName}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
