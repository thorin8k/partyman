import { useAuth } from '../../components/AuthContext';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { PartyForm } from '../../components/PartyForm';

interface Party {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  status: 'planned' | 'active' | 'finished' | 'archived';
}

export function AdminDashboard() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [parties, setParties] = useState<Party[]>([]);
  const [activityProposals, setActivityProposals] = useState<any[]>([]);
  const [tournamentProposals, setTournamentProposals] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/admin/login');
    else if (!loading && user?.role !== 'admin') navigate('/');
  }, [user, loading, navigate]);

  useEffect(() => { if (user?.role === 'admin') { fetchParties(); fetchProposals(); } }, [user]);

  const fetchParties = async () => {
    const res = await fetch('/api/parties');
    if (res.ok) { const data = await res.json(); setParties(data.parties); }
  };

  const fetchProposals = async () => {
    const ap = await fetch('/api/activity-proposals'); if (ap.ok) setActivityProposals((await ap.json()).proposals || []);
    const tp = await fetch('/api/tournament-proposals'); if (tp.ok) setTournamentProposals((await tp.json()).proposals || []);
  };

  const handleCreate = async (data: { name: string; startsAt: string; endsAt: string; description: string; location: string }) => {
    setCreating(true);
    setError(null);
    try {
      const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
      const res = await fetch('/api/admin/parties', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify(data) });
      if (res.ok) { setShowForm(false); fetchParties(); }
      else { const err = await res.json(); setError(err.error || 'Error al crear la party'); }
    } catch { setError('Error de conexión'); }
    finally { setCreating(false); }
  };

  if (loading || !user || user.role !== 'admin') return null;

  const statusColors: Record<string, string> = { planned: 'var(--neon-cyan)', active: 'var(--neon-green)', finished: 'var(--muted)', archived: 'var(--neon-magenta)' };
  const statusLabels: Record<string, string> = { planned: 'PLANIFICADA', active: 'ACTIVA', finished: 'FINALIZADA', archived: 'ARCHIVADA' };

  return (
    <div className="container">
      <div className="header">
        <h1>ADMIN</h1>
        <div className="nav">
          <span style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>{user.displayName}</span>
          <a href="/">SITIO →</a>
          <a href="/display" target="_blank">DISPLAY →</a>
          <button onClick={logout} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>SALIR</button>
        </div>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {showForm ? (
        <div className="card">
          <h2>NUEVA PARTY</h2>
          <PartyForm onSubmit={handleCreate} onCancel={() => { setShowForm(false); setError(null); }} loading={creating} />
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2>PARTIES</h2>
            <button className="primary" style={{ fontSize: '0.5rem' }} onClick={() => setShowForm(true)}>+ NUEVA PARTY</button>
          </div>
          {parties.length === 0 ? (
            <div className="empty-state"><h3>SIN PARTIES</h3><p style={{ fontSize: '0.875rem' }}>No hay parties creadas todavía.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {parties.map(p => (
                <div key={p.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <h3 style={{ marginBottom: '0.25rem', wordBreak: 'break-word' }}>{p.name}</h3>
                    <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.875rem' }}>{new Date(p.startsAt).toLocaleDateString()} - {new Date(p.endsAt).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                    <span style={{ padding: '0.25rem 0.75rem', border: `1px solid ${statusColors[p.status]}`, color: statusColors[p.status], fontFamily: 'var(--font-display)', fontSize: '0.5rem' }}>{statusLabels[p.status]}</span>
                    <a href={`/admin/parties/${p.id}`} style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>VER →</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--neon-cyan)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>PROPUESTAS PENDIENTES</h2>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.5rem', color: 'var(--neon-cyan)', border: '1px solid var(--neon-cyan)', padding: '0.25rem 0.5rem' }}>{activityProposals.length + tournamentProposals.length} TOTAL</span>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.75rem', color: 'var(--neon-cyan)', marginBottom: '0.5rem' }}>ACTIVIDADES ({activityProposals.length})</h3>
          {activityProposals.length === 0 ? <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Sin propuestas de actividades</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {activityProposals.map((p: any) => (
                <div key={p.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '0.875rem' }}>{p.title}</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{p.gameTitle || 'Sin juego'} · {new Date(p.startsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={async () => { const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1]; const res = await fetch(`/api/admin/activity-proposals/${p.id}/approve`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } }); if (res.ok) fetchProposals(); }} className="primary" style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>APROBAR</button>
                    <button onClick={async () => { const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1]; await fetch(`/api/activity-proposals/${p.id}`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } }); fetchProposals(); }} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>RECHAZAR</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.75rem', color: 'var(--neon-cyan)', marginBottom: '0.5rem' }}>TORNEOS ({tournamentProposals.length})</h3>
          {tournamentProposals.length === 0 ? <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Sin propuestas de torneos</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tournamentProposals.map((p: any) => (
                <div key={p.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '0.875rem' }}>{p.name}</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{p.gameTitle} · Max {p.maxParticipants}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={async () => { const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1]; const res = await fetch(`/api/admin/tournament-proposals/${p.id}/approve`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } }); if (res.ok) fetchProposals(); }} className="primary" style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>APROBAR</button>
                    <button onClick={async () => { const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1]; await fetch(`/api/tournament-proposals/${p.id}`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } }); fetchProposals(); }} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>RECHAZAR</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {(activityProposals.length > 0 || tournamentProposals.length > 0) && <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <a href="/admin/planning" style={{ fontSize: '0.5rem' }}>GESTIÓN ACTIVIDADES →</a>
          <a href="/admin/tournaments" style={{ fontSize: '0.5rem' }}>GESTIÓN TORNEOS →</a>
        </div>}
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>ACCIONES RÁPIDAS</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <a href="/admin/planning" style={{ fontSize: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.875rem 1.5rem', border: '2px solid var(--neon-cyan)', borderRadius: 'var(--radius)', textDecoration: 'none' }}>ACTIVIDADES</a>
          <a href="/admin/games" style={{ fontSize: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.875rem 1.5rem', border: '2px solid var(--neon-cyan)', borderRadius: 'var(--radius)', textDecoration: 'none' }}>JUEGOS</a>
          <a href="/admin/tournaments" style={{ fontSize: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.875rem 1.5rem', border: '2px solid var(--neon-cyan)', borderRadius: 'var(--radius)', textDecoration: 'none' }}>TORNEOS</a>
          <a href="/admin/rewards" style={{ fontSize: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.875rem 1.5rem', border: '2px solid var(--neon-cyan)', borderRadius: 'var(--radius)', textDecoration: 'none' }}>PREMIOS</a>
          <a href="/admin/users" style={{ fontSize: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.875rem 1.5rem', border: '2px solid var(--neon-cyan)', borderRadius: 'var(--radius)', textDecoration: 'none' }}>USUARIOS</a>
        </div>
      </div>
    </div>
  );
}
