import { useEffect, useState, useRef } from 'react';

interface Tournament {
  id: number;
  name: string;
  gameTitle: string;
  gameImage: string | null;
  status: string;
  maxParticipants: number;
  matches: Array<{ id: number; round: number; position: number; participantAId: number | null; participantBId: number | null; participantA: string | null; participantB: string | null; winner: string | null; winnerId: number | null; status: string }>;
}

interface PublicState {
  party: { id: number; name: string; startsAt: string; endsAt: string; status: string } | null;
  attendees: Array<{ id: number; displayName: string; avatarUrl: string | null; joinedAt: string }>;
  activities: Array<{ id: number; title: string; gameTitle: string | null; gameImage: string | null; startsAt: string; endsAt: string; capacity: number | null; notes: string | null; status: string; participantCount: number; participants: Array<{ id: number; displayName: string }> }>;
  tournaments: Tournament[];
  recentTournaments: Array<{ id: number; name: string; gameTitle: string; winner: string | null }>;
  leaderboard: unknown[];
  activity: unknown[];
  generatedAt: string;
}

export function PublicDisplay() {
  const [state, setState] = useState<PublicState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tournamentIdx, setTournamentIdx] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/public/state', { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setState(data);
        setLastUpdated(new Date());
        setError(false);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
    timerRef.current = setInterval(fetchState, 15000);
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!state?.tournaments || state.tournaments.length <= 1) return;
    const id = setInterval(() => setTournamentIdx(i => (i + 1) % state.tournaments.length), 7000);
    return () => clearInterval(id);
  }, [state?.tournaments.length]);

  useEffect(() => { setTournamentIdx(0); }, [state?.tournaments.length]);

  const handleFullscreen = () => {
    document.documentElement.requestFullscreen?.();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--font-display)' }}>
        <h1 style={{ color: 'var(--neon-cyan)' }}>CARGANDO...</h1>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', fontFamily: 'var(--font-body)', maxWidth: '1600px', margin: '0 auto' }}>
      <style>{`
        @media (min-width: 1200px) {
          .public-grid { grid-template-columns: repeat(auto-fit, minmax(480px, 1fr)) !important; gap: 2rem !important; }
          .public-grid .card { padding: 2rem !important; }
          .public-grid .card h2 { font-size: 1.25rem !important; }
        }
        @media (min-width: 1600px) {
          .public-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 768px) {
          .public-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--neon-cyan)' }}>
          PARTYMAN
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {error && (
            <span style={{ color: 'var(--error)', fontSize: '0.75rem', fontFamily: 'var(--font-display)' }}>
              SIN CONEXIÓN
            </span>
          )}
          {lastUpdated && (
            <span style={{ color: 'var(--text-dim)', fontSize: '0.625rem', fontFamily: 'var(--font-display)' }}>
              {lastUpdated.toLocaleTimeString('es-ES')}
            </span>
          )}
          <button
            onClick={handleFullscreen}
            style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}
          >
            PANTALLA COMPLETA
          </button>
        </div>
      </div>

      {state?.party ? (
        <div className="public-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{state.party.name}</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>
                  {new Date(state.party.startsAt).toLocaleDateString('es-ES')} - {new Date(state.party.endsAt).toLocaleDateString('es-ES')}
                </p>
              </div>
              <span style={{
                padding: '0.5rem 1rem',
                border: '2px solid var(--neon-green)',
                color: 'var(--neon-green)',
                fontFamily: 'var(--font-display)',
                fontSize: '0.625rem',
                animation: 'pulse 2s ease-in-out infinite',
              }}>
                ACTIVA
              </span>
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: '1rem' }}>ASISTENTES ({state.attendees.length})</h2>
            {state.attendees.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Sin asistentes aún</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflow: 'auto' }}>
                {state.attendees.map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {a.avatarUrl ? (
                      <img src={a.avatarUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                    ) : (
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--bg)', flexShrink: 0,
                      }}>
                        {a.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span style={{ fontSize: '0.875rem' }}>{a.displayName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginBottom: '1rem' }}>TORNEOS {state.tournaments.length > 1 && `(${tournamentIdx + 1}/${state.tournaments.length})`}</h2>
            {state.tournaments.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>No hay torneos programados</p>
            ) : (
              <>
                {(() => {
                  const t = state.tournaments[tournamentIdx % state.tournaments.length];
                  return (
                    <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', border: `1px solid ${t.status === 'in_progress' ? 'var(--neon-orange)' : 'var(--neon-green)'}`, borderRadius: 'var(--radius)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {t.gameImage && <img src={t.gameImage} alt="" style={{ width: '48px', height: '48px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1rem' }}>{t.name}</h3>
                            <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-display)', color: t.status === 'in_progress' ? 'var(--neon-orange)' : 'var(--neon-green)', border: `1px solid ${t.status === 'in_progress' ? 'var(--neon-orange)' : 'var(--neon-green)'}`, padding: '0.25rem 0.5rem' }}>
                              {t.status === 'in_progress' ? 'EN CURSO' : 'PRÓXIMAMENTE'}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)', margin: '0.5rem 0 0' }}>{t.gameTitle} · Max {t.maxParticipants}</p>
                        </div>
                      </div>
                      {t.matches && t.matches.length > 0 && (
                        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
                          {[...new Set(t.matches.map(m => m.round))].sort((a,b)=>a-b).map(round => (
                            <div key={round} style={{ minWidth: '120px', flex: '0 0 auto' }}>
                              <div style={{ fontSize: '0.5rem', color: 'var(--neon-cyan)', textAlign: 'center', marginBottom: '0.25rem' }}>R{round}</div>
                              {t.matches.filter(m => m.round === round).map(m => (
                                <div key={m.id} style={{ fontSize: '0.625rem', padding: '0.25rem', background: 'var(--bg)', border: `1px solid ${m.status === 'confirmed' ? 'var(--neon-green)' : 'var(--border)'}`, marginBottom: '0.25rem', textAlign: 'center' }}>
                                  {m.participantA ?? '—'} vs {m.participantB ?? 'BYE'}
                                  {m.winner && <div style={{ color: 'var(--neon-green)' }}>→ {m.winner}</div>}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {state.tournaments.length > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                    {state.tournaments.map((_, i) => (
                      <span key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: i === tournamentIdx % state.tournaments.length ? 'var(--neon-cyan)' : 'var(--border)' }} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {state.recentTournaments && state.recentTournaments.length > 0 && (
            <div className="card">
              <h2 style={{ marginBottom: '1rem' }}>TORNEOS RECIENTES</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {state.recentTournaments.map(t => (
                  <div key={t.id} style={{ padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--neon-green)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: '0.875rem' }}>{t.name}</h3>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '0.25rem 0 0' }}>{t.gameTitle}</p>
                    </div>
                    {t.winner && <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.625rem', color: 'var(--neon-green)', border: '1px solid var(--neon-green)', padding: '0.25rem 0.5rem' }}>🏆 {t.winner}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h2 style={{ marginBottom: '1rem' }}>ACTIVIDADES</h2>
            {state.activities.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>No hay actividades programadas</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {state.activities.map((a) => {
                  const isLive = new Date(a.startsAt) <= new Date() && new Date() <= new Date(a.endsAt);
                  return (
                  <div key={a.id} style={{ padding: '0.5rem', background: isLive ? 'rgba(0,255,136,0.05)' : 'var(--bg-secondary)', border: `1px solid ${isLive ? 'var(--neon-green)' : 'var(--border)'}`, borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {a.gameImage && <img src={a.gameImage} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <h3 style={{ fontSize: '0.875rem' }}>{a.title}</h3>
                        {isLive && <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-display)', color: 'var(--neon-green)', border: '1px solid var(--neon-green)', padding: '0.125rem 0.375rem' }}>EN CURSO</span>}
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '0.25rem 0 0' }}>
                        {a.gameTitle ? `${a.gameTitle} · ` : ''}
                        {new Date(a.startsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {new Date(a.endsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        {a.capacity ? ` · ${a.participantCount || 0}/${a.capacity}` : ''}
                      </p>
                      {a.notes && <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)', margin: '0.25rem 0 0', fontStyle: 'italic' }}>{a.notes}</p>}
                      {a.participants && a.participants.length > 0 && (
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)', margin: '0.25rem 0 0' }}>{a.participants.map(p => p.displayName).join(', ')}</p>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <h2 style={{ color: 'var(--muted)', marginBottom: '1rem' }}>SIN PARTY ACTIVA</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Esperando a que comience la siguiente party</p>
          </div>
        </div>
      )}
    </div>
  );
}
