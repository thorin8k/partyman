import { useAuth } from '../components/AuthContext';
import { confirmDialog } from '../components/ConfirmDialog';
import { rowBtnTouch, rowColumn, rowFooter, rowMain, rowTitle, badge, headerBtn, rowViewTouch } from '../components/listRow';
import { useLocation } from 'wouter';
import { useEffect, useRef, useState } from 'react';

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

// ponytail: mapa central de errores técnicos -> ES humano. Ampliar aquí, no en cada handler.
const ERROR_ES: Record<string, string> = {
  ACTIVITY_FULL: 'Actividad llena, no quedan plazas.',
  TOURNAMENT_FULL: 'Torneo lleno, no quedan plazas.',
  TOURNAMENT_NOT_JOINABLE: 'Este torneo ya no admite inscripciones.',
  NOT_ACTIVE_PARTY: 'No hay party activa en este momento.',
  NOT_PARTY_MEMBER: 'Tienes que estar dentro de la party activa.',
  NEED_MIN_PARTICIPANTS: 'Faltan participantes para publicar.',
  INVALID_SCORE: 'Resultado no válido: el ganador debe tener más puntos.',
  INVALID_WINNER: 'El ganador debe ser uno de los dos jugadores.',
  NOT_IN_MATCH: 'Solo los jugadores del partido pueden reportar.',
  PARTICIPANT_ONLY: 'Solo un participante puede hacer eso. Como admin, gestiona desde el panel.',
  PROPOSAL_NOT_FOUND: 'La propuesta ya no existe.',
  VALIDATION_ERROR: 'Revisa los datos del formulario.',
};

function humanError(code: unknown): string {
  if (typeof code === 'string' && ERROR_ES[code]) return ERROR_ES[code];
  if (typeof code === 'string' && code.length < 60) return code.replace(/_/g, ' ').toLowerCase();
  return 'Ha ocurrido un error, inténtalo de nuevo.';
}

const touchBtn: React.CSSProperties = { minHeight: '44px', fontSize: '0.625rem', padding: '0.75rem 1rem' };

function ProposeActivityForm({ onSuccess }: { onSuccess: (msg: string) => void }) {
  const [q, setQ] = useState(''); const [results, setResults] = useState<any[]>([]); const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [title, setTitle] = useState(''); const [startsAt, setStartsAt] = useState(''); const [endsAt, setEndsAt] = useState(''); const [capacity, setCapacity] = useState(''); const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const handleSearch = async () => { if (!q.trim()) return; setSearching(true); const r = await fetch(`/api/games/search?q=${encodeURIComponent(q)}`); if (r.ok) setResults((await r.json()).games || []); setSearching(false); };
  const handleSubmit = async () => {
    setLocalError(null);
    if (!title.trim() && !selectedGame) { setLocalError('Ponle un título a la actividad.'); return; }
    if (!startsAt || !endsAt) { setLocalError('Indica inicio y fin de la actividad.'); return; }
    const s = new Date(startsAt).getTime(); const e = new Date(endsAt).getTime();
    if (isNaN(s) || isNaN(e) || s >= e) { setLocalError('El inicio debe ser anterior al fin.'); return; }
    if (capacity && (parseInt(capacity) < 1 || parseInt(capacity) > 100)) { setLocalError('La capacidad debe ser entre 1 y 100.'); return; }
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/activity-proposals', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ gameName: selectedGame?.name ?? null, imageUrl: selectedGame?.imageUrl ?? null, title: title.trim() || selectedGame?.name || 'Actividad', startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), capacity: capacity ? parseInt(capacity) : null, notes: notes.trim() || null }) });
    if (res.ok) { onSuccess('Propuesta enviada, pendiente de aprobación.'); setSelectedGame(null); setTitle(''); setStartsAt(''); setEndsAt(''); setCapacity(''); setNotes(''); setQ(''); setResults([]); }
    else { const d = await res.json().catch(() => ({})); setLocalError(humanError(d.error?.code || d.error)); }
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input placeholder="Buscar juego en SteamGridDB (opcional)..." value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ flex: 1 }} />
        <button onClick={handleSearch} disabled={searching} style={touchBtn}>{searching ? '...' : 'BUSCAR'}</button>
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
      {localError && <div className="alert error">{localError}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <input placeholder="Título de la actividad *" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div><label>INICIO *</label><input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></div>
          <div><label>FIN *</label><input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} /></div>
        </div>
        <input type="number" min="1" max="100" placeholder="Capacidad (opcional)" value={capacity} onChange={e => setCapacity(e.target.value)} />
        <input placeholder="Notas (opcional)" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} />
        <button onClick={handleSubmit} className="primary" style={touchBtn}>PROPONER ACTIVIDAD</button>
      </div>
    </div>
  );
}

