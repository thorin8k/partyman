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

  useEffect(() => {
    if (!loading && !user) navigate('/admin/login');
    else if (!loading && user?.role !== 'admin') navigate('/');
  }, [user, loading, navigate]);

  useEffect(() => { if (user?.role === 'admin' && tournamentId) fetchTournament(); }, [user, tournamentId]);

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
    if (!res.ok) { const err = await res.json(); setError(err.error || 'Error'); }
    fetchTournament();
  };

  const handleFillBots = async () => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/fill-bots`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (!res.ok) { const err = await res.json(); setError(err.error || 'Error'); }
    fetchTournament();
  };

  const handleDeleteTournament = async () => {
    if (!confirm('¿Eliminar este torneo?')) return;
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/delete`, { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '' } });
    if (res.ok) navigate('/admin/tournaments');
    else { const err = await res.json(); setError(err.error || 'Error'); }
  };

  const handleConfirmMatch = async () => {
    if (!reportMatch || !reportWinner) return;
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/matches/${reportMatch}/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ winnerId: parseInt(reportWinner), score: { a: parseInt(scoreA), b: parseInt(scoreB) } }),
    });
    if (!res.ok) { const err = await res.json(); setError(err.error || 'Error'); }
    else { setReportMatch(null); setReportWinner(''); setScoreA(''); setScoreB(''); }
    fetchTournament();
  };

  if (loading || !user || user.role !== 'admin') return null;
  if (!tournament) return <div className="container"><div className="loading">Cargando torneo...</div></div>;

  const rounds = [...new Set(tournament.matches.map(m => m.round))].sort((a, b) => a - b);
  const roundLabels: Record<number, string> = { 1: 'CUARTOS', 2: 'SEMIFINAL', 3: 'FINAL' };
  const totalRounds = rounds.length;

  return (
    <div className="container">
      <div className="header">
        <h1>ADMIN</h1>
        <div className="nav">
          <a href="/admin/tournaments">TORNEOS →</a>
          <button onClick={logout} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>SALIR</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>{tournament.name}</h2>
          <span style={{ padding: '0.25rem 0.75rem', border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)', fontFamily: 'var(--font-display)', fontSize: '0.4rem' }}>
            {tournament.status}
          </span>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>
          {tournament.gameTitleSnapshot} · Max {tournament.maxParticipants} · {tournament.participants.length} inscritos
        </p>
        {tournament.status === 'finished' && (() => {
          const final = tournament.matches.filter(m => m.status === 'confirmed').sort((a,b) => b.round - a.round)[0];
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
        {tournament.status === 'draft' && (
          <button onClick={handleFillBots} style={{ marginTop: '1rem', fontSize: '0.5rem', borderColor: 'var(--neon-magenta)', color: 'var(--neon-magenta)' }}>
            + RELLENAR CON BOTS (DEV)
          </button>
        )}
      </div>

      <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--error)' }}>
        <h2 style={{ color: 'var(--error)' }}>ZONA PELIGROSA</h2>
        <button onClick={handleDeleteTournament} className="danger" style={{ width: '100%', marginTop: '1rem' }}>ELIMINAR TORNEO</button>
      </div>

      {tournament.matches.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2>BRACKET</h2>
          <div style={{ display: 'flex', gap: '1.5rem', overflowX: 'auto', marginTop: '1rem' }}>
            {rounds.map(round => (
              <div key={round} style={{ minWidth: '200px' }}>
                <h3 style={{ fontSize: '0.625rem', color: 'var(--neon-cyan)', marginBottom: '0.75rem', textAlign: 'center' }}>
                  {roundLabels[round] || `RONDA ${round}`}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {tournament.matches.filter(m => m.round === round).map(m => (
                    <div key={m.id} style={{ padding: '0.5rem', background: 'var(--bg-secondary)', border: `1px solid ${m.status === 'confirmed' ? 'var(--neon-green)' : 'var(--border)'}`, borderRadius: 'var(--radius)' }}>
                      <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: m.winner === m.participantA ? 'var(--neon-green)' : undefined }}>
                        {m.participantA || 'BYE'}
                      </div>
                      <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: m.winner === m.participantB ? 'var(--neon-green)' : undefined }}>
                        {m.participantB || 'BYE'}
                      </div>
                      {m.score && (
                        <div style={{ fontSize: '0.625rem', color: 'var(--text-dim)' }}>
                          {m.score.a} - {m.score.b}
                        </div>
                      )}
                      {(m.status === 'reported' || (m.status === 'pending' && m.participantAId && m.participantBId)) && (
                        reportMatch === m.id ? (
                          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <select value={reportWinner} onChange={e => setReportWinner(e.target.value)} style={{ fontSize: '0.625rem', padding: '0.25rem' }}>
                              <option value="">Ganador...</option>
                              {m.participantAId && <option value={m.participantAId}>{m.participantA}</option>}
                              {m.participantBId && <option value={m.participantBId}>{m.participantB}</option>}
                            </select>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <input type="number" min="0" max="99" placeholder={m.participantA ?? 'A'} value={scoreA} onChange={e => setScoreA(e.target.value)} style={{ width: '50%', fontSize: '0.625rem', padding: '0.25rem' }} />
                              <input type="number" min="0" max="99" placeholder={m.participantB ?? 'B'} value={scoreB} onChange={e => setScoreB(e.target.value)} style={{ width: '50%', fontSize: '0.625rem', padding: '0.25rem' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button onClick={handleConfirmMatch} style={{ fontSize: '0.375rem', padding: '0.125rem 0.5rem' }} className="primary">ENVIAR</button>
                              <button onClick={() => setReportMatch(null)} style={{ fontSize: '0.375rem', padding: '0.125rem 0.5rem' }}>CANCELAR</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setReportMatch(m.id)} style={{ fontSize: '0.375rem', marginTop: '0.25rem', padding: '0.125rem 0.25rem' }}>{m.status === 'pending' ? 'RELLENAR' : 'CONFIRMAR'}</button>
                        )
                      )}
                      {m.status === 'confirmed' && (
                        reportMatch === m.id ? (
                          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <select value={reportWinner} onChange={e => setReportWinner(e.target.value)} style={{ fontSize: '0.625rem', padding: '0.25rem' }}>
                              <option value="">Ganador...</option>
                              {m.participantAId && <option value={m.participantAId}>{m.participantA}</option>}
                              {m.participantBId && <option value={m.participantBId}>{m.participantB}</option>}
                            </select>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <input type="number" min="0" max="99" placeholder={m.participantA ?? 'A'} value={scoreA} onChange={e => setScoreA(e.target.value)} style={{ width: '50%', fontSize: '0.625rem', padding: '0.25rem' }} />
                              <input type="number" min="0" max="99" placeholder={m.participantB ?? 'B'} value={scoreB} onChange={e => setScoreB(e.target.value)} style={{ width: '50%', fontSize: '0.625rem', padding: '0.25rem' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button onClick={handleConfirmMatch} style={{ fontSize: '0.375rem', padding: '0.125rem 0.5rem' }} className="primary">GUARDAR</button>
                              <button onClick={() => setReportMatch(null)} style={{ fontSize: '0.375rem', padding: '0.125rem 0.5rem' }}>CANCELAR</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setReportMatch(m.id)} style={{ fontSize: '0.375rem', marginTop: '0.25rem', padding: '0.125rem 0.25rem', borderColor: 'var(--neon-magenta)', color: 'var(--neon-magenta)' }}>EDITAR</button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
