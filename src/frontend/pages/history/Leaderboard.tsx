import { useEffect, useState } from 'react';

const touchBtn: React.CSSProperties = { minHeight: '44px', fontSize: '0.625rem', padding: '0.75rem 1rem' };

export function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [partyId, setPartyId] = useState<string>('');
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBoard = async (pid?: string) => {
    setLoading(true); setError(null);
    const url = pid ? `/api/leaderboard?partyId=${pid}` : '/api/leaderboard/all-time';
    const res = await fetch(url).catch(() => null);
    if (!res) { setError('Error de conexión.'); setLoading(false); return; }
    if (res.ok) setLeaderboard((await res.json()).leaderboard);
    else setError('No se pudo cargar el ranking.');
    setLoading(false);
  };

  useEffect(() => { fetchBoard(); fetch('/api/parties').then(r=>r.json()).then(d=>setParties(d.parties||[])).catch(()=>{}); }, []);

  return (
    <div className="container">
      <div className="header"><h1>RANKING</h1><a href="/">VOLVER →</a></div>
      <div className="card">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <select value={partyId} onChange={e => setPartyId(e.target.value)} style={{ flex: 1, minWidth: '180px', minHeight: '44px' }}>
            <option value="">Todas (global)</option>
            {parties.map((p:any) => <option key={p.id} value={String(p.id)}>{p.name} ({p.status})</option>)}
          </select>
          <button onClick={() => fetchBoard(partyId || undefined)} style={touchBtn}>FILTRAR</button>
          <button onClick={() => { setPartyId(''); fetchBoard(); }} style={touchBtn}>GLOBAL</button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>Desempate: puntos → victorias → nombre.</p>
        {loading ? <div className="loading">Cargando ranking…</div>
        : error ? <div className="alert error">{error}</div>
        : leaderboard.length === 0 ? <p style={{ color: 'var(--text-dim)' }}>Sin datos todavía. Juega un torneo para estrenarlo.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {leaderboard.map((p, i) => (
              <div key={p.participantId} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.625rem', color: i === 0 ? 'var(--neon-yellow)' : 'var(--text-dim)' }}>#{i+1}</span>
                  {p.avatarUrl
                    ? <img src={p.avatarUrl} alt={`Avatar de ${p.displayName}`} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                    : <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--bg)', flexShrink: 0 }}>{String(p.displayName).charAt(0).toUpperCase()}</div>}
                  <a href={`/history/${p.participantId}`}>{p.displayName}</a>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span style={{ color: 'var(--neon-green)', fontFamily: 'var(--font-display)', fontSize: '0.625rem' }}>{p.points} PTS</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{p.wins} {p.wins === 1 ? 'victoria' : 'victorias'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
