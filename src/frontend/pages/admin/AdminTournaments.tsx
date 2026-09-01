import { useAuth } from '../../components/AuthContext';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

interface Tournament {
  id: number;
  name: string;
  gameTitleSnapshot: string;
  status: string;
  maxParticipants: number;
}

interface Game { id: number; title: string; }

export function AdminTournaments() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', gameId: '', maxParticipants: '16' });

  useEffect(() => {
    if (!loading && !user) navigate('/admin/login');
    else if (!loading && user?.role !== 'admin') navigate('/');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user?.role === 'admin') { fetchTournaments(); fetchGames(); fetchProposals(); }
  }, [user]);

  const fetchProposals = async () => {
    const res = await fetch('/api/tournament-proposals');
    if (res.ok) setProposals((await res.json()).proposals || []);
  };

  const handleApproveProposal = async (id: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/tournament-proposals/${id}/approve`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (res.ok) { fetchProposals(); fetchTournaments(); }
  };

  const fetchTournaments = async () => {
    const partyRes = await fetch('/api/parties/active');
    const partyData = await partyRes.json();
    if (!partyData.party) return;
    const res = await fetch(`/api/tournaments`);
    if (res.ok) setTournaments((await res.json()).tournaments);
  };

  const fetchGames = async () => {
    const res = await fetch('/api/admin/games');
    if (res.ok) setGames((await res.json()).games);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const partyRes = await fetch('/api/parties/active');
    const partyData = await partyRes.json();
    if (!partyData.party) { setError('No hay party activa'); return; }

    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/admin/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ partyId: partyData.party.id, gameId: parseInt(form.gameId), name: form.name, maxParticipants: parseInt(form.maxParticipants) }),
    });
    if (res.ok) { setShowForm(false); setForm({ name: '', gameId: '', maxParticipants: '16' }); fetchTournaments(); }
    else { const err = await res.json(); setError(err.error || 'Error'); }
  };

  const handleAction = async (id: number, action: string) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/tournaments/${id}/${action}`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (!res.ok) { const err = await res.json(); setError(err.error || 'Error'); }
    fetchTournaments();
  };

  if (loading || !user || user.role !== 'admin') return null;

  const statusColors: Record<string, string> = { draft: 'var(--neon-cyan)', upcoming: 'var(--neon-green)', in_progress: 'var(--neon-orange)', finished: 'var(--muted)', cancelled: 'var(--error)' };
  const statusLabels: Record<string, string> = { draft: 'BORRADOR', upcoming: 'PRÓXIMAMENTE', in_progress: 'EN CURSO', finished: 'FINALIZADO', cancelled: 'CANCELADO' };

  return (
    <div className="container">
      <div className="header">
        <h1>ADMIN</h1>
        <div className="nav">
          <a href="/admin">VOLVER →</a>
          <button onClick={logout} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>SALIR</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {proposals.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--neon-cyan)' }}>
          <h2>PROPUESTAS DE TORNEOS ({proposals.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
            {proposals.map((p: any) => (
              <div key={p.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '0.875rem' }}>{p.name}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{p.gameTitle} · Max {p.maxParticipants}</p>
                </div>
                <button onClick={() => handleApproveProposal(p.id)} className="primary" style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>APROBAR</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm ? (
        <div className="card">
          <h2>NUEVO TORNEO</h2>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group"><label>NOMBRE *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} maxLength={120} required /></div>
            <div className="form-group"><label>JUEGO *</label>
              <select value={form.gameId} onChange={e => setForm({...form, gameId: e.target.value})} required>
                <option value="">Seleccionar juego</option>
                {games.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
            <div className="form-group"><label>MÁX. PARTICIPANTES</label><input type="number" min="2" max="16" value={form.maxParticipants} onChange={e => setForm({...form, maxParticipants: e.target.value})} /></div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="primary">CREAR</button>
              <button type="button" onClick={() => setShowForm(false)}>CANCELAR</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2>TORNEOS ({tournaments.length})</h2>
            <button className="primary" style={{ fontSize: '0.5rem' }} onClick={() => setShowForm(true)}>+ NUEVO TORNEO</button>
          </div>
          {tournaments.length === 0 ? (
            <div className="empty-state"><h3>SIN TORNEOS</h3><p style={{ fontSize: '0.875rem' }}>No hay torneos creados todavía.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tournaments.map(t => (
                <div key={t.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h3 style={{ marginBottom: '0.25rem' }}>{t.name}</h3>
                    <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.75rem' }}>{t.gameTitleSnapshot} · Max {t.maxParticipants}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ padding: '0.25rem 0.75rem', border: `1px solid ${statusColors[t.status]}`, color: statusColors[t.status], fontFamily: 'var(--font-display)', fontSize: '0.4rem' }}>
                      {statusLabels[t.status]}
                    </span>
                    {t.status === 'draft' && <button onClick={() => handleAction(t.id, 'publish')} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>PUBLICAR</button>}
                    {t.status === 'upcoming' && <button onClick={() => handleAction(t.id, 'start')} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>INICIAR</button>}
                    {t.status !== 'finished' && t.status !== 'cancelled' && <button onClick={() => handleAction(t.id, 'cancel')} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', borderColor: 'var(--error)', color: 'var(--error)' }}>CANCELAR</button>}
                    <a href={`/admin/tournaments/${t.id}`} style={{ fontSize: '0.75rem' }}>VER →</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
