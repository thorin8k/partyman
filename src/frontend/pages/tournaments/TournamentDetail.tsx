import { useAuth } from '../../components/AuthContext';
import { useLocation, useParams } from 'wouter';
import { useEffect, useState } from 'react';

interface Tournament {
  id: number;
  name: string;
  gameTitleSnapshot: string;
  status: string;
  maxParticipants: number;
  participants: Array<{ id: number; displayName: string; seed: number }>;
  matches: Array<{ id: number; round: number; position: number; participantAId: number | null; participantBId: number | null; participantA: string | null; participantB: string | null; winnerId: number | null; winner: string | null; score: { a: number; b: number } | null; status: string; disputed?: boolean; reportCount?: number; disputeVotes?: Array<{ participantId: number; displayName: string; winnerId: number }> }>;
}

export function ParticipantTournamentDetail() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams();
  const tournamentId = params?.id;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportMatch, setReportMatch] = useState<number | null>(null);
  const [reportWinner, setReportWinner] = useState('');
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user && tournamentId) fetchTournament();
  }, [user, tournamentId]);

  const fetchTournament = async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}`);
    if (res.ok) setTournament((await res.json()).tournament);
    else setError('Torneo no encontrado');
  };

  const handleReport = async () => {
    if (!reportMatch || !reportWinner) { setError('Elige el ganador del partido.'); return; }
    const a = parseInt(scoreA); const b = parseInt(scoreB);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 99 || b < 0 || b > 99) { setError('Los puntos deben ser enteros de 0 a 99.'); return; }
    if (a === b) { setError('No hay empates: los puntos deben ser distintos.'); return; }
    const m = tournament?.matches.find(x => x.id === reportMatch);
    if (m) {
      const winnerIsA = parseInt(reportWinner) === m.participantAId;
      const winnerScore = winnerIsA ? a : b; const loserScore = winnerIsA ? b : a;
      if (winnerScore <= loserScore) { setError('El ganador debe tener más puntos.'); return; }
    }
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/matches/${reportMatch}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ winnerId: parseInt(reportWinner), score: { a, b } }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(apiMsg(err, 'Error al reportar')); }
    else { setReportMatch(null); setReportWinner(''); setScoreA(''); setScoreB(''); setError(null); fetchTournament(); }
  };

  const STATUS_ES: Record<string, string> = { draft: 'Borrador', upcoming: 'Inscripción abierta', in_progress: 'En curso', finished: 'Finalizado', cancelled: 'Cancelado' };

  // Códigos de error → castellano legible (el API devuelve { error: { code } }).
  const apiMsg = (err: any, fallback: string) => {
    const code = err?.error?.code || err?.error;
    if (code === 'NOT_IN_MATCH') return 'No participas en este partido.';
    if (code === 'INVALID_WINNER') return 'Ese jugador no juega este partido.';
    if (code === 'IN_MATCH') return 'No puedes votar en tu propia disputa.';
    if (typeof code === 'string' && code.length < 60) return code.replace(/_/g, ' ').toLowerCase();
    return fallback;
  };

  if (loading) return <div className="container"><div className="loading">Cargando torneo…</div></div>;
  if (!user) return <div className="container"><div className="loading">Redirigiendo al login…</div></div>;
  if (error && !tournament) {
    return (
      <div className="container">
        <div className="header">
          <h1>PARTYMAN</h1>
          <div className="nav"><a href="/">VOLVER →</a></div>
        </div>
        <div className="card"><div className="alert error">{error}</div></div>
      </div>
    );
  }
  if (!tournament) return <div className="container"><div className="loading">Cargando torneo...</div></div>;

  const rounds = [...new Set(tournament.matches.map(m => m.round))].sort((a, b) => a - b);
  // ponytail: etiquetas relativas a la final (funciona con 2-16 jugadores).
  const roundLabel = (round: number) => {
    const max = Math.max(...rounds);
    const fromEnd = max - round;
    if (fromEnd === 0) return 'FINAL';
    if (fromEnd === 1) return 'SEMIFINAL';
    if (fromEnd === 2) return 'CUARTOS';
    return `RONDA ${round}`;
  };

  const isMyMatch = (m: { participantAId: number | null; participantBId: number | null }) => {
    return user.id === m.participantAId || user.id === m.participantBId;
  };

  const isOutsider = (m: { participantAId: number | null; participantBId: number | null }) => {
    return !isMyMatch(m) && tournament?.participants.some(p => p.id === user.id);
  };

  const handleDisputeVote = async (matchId: number, winnerId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/disputes/${matchId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ winnerId }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(apiMsg(err, 'Error al votar')); }
    else fetchTournament();
  };

  return (
    <div className="container">
      <div className="header">
        <h1>PARTYMAN</h1>
        <div className="nav">
          <a href="/">VOLVER →</a>
          <button onClick={logout} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>SALIR</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h2>{tournament.name}</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          {tournament.gameTitleSnapshot} · {STATUS_ES[tournament.status] || tournament.status} · {tournament.participants.length}/{tournament.maxParticipants}
        </p>
        {tournament.status === 'finished' && (() => {
          const maxRound = Math.max(...tournament.matches.map(m => m.round));
          const final = tournament.matches.find(m => m.round === maxRound && m.status === 'confirmed' && m.winner);
          return final?.winner ? (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,255,136,0.1)', border: '1px solid var(--neon-green)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.625rem', color: 'var(--neon-green)' }}>CAMPEÓN</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--neon-green)', marginTop: '0.25rem' }}>{final.winner}</div>
              {final.score && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{final.score.a} - {final.score.b}</span>}
            </div>
          ) : null;
        })()}
      </div>

      {tournament.matches.length > 0 ? (
        <div className="card" style={{ marginTop: '1rem', overflow: 'hidden' }}>
          <h2>BRACKET</h2>
          <div style={{ display: 'flex', gap: '2rem', overflowX: 'auto', marginTop: '1rem', padding: '1rem 0', alignItems: 'stretch' }}>
            {rounds.map(round => (
              <div key={round} style={{ minWidth: '220px', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '0.625rem', color: 'var(--neon-cyan)', marginBottom: '1rem', textAlign: 'center', fontFamily: 'var(--font-display)' }}>
                  {roundLabel(round)}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, gap: '1rem' }}>
                  {tournament.matches.filter(m => m.round === round).map(m => (
                    <div key={m.id} style={{
                      padding: '0.75rem',
                      background: isMyMatch(m) ? 'rgba(0,212,255,0.08)' : m.status === 'confirmed' ? 'rgba(0,255,136,0.06)' : 'var(--bg-secondary)',
                      border: `1px solid ${m.status === 'confirmed' ? 'var(--neon-green)' : isMyMatch(m) ? 'var(--neon-cyan)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius)',
                      position: 'relative',
                      boxShadow: isMyMatch(m) ? '0 0 8px rgba(0,212,255,0.15)' : 'none',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: m.winner === m.participantA ? 'bold' : 'normal', color: m.winner === m.participantA ? 'var(--neon-green)' : 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.participantA || '—'}
                        </span>
                        {m.score && <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>{m.score.a}</span>}
                      </div>
                      <div style={{ height: '1px', background: 'var(--border)', margin: '0.5rem 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: m.winner === m.participantB ? 'bold' : 'normal', color: m.winner === m.participantB ? 'var(--neon-green)' : 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.participantB || 'BYE'}
                        </span>
                        {m.score && <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>{m.score.b}</span>}
                      </div>
                      {(m.status === 'pending' || m.status === 'reported') && isMyMatch(m) && (
                        <button onClick={() => setReportMatch(m.id)} style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.625rem', padding: '0.375rem' }}>REPORTAR</button>
                      )}
                      {m.status === 'reported' && !m.disputed && (
                        <span style={{ display: 'block', textAlign: 'center', marginTop: '0.5rem', fontSize: '0.5rem', color: 'var(--neon-orange)', fontFamily: 'var(--font-display)' }}>ESPERANDO CONFIRMACIÓN</span>
                      )}
                      {m.status === 'reported' && m.disputed && (
                        <span style={{ display: 'block', textAlign: 'center', marginTop: '0.5rem', fontSize: '0.5rem', color: 'var(--error)', fontFamily: 'var(--font-display)' }}>EN DISPUTA ({m.disputeVotes?.length || 0} votos)</span>
                      )}
                      {m.status === 'reported' && m.disputed && isOutsider(m) && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                          {m.participantAId && <button onClick={() => handleDisputeVote(m.id, m.participantAId!)} style={{ flex: 1, fontSize: '0.5rem', padding: '0.375rem' }}>A GANA</button>}
                          {m.participantBId && <button onClick={() => handleDisputeVote(m.id, m.participantBId!)} style={{ flex: 1, fontSize: '0.5rem', padding: '0.375rem' }}>B GANA</button>}
                        </div>
                      )}
                      {m.status === 'confirmed' && m.winner && (
                        <span style={{ display: 'block', textAlign: 'center', marginTop: '0.5rem', fontSize: '0.5rem', color: 'var(--neon-green)', fontFamily: 'var(--font-display)' }}>GANADOR: {m.winner}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: '1rem' }}>
          <p style={{ color: 'var(--text-dim)' }}>Bracket no generado aún. Esperando a que inicie el torneo.</p>
        </div>
      )}

      {reportMatch && (() => {
        const m = tournament.matches.find(x => x.id === reportMatch);
        return (
        <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--neon-cyan)' }}>
          <h2>REPORTAR RESULTADO</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label>GANADOR</label>
              <select value={reportWinner} onChange={e => setReportWinner(e.target.value)}>
                <option value="">Selecciona ganador...</option>
                {m?.participantAId && <option value={m.participantAId}>{m.participantA}</option>}
                {m?.participantBId && <option value={m.participantBId}>{m.participantB}</option>}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div className="form-group"><label>{m?.participantA ?? 'SCORE A'}</label><input type="number" min="0" max="99" value={scoreA} onChange={e => setScoreA(e.target.value)} placeholder={m?.participantA ?? '0'} /></div>
              <div className="form-group"><label>{m?.participantB ?? 'SCORE B'}</label><input type="number" min="0" max="99" value={scoreB} onChange={e => setScoreB(e.target.value)} placeholder={m?.participantB ?? '0'} /></div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="primary" onClick={handleReport}>ENVIAR</button>
              <button onClick={() => setReportMatch(null)}>CANCELAR</button>
            </div>
          </div>
        </div>
        );
      })()}
     </div>
   );
}