function ProposeTournamentForm({ onSuccess }: { onSuccess: (msg: string) => void }) {
  const [q, setQ] = useState(''); const [results, setResults] = useState<any[]>([]); const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [name, setName] = useState(''); const [maxParticipants, setMaxParticipants] = useState('8');
  const [localError, setLocalError] = useState<string | null>(null);
  const handleSearch = async () => { if (!q.trim()) return; setSearching(true); const r = await fetch(`/api/games/search?q=${encodeURIComponent(q)}`); if (r.ok) setResults((await r.json()).games || []); setSearching(false); };
  const handleSubmit = async () => {
    setLocalError(null);
    if (!selectedGame) { setLocalError('Elige un juego de la búsqueda.'); return; }
    if (!name.trim()) { setLocalError('Ponle un nombre al torneo.'); return; }
    const mp = parseInt(maxParticipants) || 0;
    if (mp < 2 || mp > 16) { setLocalError('Máximo entre 2 y 16 participantes.'); return; }
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/tournament-proposals', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ gameName: selectedGame.name, imageUrl: selectedGame.imageUrl, name: name.trim(), maxParticipants: mp }) });
    if (res.ok) { onSuccess('Torneo propuesto, pendiente de aprobación.'); setSelectedGame(null); setName(''); setQ(''); setResults([]); }
    else { const d = await res.json().catch(() => ({})); setLocalError(humanError(d.error?.code || d.error)); }
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input placeholder="Buscar juego en SteamGridDB..." value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ flex: 1 }} />
        <button onClick={handleSearch} disabled={searching} style={touchBtn}>{searching ? '...' : 'BUSCAR'}</button>
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
      {localError && <div className="alert error">{localError}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <input placeholder="Nombre del torneo *" value={name} onChange={e => setName(e.target.value)} maxLength={120} />
        <input type="number" min="2" max="16" placeholder="Max participantes (2-16)" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} />
        <button onClick={handleSubmit} className="primary" style={touchBtn}>PROPONER TORNEO</button>
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
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [myPoints, setMyPoints] = useState<{ party: { points: number; rank: number } | null; all: { points: number; rank: number } | null }>({ party: null, all: null });
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [user, loading, navigate]);

  const fetchPlanning = async (signal?: AbortSignal) => {
    const res = await fetch('/api/planning', { signal }).catch(() => null);
    if (res && res.ok) { const d = await res.json(); setActivities(d.activities || []); }
    const ap = await fetch('/api/activity-proposals', { signal }).catch(() => null); if (ap && ap.ok) setActivityProposals((await ap.json()).proposals || []);
    const tp = await fetch('/api/tournament-proposals', { signal }).catch(() => null); if (tp && tp.ok) setTournamentProposals((await tp.json()).proposals || []);
  };

  const fetchTournaments = async (signal?: AbortSignal) => {
    const res = await fetch('/api/tournaments', { signal }).catch(() => null);
    if (res && res.ok) setTournaments((await res.json()).tournaments);
  };

  const fetchAll = async (signal?: AbortSignal) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const pa = await fetch('/api/parties/active', { signal }).catch(() => null);
      if (pa && pa.ok) setActiveParty((await pa.json()).party);
      const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
      await fetch('/api/participants/join', { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' }, signal }).catch(() => {});
      await Promise.all([fetchPlanning(signal), fetchTournaments(signal)]);
    } finally { fetchingRef.current = false; setLoadingData(false); }
  };

  const fetchMyPoints = async (partyId?: number) => {
    if (!user) return;
    const pick = (board: any[]) => {
      const i = board.findIndex((p: any) => p.participantId === user.id);
      return i < 0 ? { points: 0, rank: board.length + 1 } : { points: board[i].points, rank: i + 1 };
    };
    const [a, b] = await Promise.all([
      partyId ? fetch(`/api/leaderboard?partyId=${partyId}`).then(r => r.ok ? r.json() : null).catch(() => null) : null,
      fetch('/api/leaderboard/all-time').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    setMyPoints({ party: a ? pick(a.leaderboard || []) : null, all: b ? pick(b.leaderboard || []) : null });
  };

  useEffect(() => { if (user) fetchMyPoints(activeParty?.id); }, [user, activeParty]);

  useEffect(() => {
    if (!user) return;
    const ctrl = new AbortController();
    fetchAll(ctrl.signal);
    const id = setInterval(() => fetchAll(), 20000);
    const onVis = () => { if (document.visibilityState === 'visible') fetchAll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const ok = (msg: string) => { setNotice(msg); setError(null); };
  const fail = (code: unknown) => { setError(humanError(code)); };

  const handleJoinActivity = async (activityId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/activities/${activityId}/join`, { method: 'PUT', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (!res.ok) { const err = await res.json().catch(() => ({})); fail(err.error?.code || err.error); }
    else { ok('Te has unido a la actividad.'); fetchPlanning(); }
  };

  const handleLeaveActivity = async (activityId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/activities/${activityId}/leave`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } }).catch(() => null);
    if (res && res.ok) ok('Has salido de la actividad.');
    fetchPlanning();
  };

  const handleJoinTournament = async (tournamentId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/tournaments/${tournamentId}/join`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (!res.ok) { const err = await res.json().catch(() => ({})); fail(err.error?.code || err.error); }
    else ok('Inscripción confirmada.');
    fetchTournaments();
  };

  const handleLeaveTournament = async (tournamentId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/tournaments/${tournamentId}/leave`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } }).catch(() => null);
    if (res && res.ok) ok('Has salido del torneo.');
    else if (res) { const err = await res.json().catch(() => ({})); fail(err.error?.code || err.error); }
    fetchTournaments();
  };

  const handleWithdraw = async (kind: 'activity' | 'tournament', id: number) => {
    if (!(await confirmDialog('¿Retirar tu propuesta?', { confirmLabel: 'RETIRAR', danger: true }))) return;
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const url = kind === 'activity' ? `/api/activity-proposals/${id}` : `/api/tournament-proposals/${id}`;
    const res = await fetch(url, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } }).catch(() => null);
    if (res && res.ok) ok('Propuesta retirada.');
    fetchPlanning();
  };

  const handleVoteProposal = async (kind: 'activity' | 'tournament', id: number, voted: boolean) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const url = kind === 'activity' ? `/api/activity-proposals/${id}/vote` : `/api/tournament-proposals/${id}/vote`;
    const res = await fetch(url, { method: voted ? 'DELETE' : 'PUT', headers: { 'X-Partyman-CSRF': csrf || '' } }).catch(() => null);
    if (res && res.ok) {
      const d = await res.json().catch(() => ({}));
      if (d.approved) ok('¡Aprobada por votos!');
      else if (!voted) ok('Voto registrado.');
    }
    fetchPlanning();
  };

  if (loading) return <div className="container"><div className="loading">Cargando…</div></div>;
  if (!user) return <div className="container"><div className="loading">Redirigiendo al login…</div></div>;

  return (
    <div className="container">
      <div className="header">
        <h1>PARTYMAN</h1>
        <div className="nav">
          <span style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>{user.displayName}</span>
          <a href="/leaderboard">RANKING →</a>
          {user.role === 'admin' && <a href="/admin">ADMIN →</a>}
          <a href="/display" target="_blank">DISPLAY →</a>
          <button onClick={logout} style={headerBtn}>SALIR</button>
        </div>
      </div>

      {error && <div className="alert error">{error} <button onClick={() => setError(null)} style={{ ...touchBtn, marginLeft: '0.5rem' }}>X</button></div>}
      {notice && <div className="alert success">{notice} <button onClick={() => setNotice(null)} style={{ ...touchBtn, marginLeft: '0.5rem' }}>X</button></div>}

      <div className="card">
        <h2>PERFIL</h2>
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={`Avatar de ${user.displayName}`} style={{ width: '64px', height: '64px', borderRadius: '50%', border: '2px solid var(--neon-cyan)' }} />
          ) : (
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--bg)' }}>
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ flex: '1 1 auto' }}><p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{user.displayName}</p><a href={`/history/${user.id}`} style={{ fontSize: '0.7rem' }}>Ver historial →</a></div>
          <div style={{ textAlign: 'right', marginLeft: 'auto' }}>
            {myPoints.party && <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '0.625rem', color: 'var(--neon-green)' }}>{myPoints.party.points} PTS · #{myPoints.party.rank} PARTY</p>}
            {myPoints.all && <p style={{ margin: '0.25rem 0 0', fontFamily: 'var(--font-display)', fontSize: '0.625rem', color: 'var(--neon-cyan)' }}>{myPoints.all.points} PTS · #{myPoints.all.rank} TOTAL</p>}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>PARTY ACTUAL</h2>
        {activeParty ? (
          <div style={{ marginTop: '1rem' }}>
            <h3 style={{ color: 'var(--neon-green)', marginBottom: '0.5rem' }}>{activeParty.name}</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)' }}>
              {new Date(activeParty.startsAt).toLocaleDateString('es-ES')} - {new Date(activeParty.endsAt).toLocaleDateString('es-ES')}
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
          <div id="actividades" className="card" style={{ marginTop: '1rem' }}>
            <h2>ACTIVIDADES</h2>
            {loadingData ? <div className="loading">Cargando actividades…</div> : activities.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: '0.5rem' }}>No hay actividades programadas</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {activities.map(a => {
                  const isJoined = a.participants?.some(p => p.id === user?.id);
                  const isFull = a.capacity != null && (a.participantCount || 0) >= a.capacity;
                  const now = new Date(); const isLive = a.status !== 'finished' && a.status !== 'cancelled' && new Date(a.startsAt) <= now && now <= new Date(a.endsAt);
                  return (
                    <div key={a.id} className="list-item" style={{ ...rowColumn, borderColor: isLive ? 'var(--neon-green)' : undefined, background: isLive ? 'rgba(0,255,136,0.05)' : undefined }}>
                      <div style={{ ...rowMain, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {a.gameImage && <img src={a.gameImage} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <h3 style={rowTitle}>{a.title}</h3>
                            {isLive && <span style={badge('var(--neon-green)')}>EN CURSO</span>}
                          </div>
                          <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                            {a.gameTitle ? `${a.gameTitle} · ` : ''}
                            {new Date(a.startsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {new Date(a.endsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            {a.capacity ? ` · ${a.participantCount || 0}/${a.capacity}` : ''}
                          </p>
                          {a.notes && <p style={{ margin: '0.25rem 0 0', color: 'var(--text-dim)', fontSize: '0.7rem', fontStyle: 'italic' }}>{a.notes}</p>}
                        </div>
                      </div>
                      <div style={{ ...rowFooter, flexWrap: 'wrap' }}>
                        {isJoined && (
                          <span style={badge('var(--neon-green)')}>INSCRITO</span>
                        )}
                        {isJoined ? (
                          <button onClick={() => handleLeaveActivity(a.id)} style={{ ...touchBtn, borderColor: 'var(--error)', color: 'var(--error)' }}>SALIR</button>
                        ) : (
                          <button onClick={() => handleJoinActivity(a.id)} disabled={isFull} style={touchBtn}>
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
              <button onClick={() => setShowActivityForm(!showActivityForm)} style={touchBtn}>{showActivityForm ? 'CERRAR' : '+ PROPONER'}</button>
            </div>
            {showActivityForm && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>Propón una actividad para la party. El admin la programará.</p>
                <ProposeActivityForm onSuccess={(m) => { ok(m); fetchPlanning(); setShowActivityForm(false); }} />
              </div>
            )}
            {activityProposals.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Tus propuestas pendientes ({activityProposals.length}):</p>
                {activityProposals.map((p: any) => (
                    <div key={p.id} className="list-item" style={rowColumn}>
                      <span style={{ ...rowMain, fontSize: '0.875rem' }}>{p.title} {p.gameTitle ? `· ${p.gameTitle}` : ''} · <span style={{ color: 'var(--neon-cyan)' }}>pendiente ({p.voteCount || 0}/3)</span></span>
                      <div style={{ ...rowFooter, flexWrap: 'wrap' }}>
                        <button onClick={() => handleVoteProposal('activity', p.id, !!p.voted)} style={{ ...rowBtnTouch, borderColor: p.voted ? 'var(--neon-green)' : undefined, color: p.voted ? 'var(--neon-green)' : undefined }}>{p.voted ? 'VOTADO ✓' : 'VOTAR'}</button>
                        <button onClick={() => handleWithdraw('activity', p.id)} style={{ ...rowBtnTouch, borderColor: 'var(--error)', color: 'var(--error)' }}>RETIRAR</button>
                      </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h2>TORNEOS</h2>
            {loadingData ? <div className="loading">Cargando torneos…</div> : tournaments.length === 0 ? (
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
                    <div key={t.id} className="list-item" style={rowColumn}>
                      <div style={{ ...rowMain, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {t.gameImage && <img src={t.gameImage} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
                        <div style={{ minWidth: 0 }}>
                          <h3 style={rowTitle}>{t.name}</h3>
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
                      <div style={{ ...rowFooter, flexWrap: 'wrap' }}>
                        <span style={badge(statusInfo.color)}>
                          {statusInfo.label}
                        </span>
                        {(t.status === 'in_progress' || t.status === 'finished') && (
                          <a href={`/tournaments/${t.id}`} style={rowViewTouch}>VER BRACKET →</a>
                        )}
                        {canJoin && (
                          isMember ? (
                            <button onClick={() => handleLeaveTournament(t.id)} style={{ ...touchBtn, borderColor: 'var(--error)', color: 'var(--error)' }}>SALIR</button>
                          ) : (
                            <button onClick={() => handleJoinTournament(t.id)} style={touchBtn}>INSCRIBIRME</button>
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
              <button onClick={() => setShowTournamentForm(!showTournamentForm)} style={touchBtn}>{showTournamentForm ? 'CERRAR' : '+ PROPONER'}</button>
            </div>
            {showTournamentForm && (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '0.75rem' }}>Propón un torneo. El admin lo creará.</p>
                <ProposeTournamentForm onSuccess={(m) => { ok(m); fetchPlanning(); setShowTournamentForm(false); }} />
              </div>
            )}
            {tournamentProposals.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Tus propuestas pendientes ({tournamentProposals.length}):</p>
                {tournamentProposals.map((p: any) => (
                  <div key={p.id} className="list-item" style={rowColumn}>
                    <span style={{ ...rowMain, fontSize: '0.875rem' }}>{p.name} · {p.gameTitle} · <span style={{ color: 'var(--neon-cyan)' }}>pendiente ({p.voteCount || 0}/3)</span></span>
                    <div style={{ ...rowFooter, flexWrap: 'wrap' }}>
                      <button onClick={() => handleVoteProposal('tournament', p.id, !!p.voted)} style={{ ...rowBtnTouch, borderColor: p.voted ? 'var(--neon-green)' : undefined, color: p.voted ? 'var(--neon-green)' : undefined }}>{p.voted ? 'VOTADO ✓' : 'VOTAR'}</button>
                      <button onClick={() => handleWithdraw('tournament', p.id)} style={{ ...rowBtnTouch, borderColor: 'var(--error)', color: 'var(--error)' }}>RETIRAR</button>
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
