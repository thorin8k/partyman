import { useAuth } from '../components/AuthContext';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

interface Party {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  description: string | null;
  location: string | null;
}

interface Activity {
  id: number;
  title: string;
  gameTitle: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  status: string;
}

interface Proposal {
  id: number;
  gameId: number;
  gameTitle: string;
  voteCount: number;
}

interface Game { id: number; title: string; imageUrl: string | null; }

export function Dashboard() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [activeParty, setActiveParty] = useState<Party | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [showPropose, setShowPropose] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetch('/api/parties/active').then(r => r.json()).then(d => setActiveParty(d.party)).catch(() => {});
      fetch('/api/participants/join', { method: 'POST' }).catch(() => {});
      fetchPlanning();
      fetchGames();
    }
  }, [user]);

  const fetchPlanning = async () => {
    const res = await fetch('/api/planning');
    if (res.ok) { const d = await res.json(); setActivities(d.activities || []); setProposals(d.proposals || []); }
  };

  const fetchGames = async () => {
    const res = await fetch('/api/admin/games');
    if (res.ok) setGames((await res.json()).games);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const res = await fetch(`/api/games/search?q=${encodeURIComponent(searchQuery)}`);
    if (res.ok) setSearchResults((await res.json()).games || []);
    setSearching(false);
  };

  const handleProposeFromSearch = async (game: any) => {
    setError(null);
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const createRes = await fetch('/api/admin/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ title: game.name, description: game.description || null, minPlayers: game.minPlayers || null, maxPlayers: game.maxPlayers || null, imageUrl: game.imageUrl || null }),
    });
    if (createRes.ok) {
      const created = (await createRes.json()).game;
      await fetch('/api/parties/active/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
        body: JSON.stringify({ gameId: created.id }),
      });
      fetchPlanning();
      fetchGames();
      setSearchResults([]);
      setSearchQuery('');
    }
  };

  const handlePropose = async (gameId: number) => {
    setError(null);
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/parties/active/proposals', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ gameId }),
    });
    if (res.ok) { setShowPropose(false); fetchPlanning(); }
    else { const err = await res.json(); setError(err.error || 'Error'); }
  };

  const handleVote = async (proposalId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/proposals/${proposalId}/vote`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ value: 1 }) });
    fetchPlanning();
  };

  const handleUnvote = async (proposalId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/proposals/${proposalId}/vote`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } });
    fetchPlanning();
  };

  const handleJoinActivity = async (activityId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/activities/${activityId}/join`, { method: 'PUT', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (!res.ok) { const err = await res.json(); setError(err.error || 'Error'); }
    else fetchPlanning();
  };

  const handleLeaveActivity = async (activityId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/activities/${activityId}/leave`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } });
    fetchPlanning();
  };

  if (loading || !user) return null;

  return (
    <div className="container">
      <div className="header">
        <h1>PARTYMAN</h1>
        <div className="nav">
          <span style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>{user.displayName}</span>
          {user.role === 'admin' && <a href="/admin">ADMIN →</a>}
          <a href="/display" target="_blank">DISPLAY →</a>
          <button onClick={logout} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>SALIR</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h2>PERFIL</h2>
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" style={{ width: '64px', height: '64px', borderRadius: '50%', border: '2px solid var(--neon-cyan)' }} />
          ) : (
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--bg)' }}>
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div><p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{user.displayName}</p></div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>PARTY ACTUAL</h2>
        {activeParty ? (
          <div style={{ marginTop: '1rem' }}>
            <h3 style={{ color: 'var(--neon-green)', marginBottom: '0.5rem' }}>{activeParty.name}</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)' }}>
              {new Date(activeParty.startsAt).toLocaleDateString()} - {new Date(activeParty.endsAt).toLocaleDateString()}
            </p>
            {activeParty.location && <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}><span style={{ color: 'var(--neon-cyan)' }}>UBICACIÓN:</span> {activeParty.location}</p>}
            {activeParty.description && <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}><span style={{ color: 'var(--neon-cyan)' }}>DESCRIPCIÓN:</span> {activeParty.description}</p>}
          </div>
        ) : (
          <div className="empty-state"><h3>SIN PARTY ACTIVA</h3><p style={{ fontSize: '0.875rem' }}>No hay party activa en este momento.</p></div>
        )}
      </div>

      {activeParty && (
        <>
          <div className="card" style={{ marginTop: '1rem' }}>
            <h2>PROPUESTAS DE JUEGOS</h2>
            {proposals.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: '0.5rem' }}>No hay propuestas todavía</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {proposals.map(p => (
                  <div key={p.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{p.gameTitle}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ color: 'var(--neon-green)', fontFamily: 'var(--font-display)', fontSize: '0.625rem' }}>{p.voteCount} VOTOS</span>
                      <button onClick={() => handleVote(p.id)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>+ VOTAR</button>
                      <button onClick={() => handleUnvote(p.id)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', borderColor: 'var(--error)', color: 'var(--error)' }}>- QUITAR</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input placeholder="Buscar juego en SteamGridDB..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ flex: 1 }} />
                <button onClick={handleSearch} disabled={searching} style={{ fontSize: '0.5rem' }}>{searching ? 'BUSCANDO...' : 'BUSCAR'}</button>
              </div>
              {searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {searchResults.map((g, i) => (
                    <div key={i} className="list-item" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {g.imageUrl && <img src={g.imageUrl} alt="" style={{ width: '48px', height: '48px', borderRadius: '4px', objectFit: 'cover' }} />}
                      <div style={{ flex: 1 }}><h3 style={{ fontSize: '0.875rem' }}>{g.name}</h3></div>
                      <button onClick={() => handleProposeFromSearch(g)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>PROPONER</button>
                    </div>
                  ))}
                </div>
              )}
              {!showPropose ? (
                <button onClick={() => setShowPropose(true)} style={{ fontSize: '0.5rem' }}>+ PROPONER DEL CATÁLOGO</button>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {games.filter(g => !proposals.find(p => p.gameId === g.id)).map(g => (
                      <div key={g.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{g.title}</span>
                        <button onClick={() => handlePropose(g.id)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>PROPONER</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShowPropose(false)} style={{ fontSize: '0.5rem' }}>CANCELAR</button>
                </>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h2>ACTIVIDADES</h2>
            {activities.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: '0.5rem' }}>No hay actividades programadas</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {activities.map(a => (
                  <div key={a.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <h3 style={{ marginBottom: '0.25rem' }}>{a.title}</h3>
                      <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                        {a.gameTitle ? `${a.gameTitle} · ` : ''}
                        {new Date(a.startsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {new Date(a.endsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        {a.capacity ? ` · Cap: ${a.capacity}` : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => handleJoinActivity(a.id)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>UNIRME</button>
                      <button onClick={() => handleLeaveActivity(a.id)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', borderColor: 'var(--error)', color: 'var(--error)' }}>SALIR</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
