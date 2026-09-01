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
  gameImage: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  notes: string | null;
  status: string;
  participantCount: number;
  participants: Array<{ id: number; displayName: string }>;
}

interface Tournament {
  id: number;
  name: string;
  gameTitleSnapshot: string;
  gameImage: string | null;
  status: string;
  maxParticipants: number;
  participantCount: number;
  participants: Array<{ id: number; displayName: string; seed: number }>;
}

function ProposeActivityForm({ onSuccess }: { onSuccess: () => void }) {
  const [q, setQ] = useState(''); const [results, setResults] = useState<any[]>([]); const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [title, setTitle] = useState(''); const [startsAt, setStartsAt] = useState(''); const [endsAt, setEndsAt] = useState(''); const [capacity, setCapacity] = useState('');
  const handleSearch = async () => { if (!q.trim()) return; setSearching(true); const r = await fetch(`/api/games/search?q=${encodeURIComponent(q)}`); if (r.ok) setResults((await r.json()).games || []); setSearching(false); };
  const handleSubmit = async () => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/activity-proposals', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ gameName: selectedGame?.name ?? null, imageUrl: selectedGame?.imageUrl ?? null, title: title || selectedGame?.name || 'Actividad', startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(), endsAt: endsAt ? new Date(endsAt).toISOString() : new Date(Date.now()+3600000).toISOString(), capacity: capacity ? parseInt(capacity) : null }) });
    if (res.ok) { onSuccess(); setSelectedGame(null); setTitle(''); setStartsAt(''); setEndsAt(''); setCapacity(''); setQ(''); setResults([]); }
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input placeholder="Buscar juego en SteamGridDB (opcional)..." value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ flex: 1 }} />
        <button onClick={handleSearch} disabled={searching} style={{ fontSize: '0.5rem' }}>{searching ? '...' : 'BUSCAR'}</button>
      </div>
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' }}>
          {results.map((g,i) => (
            <div key={i} onClick={() => { setSelectedGame(g); setTitle(g.name); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: selectedGame?.name===g.name ? 'var(--panel-hover)' : 'var(--bg-secondary)', border: `1px solid ${selectedGame?.name===g.name ? 'var(--neon-cyan)' : 'var(--border)'}`, cursor: 'pointer', flexWrap: 'nowrap' }}>
              {g.imageUrl && <img src={g.imageUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
              <span style={{ fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{g.name}</span>
              {selectedGame?.name===g.name && <span style={{ color: 'var(--neon-green)', fontSize: '0.625rem', flexShrink: 0 }}>✓</span>}
            </div>
          ))}
        </div>
      )}
      {selectedGame && <p style={{ fontSize: '0.75rem', color: 'var(--neon-cyan)', marginBottom: '0.5rem' }}>Juego: {selectedGame.name}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <input placeholder="Título de la actividad *" value={title} onChange={e => setTitle(e.target.value)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} />
          <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
        </div>
        <input type="number" placeholder="Capacidad (opcional)" value={capacity} onChange={e => setCapacity(e.target.value)} />
        <button onClick={handleSubmit} className="primary" style={{ fontSize: '0.5rem' }}>PROPONER ACTIVIDAD</button>
      </div>
    </div>
  );
}

function ProposeTournamentForm({ onSuccess }: { onSuccess: () => void }) {
  const [q, setQ] = useState(''); const [results, setResults] = useState<any[]>([]); const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [name, setName] = useState(''); const [maxParticipants, setMaxParticipants] = useState('8');
  const handleSearch = async () => { if (!q.trim()) return; setSearching(true); const r = await fetch(`/api/games/search?q=${encodeURIComponent(q)}`); if (r.ok) setResults((await r.json()).games || []); setSearching(false); };
  const handleSubmit = async () => {
    if (!selectedGame || !name.trim()) return;
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/tournament-proposals', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ gameName: selectedGame.name, imageUrl: selectedGame.imageUrl, name: name.trim(), maxParticipants: parseInt(maxParticipants) || 8 }) });
    if (res.ok) { onSuccess(); setSelectedGame(null); setName(''); setQ(''); setResults([]); }
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input placeholder="Buscar juego en SteamGridDB..." value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ flex: 1 }} />
        <button onClick={handleSearch} disabled={searching} style={{ fontSize: '0.5rem' }}>{searching ? '...' : 'BUSCAR'}</button>
      </div>
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' }}>
          {results.map((g,i) => (
            <div key={i} onClick={() => { setSelectedGame(g); setName(g.name); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: selectedGame?.name===g.name ? 'var(--panel-hover)' : 'var(--bg-secondary)', border: `1px solid ${selectedGame?.name===g.name ? 'var(--neon-cyan)' : 'var(--border)'}`, cursor: 'pointer', flexWrap: 'nowrap' }}>
              {g.imageUrl && <img src={g.imageUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
              <span style={{ fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{g.name}</span>
              {selectedGame?.name===g.name && <span style={{ color: 'var(--neon-green)', fontSize: '0.625rem', flexShrink: 0 }}>✓</span>}
            </div>
          ))}
        </div>
      )}
      {selectedGame && <p style={{ fontSize: '0.75rem', color: 'var(--neon-cyan)', marginBottom: '0.5rem' }}>Juego: {selectedGame.name}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <input placeholder="Nombre del torneo *" value={name} onChange={e => setName(e.target.value)} />
        <input type="number" min="2" max="16" placeholder="Max participantes" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} />
        <button onClick={handleSubmit} className="primary" style={{ fontSize: '0.5rem' }}>PROPONER TORNEO</button>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [activeParty, setActiveParty] = useState<Party | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityProposals, setActivityProposals] = useState<any[]>([]);
  const [tournamentProposals, setTournamentProposals] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showTournamentForm, setShowTournamentForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetch('/api/parties/active').then(r => r.json()).then(d => setActiveParty(d.party)).catch(() => {});
      fetch('/api/participants/join', { method: 'POST' }).catch(() => {});
      fetchPlanning();
      fetchTournaments();
    }
  }, [user]);

  const fetchPlanning = async () => {
    const res = await fetch('/api/planning');
    if (res.ok) { const d = await res.json(); setActivities(d.activities || []); }
    const ap = await fetch('/api/activity-proposals'); if (ap.ok) setActivityProposals((await ap.json()).proposals || []);
    const tp = await fetch('/api/tournament-proposals'); if (tp.ok) setTournamentProposals((await tp.json()).proposals || []);
  };

  const fetchTournaments = async () => {
    const res = await fetch('/api/tournaments');
    if (res.ok) setTournaments((await res.json()).tournaments);
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

  const handleJoinTournament = async (tournamentId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/tournaments/${tournamentId}/join`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (!res.ok) { const err = await res.json(); setError(err.error || 'Error'); }
    fetchTournaments();
  };

  const handleLeaveTournament = async (tournamentId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/tournaments/${tournamentId}/leave`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } });
    fetchTournaments();
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
            <h2>ACTIVIDADES</h2>
            {activities.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: '0.5rem' }}>No hay actividades programadas</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {activities.map(a => {
                  const isJoined = a.participants?.some(p => p.id === user?.id);
                  const isFull = a.capacity != null && (a.participantCount || 0) >= a.capacity;
                  const now = new Date(); const isLive = new Date(a.startsAt) <= now && now <= new Date(a.endsAt);
                  return (
                    <div key={a.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderColor: isLive ? 'var(--neon-green)' : undefined, background: isLive ? 'rgba(0,255,136,0.05)' : undefined }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {a.gameImage && <img src={a.gameImage} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <h3 style={{ marginBottom: '0.25rem' }}>{a.title}</h3>
                            {isLive && <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-display)', color: 'var(--neon-green)', border: '1px solid var(--neon-green)', padding: '0.125rem 0.375rem', animation: 'pulse 2s infinite' }}>EN CURSO</span>}
                          </div>
                          <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                            {a.gameTitle ? `${a.gameTitle} · ` : ''}
                            {new Date(a.startsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {new Date(a.endsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            {a.capacity ? ` · ${a.participantCount || 0}/${a.capacity}` : ''}
                          </p>
                          {a.notes && <p style={{ margin: '0.25rem 0 0', color: 'var(--text-dim)', fontSize: '0.7rem', fontStyle: 'italic' }}>{a.notes}</p>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {isJoined && (
                          <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-display)', color: 'var(--neon-green)' }}>INSCRITO</span>
                        )}
                        {isJoined ? (
                          <button onClick={() => handleLeaveActivity(a.id)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', borderColor: 'var(--error)', color: 'var(--error)' }}>SALIR</button>
                        ) : (
                          <button onClick={() => handleJoinActivity(a.id)} disabled={isFull} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>
                            {isFull ? 'LLENA' : 'UNIRME'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>PROPONER ACTIVIDAD</h2>
              <button onClick={() => setShowActivityForm(!showActivityForm)} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>{showActivityForm ? 'CERRAR' : '+ PROPONER'}</button>
            </div>
            {showActivityForm && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>Propón una actividad para la party. El admin la programará.</p>
                <ProposeActivityForm onSuccess={() => { fetchPlanning(); setShowActivityForm(false); }} />
              </div>
            )}
            {activityProposals.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {activityProposals.map((p: any) => (
                  <div key={p.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.875rem' }}>{p.title} {p.gameTitle ? `· ${p.gameTitle}` : ''}</span>
                    <button onClick={async () => { const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1]; await fetch(`/api/activity-proposals/${p.id}`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } }); fetchPlanning(); }} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', borderColor: 'var(--error)', color: 'var(--error)' }}>RETIRAR</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h2>TORNEOS</h2>
            {tournaments.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: '0.5rem' }}>No hay torneos programados</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {tournaments.map(t => {
                  const isMember = t.participants?.some(p => p.id === user?.id);
                  const canJoin = t.status === 'upcoming' || t.status === 'draft';
                  const statusMap: Record<string, { label: string; color: string }> = {
                    draft: { label: 'BORRADOR', color: 'var(--text-dim)' },
                    upcoming: { label: 'INSCRIPCIÓN ABIERTA', color: 'var(--neon-green)' },
                    in_progress: { label: 'EN CURSO', color: 'var(--neon-orange)' },
                    finished: { label: 'FINALIZADO', color: 'var(--muted)' },
                    cancelled: { label: 'CANCELADO', color: 'var(--error)' },
                  };
                  const statusInfo = statusMap[t.status] || statusMap.upcoming;
                  return (
                    <div key={t.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 auto' }}>
                        {t.gameImage && <img src={t.gameImage} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
                        <div>
                          <h3 style={{ marginBottom: '0.25rem' }}>{t.name}</h3>
                          <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                            {t.gameTitleSnapshot} · {t.participantCount || 0}/{t.maxParticipants} participantes
                          </p>
                          {t.participants && t.participants.length > 0 && (
                            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                              {t.participants.map(p => p.displayName).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-display)', color: statusInfo.color }}>
                          {statusInfo.label}
                        </span>
                        {t.status === 'in_progress' && (
                          <a href={`/tournaments/${t.id}`} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)', textDecoration: 'none' }}>VER BRACKET →</a>
                        )}
                        {canJoin && (
                          isMember ? (
                            <button onClick={() => handleLeaveTournament(t.id)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', borderColor: 'var(--error)', color: 'var(--error)' }}>SALIR</button>
                          ) : (
                            <button onClick={() => handleJoinTournament(t.id)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>INSCRIBIRME</button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>PROPONER TORNEO</h2>
              <button onClick={() => setShowTournamentForm(!showTournamentForm)} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>{showTournamentForm ? 'CERRAR' : '+ PROPONER'}</button>
            </div>
            {showTournamentForm && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>Propón un torneo. El admin lo creará.</p>
                <ProposeTournamentForm onSuccess={() => { fetchPlanning(); setShowTournamentForm(false); }} />
              </div>
            )}
            {tournamentProposals.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {tournamentProposals.map((p: any) => (
                  <div key={p.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.875rem' }}>{p.name} · {p.gameTitle}</span>
                    <button onClick={async () => { const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1]; await fetch(`/api/tournament-proposals/${p.id}`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } }); fetchPlanning(); }} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', borderColor: 'var(--error)', color: 'var(--error)' }}>RETIRAR</button>
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
