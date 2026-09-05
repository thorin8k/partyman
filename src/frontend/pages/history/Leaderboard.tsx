import { useEffect, useState } from 'react';

export function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [partyId, setPartyId] = useState<string>('');
  const [parties, setParties] = useState<any[]>([]);

  const fetchBoard = async (pid?: string) => {
    const url = pid ? `/api/leaderboard?partyId=${pid}` : '/api/leaderboard/all-time';
    const res = await fetch(url);
    if (res.ok) setLeaderboard((await res.json()).leaderboard);
  };

  useEffect(() => { fetchBoard(); fetch('/api/parties').then(r=>r.json()).then(d=>setParties(d.parties||[])).catch(()=>{}); }, []);

  return (
    <div className="container">
      <div className="header"><h1>LEADERBOARD</h1><a href="/">VOLVER →</a></div>
      <div className="card">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <select value={partyId} onChange={e => setPartyId(e.target.value)} style={{ flex: 1, minWidth: '180px' }}>
            <option value="">Todas (global)</option>
            {parties.map((p:any) => <option key={p.id} value={String(p.id)}>{p.name} ({p.status})</option>)}
          </select>
          <button onClick={() => fetchBoard(partyId || undefined)} style={{ fontSize: '0.5rem' }}>FILTRAR</button>
          <button onClick={() => { setPartyId(''); fetchBoard(); }} style={{ fontSize: '0.5rem' }}>GLOBAL</button>
        </div>
        {leaderboard.length === 0 ? <p style={{ color: 'var(--text-dim)' }}>Sin datos</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {leaderboard.map((p, i) => (
              <div key={p.participantId} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.625rem', color: i === 0 ? 'var(--neon-yellow)' : 'var(--text-dim)' }}>#{i+1}</span>
                  <span>{p.displayName}</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span style={{ color: 'var(--neon-green)', fontFamily: 'var(--font-display)', fontSize: '0.625rem' }}>{p.points} PTS</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{p.wins} wins</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
