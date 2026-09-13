import { useAuth } from '../../components/AuthContext';
import { apiError } from '../../components/apiError';
import { confirmDialog } from '../../components/ConfirmDialog';
import { headerBtn, rowBtn } from '../../components/listRow';
import { isByeSlot, slotLabel } from '../../components/bracket';
import { useLocation, useParams } from 'wouter';
import { useEffect, useState } from 'react';

interface Tournament {
  id: number;
  name: string;
  gameTitleSnapshot: string;
  status: string;
  format?: string;
  maxParticipants: number;
  participants: Array<{ id: number; displayName: string; seed: number }>;
  matches: Array<{ id: number; round: number; position: number; participantAId: number | null; participantBId: number | null; participantA: string | null; participantB: string | null; winnerId: number | null; winner: string | null; score: { a: number; b: number } | null; status: string }>;
}

export function TournamentDetail() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams();
  const tournamentId = params?.id;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportMatch, setReportMatch] = useState<number | null>(null);
  const [reportWinner, setReportWinner] = useState<string>('');
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [devTools, setDevTools] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/admin/login');
    else if (!loading && user?.role !== 'admin') navigate('/');
  }, [user, loading, navigate]);

  useEffect(() => { if (user?.role === 'admin' && tournamentId) { fetchTournament(); fetch('/api/auth/config').then(r => r.json()).then(c => setDevTools(!!c.devTools)).catch(() => {}); } }, [user, tournamentId]);

  const fetchTournament = async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}`);
    if (res.ok) setTournament((await res.json()).tournament);
  };

  const handleAddParticipant = async (participantId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/participants`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ participantId }),
    });
    if (!res.ok) { const err = await res.json(); setError(apiError(err)); }
    fetchTournament();
  };

  const handleFillBots = async () => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/fill-bots`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (!res.ok) { const err = await res.json(); setError(apiError(err)); }
    fetchTournament();
  };

  const handleChangeFormat = async (format: string) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/format`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ format }),
    });
    if (!res.ok) { const err = await res.json(); setError(apiError(err)); }
    fetchTournament();
  };

  const handleDeleteTournament = async () => {
    if (!(await confirmDialog('¿Eliminar este torneo?', { confirmLabel: 'ELIMINAR', danger: true }))) return;
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/delete`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (res.ok) navigate('/admin/tournaments');
    else { const err = await res.json(); setError(apiError(err)); }
  };

  const handleConfirmMatch = async () => {
    if (!reportMatch || !reportWinner) return;
    const a = scoreA === '' ? null : parseInt(scoreA);
    const b = scoreB === '' ? null : parseInt(scoreB);
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/matches/${reportMatch}/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ winnerId: parseInt(reportWinner), ...(a != null && b != null ? { score: { a, b } } : {}) }),
    });
    if (!res.ok) { const err = await res.json(); setError(apiError(err)); }
    else { setReportMatch(null); setReportWinner(''); setScoreA(''); setScoreB(''); }
    fetchTournament();
  };

  if (loading) return <div className="container"><div className="loading">Cargando…</div></div>;
  if (!user || user.role !== 'admin') return <div className="container"><div className="loading">Redirigiendo…</div></div>;
  if (!tournament) return <div className="container"><div className="loading">Cargando torneo...</div></div>;

  const rounds = [...new Set(tournament.matches.map(m => m.round))].sort((a, b) => a - b);
  const orderedRounds = [...rounds.filter(r => r !== 0), ...(rounds.includes(0) ? [0] : [])];
  const TOTAL_ROUNDS = rounds.filter(r => r !== 0).length;
  // ponytail: etiquetas relativas a la final (funciona con 2-16 jugadores).
  const roundLabel = (round: number) => {
    if (round === 0) return 'TERCER PUESTO';
    const fromEnd = TOTAL_ROUNDS - round;
    if (fromEnd === 0) return 'FINAL';
    if (fromEnd === 1) return 'SEMIFINAL';
    if (fromEnd === 2) return 'CUARTOS';
    return `RONDA ${round}`;
  };
  const STATUS_ES: Record<string, string> = { draft: 'Borrador', upcoming: 'Inscripción abierta', in_progress: 'En curso', finished: 'Finalizado', cancelled: 'Cancelado' };

  return (
    <div className="container">
      <div className="header">
        <h1>ADMIN</h1>
        <div className="nav">
          <a href="/admin/tournaments">TORNEOS →</a>
          <button onClick={logout} style={headerBtn}>SALIR</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>{tournament.name}</h2>
          <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            {(tournament.status === 'upcoming' || tournament.status === 'draft') ? (
              <select value={tournament.format ?? 'single'} onChange={e => handleChangeFormat(e.target.value)} aria-label="Formato" style={rowBtn}>
                <option value="single">Simple</option>
                <option value="single_third">Simple + 3er puesto</option>
              </select>
            ) : null}
            <span style={{ padding: '0.25rem 0.75rem', border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)', fontFamily: 'var(--font-display)', fontSize: '0.5rem' }}>
              {STATUS_ES[tournament.status] || tournament.status}
            </span>
          </span>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>
          {tournament.gameTitleSnapshot} · Max {tournament.maxParticipants} · {tournament.participants.length} inscritos{(tournament.format ?? 'single') === 'single_third' ? ' · 3er puesto' : ''}
        </p>
        {tournament.status === 'finished' && (() => {
          const maxRound = Math.max(...tournament.matches.map(m => m.round));
          const final = tournament.matches.find(m => m.round === maxRound && m.winner);
          return final?.winner ? (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,255,136,0.1)', border: '1px solid var(--neon-green)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.625rem', color: 'var(--neon-green)' }}>CAMPEÓN</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--neon-green)', marginTop: '0.25rem' }}>{final.winner}</div>
              {final.score && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{final.score.a} - {final.score.b}</span>}
            </div>
          ) : null;
        })()}
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>PARTICIPANTES ({tournament.participants.length})</h2>
        {tournament.participants.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Sin participantes</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {tournament.participants.map(p => (
              <div key={p.id} className="list-item" style={{ padding: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem' }}>#{p.seed} {p.displayName}</span>
              </div>
            ))}
          </div>
        )}
        {devTools && tournament.status === 'draft' && (
          <button onClick={handleFillBots} style={{ ...rowBtn, marginTop: '1rem', borderColor: 'var(--neon-magenta)', color: 'var(--neon-magenta)' }}>
            + RELLENAR CON BOTS (DEV)
          </button>
        )}
      </div>

      {tournament.matches.length > 0 && (
        <div className="card" style={{ marginTop: '1rem', overflow: 'hidden' }}>
          <h2>BRACKET</h2>
          <div style={{ display: 'flex', gap: '2rem', overflowX: 'auto', marginTop: '1rem', padding: '1rem 0', alignItems: 'stretch' }}>
            {orderedRounds.map(round => {
              const roundMatches = tournament.matches.filter(m => m.round === round);
              const isLastRound = round === Math.max(...rounds);
              return (
                <div key={round} style={{ minWidth: '220px', display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ fontSize: '0.625rem', color: 'var(--neon-cyan)', marginBottom: '1rem', textAlign: 'center', fontFamily: 'var(--font-display)' }}>
                    {roundLabel(round)}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, gap: '1rem' }}>
                    {roundMatches.map(m => (
                      <div key={m.id} style={{
                        padding: '0.75rem',
                        background: m.status === 'confirmed' ? 'rgba(0,255,136,0.06)' : 'var(--bg-secondary)',
                        border: `1px solid ${m.status === 'confirmed' ? 'var(--neon-green)' : m.status === 'reported' ? 'var(--neon-orange)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)',
                        position: 'relative',
                        boxShadow: m.status === 'confirmed' ? '0 0 8px rgba(0,255,136,0.15)' : 'none',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: m.winner === m.participantA ? 'bold' : 'normal', color: m.winner === m.participantA ? 'var(--neon-green)' : 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {slotLabel(m.participantA, m)}
                          </span>
                          {m.score && <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>{m.score.a}</span>}
                        </div>
                        <div style={{ height: '1px', background: 'var(--border)', margin: '0.5rem 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: m.winner === m.participantB ? 'bold' : 'normal', color: m.winner === m.participantB ? 'var(--neon-green)' : 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {slotLabel(m.participantB, m)}
                          </span>
                          {m.score && <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>{m.score.b}</span>}
                        </div>
                        {m.status === 'confirmed' && m.winner && isByeSlot(m) && (
                          <span style={{ display: 'block', textAlign: 'center', marginTop: '0.5rem', fontSize: '0.5rem', color: 'var(--neon-green)', fontFamily: 'var(--font-display)' }}>PASA DIRECTO</span>
                        )}
                        {(m.status === 'reported' || (m.status === 'pending' && m.participantAId && m.participantBId)) && (
                          reportMatch === m.id ? (
                            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              <select value={reportWinner} onChange={e => setReportWinner(e.target.value)} style={{ fontSize: '0.7rem', padding: '0.375rem' }}>
                                <option value="">Ganador...</option>
                                {m.participantAId && <option value={m.participantAId}>{m.participantA}</option>}
                                {m.participantBId && <option value={m.participantBId}>{m.participantB}</option>}
                              </select>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input type="number" min="0" max="99" placeholder={m.participantA ?? 'A'} value={scoreA} onChange={e => setScoreA(e.target.value)} style={{ flex: 1, fontSize: '0.7rem', padding: '0.375rem' }} />
                                <input type="number" min="0" max="99" placeholder={m.participantB ?? 'B'} value={scoreB} onChange={e => setScoreB(e.target.value)} style={{ flex: 1, fontSize: '0.7rem', padding: '0.375rem' }} />
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={handleConfirmMatch} style={{ flex: 1, fontSize: '0.625rem', padding: '0.375rem' }} className="primary">ENVIAR</button>
                                <button onClick={() => setReportMatch(null)} style={{ flex: 1, fontSize: '0.625rem', padding: '0.375rem' }}>CANCELAR</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setReportMatch(m.id)} style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.625rem', padding: '0.375rem' }}>{m.status === 'pending' ? 'RELLENAR' : 'CONFIRMAR'}</button>
                          )
                        )}
                        {m.status === 'confirmed' && (
                          reportMatch === m.id ? (
                            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              <select value={reportWinner} onChange={e => setReportWinner(e.target.value)} style={{ fontSize: '0.7rem', padding: '0.375rem' }}>
                                <option value="">Ganador...</option>
                                {m.participantAId && <option value={m.participantAId}>{m.participantA}</option>}
                                {m.participantBId && <option value={m.participantBId}>{m.participantB}</option>}
                              </select>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input type="number" min="0" max="99" placeholder={m.participantA ?? 'A'} value={scoreA} onChange={e => setScoreA(e.target.value)} style={{ flex: 1, fontSize: '0.7rem', padding: '0.375rem' }} />
                                <input type="number" min="0" max="99" placeholder={m.participantB ?? 'B'} value={scoreB} onChange={e => setScoreB(e.target.value)} style={{ flex: 1, fontSize: '0.7rem', padding: '0.375rem' }} />
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={handleConfirmMatch} style={{ flex: 1, fontSize: '0.625rem', padding: '0.375rem' }} className="primary">GUARDAR</button>
                                <button onClick={() => setReportMatch(null)} style={{ flex: 1, fontSize: '0.625rem', padding: '0.375rem' }}>CANCELAR</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setReportMatch(m.id)} style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.625rem', padding: '0.25rem', borderColor: 'var(--neon-magenta)', color: 'var(--neon-magenta)' }}>EDITAR</button>
                          )
                        )}
                        {!isLastRound && (
                          <div style={{ position: 'absolute', right: '-1rem', top: '50%', width: '1rem', height: '1px', background: 'var(--border)' }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--error)' }}>
        <h2 style={{ color: 'var(--error)' }}>ZONA PELIGROSA</h2>
        <button onClick={handleDeleteTournament} className="danger" style={{ width: '100%', marginTop: '1rem' }}>ELIMINAR TORNEO</button>
      </div>
    </div>
  );
}
