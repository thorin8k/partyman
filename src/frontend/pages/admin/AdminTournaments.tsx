import { useAuth } from '../../components/AuthContext';
import { apiError } from '../../components/apiError';
import { confirmDialog } from '../../components/ConfirmDialog';
import { pageBtn, rowActions, rowBtn, rowColumn, rowFooter, rowHead, rowMain, rowTitle, badge, headerBtn, rowView } from '../../components/listRow';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

interface Tournament {
  id: number;
  name: string;
  gameTitleSnapshot: string;
  status: string;
  format?: string;
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
  const [parties, setParties] = useState<any[]>([]);
  const [partyId, setPartyId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', gameId: '', maxParticipants: '16', format: 'single' });
  const [propFormats, setPropFormats] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!loading && !user) navigate('/admin/login');
    else if (!loading && user?.role !== 'admin') navigate('/');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user?.role === 'admin') { fetchParties(); fetchGames(); fetchProposals(); }
  }, [user]);
  useEffect(() => { if (user?.role === 'admin' && partyId) fetchTournaments(partyId); }, [partyId]);

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
    const res = await fetch('/api/tournament-proposals');
    if (res.ok) setProposals((await res.json()).proposals || []);
  };

  const handleApproveProposal = async (id: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/tournament-proposals/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ format: propFormats[id] ?? proposals.find((p: any) => p.id === id)?.format ?? 'single' }) });
    if (res.ok) { fetchProposals(); if (partyId) fetchTournaments(partyId); }
  };

  const handleRejectProposal = async (id: number) => {
    if (!(await confirmDialog('¿Rechazar esta propuesta?', { confirmLabel: 'RECHAZAR', danger: true }))) return;
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/tournament-proposals/${id}`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } });
    fetchProposals();
  };

  const fetchTournaments = async (pid?: string) => {
    const id = pid || partyId;
    const res = await fetch(id ? `/api/tournaments?partyId=${id}` : `/api/tournaments`);
    if (res.ok) setTournaments((await res.json()).tournaments);
  };

  const fetchGames = async () => {
    const res = await fetch('/api/admin/games');
    if (res.ok) setGames((await res.json()).games);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!partyId) { setError('Selecciona una party'); return; }
    if (!form.gameId) { setError('Selecciona un juego'); return; }

    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/admin/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ partyId: parseInt(partyId), gameId: parseInt(form.gameId), name: form.name, maxParticipants: parseInt(form.maxParticipants), format: form.format }),
    });
    if (res.ok) { setShowForm(false); setForm({ name: '', gameId: '', maxParticipants: '16', format: 'single' }); fetchTournaments(partyId); }
    else { const err = await res.json(); setError(apiError(err)); }
  };

  const handleAction = async (id: number, action: string) => {
    if ((action === 'cancel' || action === 'delete') && !(await confirmDialog(action === 'delete' ? '¿Eliminar este torneo?' : '¿Cancelar este torneo?', { danger: true }))) return;
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/tournaments/${id}/${action}`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (!res.ok) { const err = await res.json(); setError(apiError(err)); }
    if (partyId) fetchTournaments(partyId);
  };

  if (loading) return <div className="container"><div className="loading">Cargando…</div></div>;
  if (!user || user.role !== 'admin') return <div className="container"><div className="loading">Redirigiendo…</div></div>;

  const statusColors: Record<string, string> = { draft: 'var(--neon-cyan)', upcoming: 'var(--neon-green)', in_progress: 'var(--neon-orange)', finished: 'var(--muted)', cancelled: 'var(--error)' };
  const statusLabels: Record<string, string> = { draft: 'BORRADOR', upcoming: 'PRÓXIMAMENTE', in_progress: 'EN CURSO', finished: 'FINALIZADO', cancelled: 'CANCELADO' };

  return (
    <div className="container">
      <div className="header">
        <h1>ADMIN</h1>
        <div className="nav">
          <a href="/admin">VOLVER →</a>
          <button onClick={logout} style={headerBtn}>SALIR</button>
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
          <h2>PROPUESTAS DE TORNEOS ({proposals.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
            {proposals.map((p: any) => (
              <div key={p.id} className="list-item" style={rowColumn}>
                <div style={rowMain}>
                  <h3 style={{ ...rowTitle, fontSize: '0.875rem' }}>{p.name}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{p.gameTitle} · Max {p.maxParticipants}{(p.format ?? 'single') === 'single_third' ? ' · 3er puesto' : ''}</p>
                </div>
                <div style={rowFooter}>
                  <select value={propFormats[p.id] ?? p.format ?? 'single'} onChange={e => setPropFormats({ ...propFormats, [p.id]: e.target.value })} aria-label="Formato" style={rowBtn}>
                    <option value="single">Simple</option>
                    <option value="single_third">Simple + 3er puesto</option>
                  </select>
                  <button onClick={() => handleApproveProposal(p.id)} className="primary" style={rowBtn}>APROBAR</button>
                  <button onClick={() => handleRejectProposal(p.id)} style={rowBtn}>RECHAZAR</button>
                </div>
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
            <div className="form-group"><label>FORMATO</label>
              <select value={form.format} onChange={e => setForm({...form, format: e.target.value})}>
                <option value="single">Simple</option>
                <option value="single_third">Simple + 3er puesto</option>
              </select>
            </div>
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
            <button className="primary" style={pageBtn} onClick={() => setShowForm(true)}>+ NUEVO TORNEO</button>
          </div>
          {tournaments.length === 0 ? (
            <div className="empty-state"><h3>SIN TORNEOS</h3><p style={{ fontSize: '0.875rem' }}>No hay torneos creados todavía.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tournaments.map(t => (
                <div key={t.id} className="list-item" style={rowColumn}>
                  <div style={rowHead}>
                    <div style={rowMain}>
                      <h3 style={rowTitle}>{t.name}</h3>
                      <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.75rem' }}>{t.gameTitleSnapshot} · Max {t.maxParticipants}</p>
                    </div>
                    <span style={badge(statusColors[t.status])}>{statusLabels[t.status]}</span>
                    {(t.format ?? 'single') === 'single_third' && (
                      <span style={badge('var(--neon-cyan)')}>3ER PUESTO</span>
                    )}
                  </div>
                  <div style={rowFooter}>
                    {t.status === 'upcoming' && <button onClick={() => handleAction(t.id, 'start')} style={rowBtn}>INICIAR</button>}
                    {t.status !== 'finished' && t.status !== 'cancelled' && <button onClick={() => handleAction(t.id, 'cancel')} style={{ ...rowBtn, borderColor: 'var(--error)', color: 'var(--error)' }}>CANCELAR</button>}
                    <a href={`/admin/tournaments/${t.id}`} style={rowView}>VER →</a>
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
