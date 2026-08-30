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
  matches: Array<{ id: number; round: number; position: number; participantA: string | null; participantB: string | null; winner: string | null; score: { a: number; b: number } | null; status: string }>;
}

export function TournamentDetail() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams();
  const tournamentId = params?.id;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleConfirmMatch = async (matchId: number) => {
    const winnerId = prompt('ID del ganador:');
    if (!winnerId) return;
    const scoreA = prompt('Puntuación A:');
    const scoreB = prompt('Puntuación B:');
    if (scoreA === null || scoreB === null) return;

    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/matches/${matchId}/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ winnerId: parseInt(winnerId), score: { a: parseInt(scoreA), b: parseInt(scoreB) } }),
    });
    if (!res.ok) { const err = await res.json(); setError(err.error || 'Error'); }
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
                      {m.status === 'reported' && user.role === 'admin' && (
                        <button onClick={() => handleConfirmMatch(m.id)} style={{ fontSize: '0.375rem', marginTop: '0.25rem', padding: '0.125rem 0.25rem' }}>CONFIRMAR</button>
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
