import { useEffect, useState, useRef } from 'react';
import { QrCode } from '../../components/QrCode';
import { wifiQrString } from '../../components/qr';
import { badge, headerBtn } from '../../components/listRow';
import { isByeSlot, slotLabel } from '../../components/bracket';
import { nextMoment, eventIcon, eventLabel, type FeedEvent } from '../../components/activityFeed';
import { planViews, contentKeys, ROTATE_MS, type ViewKey } from '../../components/displayViews';

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
  leaderboard: Array<{ participantId: number; displayName: string; avatarUrl: string | null; points: number; wins: number }>;
  activity: FeedEvent[];
  wifi: { ssid: string; password: string | null } | null;
  joinUrl: string | null;
  qrUrl: string | null;
  generatedAt: string;
}

export function PublicDisplay() {
  const [state, setState] = useState<PublicState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tournamentIdx, setTournamentIdx] = useState(0);
  const [moment, setMoment] = useState<{ id: number; message: string; eventType: string } | null>(null);
  const seenEventIdRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // `?vista=` clava una sola vista (p. ej. `?vista=bracket` en la final). Se lee una vez,
  // no en cada sondeo: la URL no cambia durante la party. Clave inválida → rotación normal.
  const forcedViewRef = useRef<string | null>(
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('vista') : null
  );
  const [viewIdx, setViewIdx] = useState(0);

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
        // Los eventos llegan ordenados por id desc; el primero es el más nuevo.
        const events: FeedEvent[] = Array.isArray(data.activity) ? data.activity : [];
        const { seenId, moment: fresh } = nextMoment(seenEventIdRef.current, events);
        seenEventIdRef.current = seenId;
        if (fresh) setMoment({ id: fresh.id, message: fresh.message, eventType: fresh.eventType });
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

  // Rotación de vistas (task 019). Reutiliza el `state` ya sondeado cada 15s: la
  // rotación no lanza fetch. Un solo intervalo, apagado si el plan tiene una vista.
  const viewPlan = planViews(forcedViewRef.current, contentKeys(state, Date.now()));
  const viewPlanKey = viewPlan.join(',');
  useEffect(() => {
    if (viewPlan.length <= 1) return; // una vista: fija, sin parpadeo inútil
    const id = setInterval(() => setViewIdx(i => i + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, [viewPlanKey]);
  useEffect(() => { setViewIdx(0); }, [viewPlanKey]);
  const view = viewPlan[viewIdx % viewPlan.length];

  useEffect(() => {
    if (!moment) return;
    const id = setTimeout(() => setMoment(null), 8000);
    return () => clearTimeout(id);
  }, [moment]);

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
      {moment && (
        <div data-moment style={{
          position: 'fixed', top: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 50,
          background: 'var(--panel)', border: '3px solid var(--neon-yellow)', boxShadow: '0 0 28px var(--neon-yellow)',
          padding: '1.25rem 2.5rem', textAlign: 'center', maxWidth: '90vw',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.75rem', color: 'var(--neon-yellow)', marginBottom: '0.75rem' }}>
            {eventLabel(moment.eventType)}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{moment.message}</div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--neon-cyan)' }}>
          PARTYMAN
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {error && (
            <span style={{ color: 'var(--error)', fontSize: '0.75rem', fontFamily: 'var(--font-display)' }}>
              SIN CONEXIÓN · DATOS ANTERIORES
            </span>
          )}
          {lastUpdated && (
            <span style={{ color: 'var(--text-dim)', fontSize: '0.625rem', fontFamily: 'var(--font-display)' }}>
              {lastUpdated.toLocaleTimeString('es-ES')}
            </span>
          )}
          <button
            onClick={handleFullscreen}
            // La métrica de la fuente pixel subestima el ancho del texto y el
            // overflow del botón lo recortaba ("NTALLA COMPLE"); ancho mínimo fijo.
            style={{ ...headerBtn, minWidth: '200px' }}
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

          {view === 'ranking' && (
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <h2 style={{ marginBottom: '1rem' }}>RANKING TOP-5</h2>
              {state.leaderboard.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Sin puntos repartidos aún</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {state.leaderboard.slice(0, 5).map((p, i) => (
                    <div key={p.participantId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'var(--bg-secondary)', border: `1px solid ${i === 0 ? 'var(--neon-yellow)' : 'var(--border)'}`, borderRadius: 'var(--radius)' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.875rem', color: i === 0 ? 'var(--neon-yellow)' : 'var(--text-dim)' }}>#{i + 1}</span>
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                      ) : (
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--bg)', flexShrink: 0 }}>
                          {p.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span style={{ fontSize: '1.125rem', flex: 1 }}>{p.displayName}</span>
                      <span style={{ color: 'var(--neon-green)', fontFamily: 'var(--font-display)', fontSize: '0.7rem' }}>{p.points} PTS</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'bracket' && (
            <div className="card" style={{ gridColumn: '1 / -1' }}>
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
                            <span style={badge(t.status === 'in_progress' ? 'var(--neon-orange)' : 'var(--neon-green)')}>
                              {t.status === 'in_progress' ? 'EN CURSO' : 'PRÓXIMAMENTE'}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)', margin: '0.5rem 0 0' }}>{t.gameTitle} · Max {t.maxParticipants}</p>
                        </div>
                      </div>
                      {t.matches && t.matches.length > 0 && (() => {
                        const rounds = [...new Set(t.matches.map(m => m.round))].sort((a, b) => a - b);
                        const orderedRounds = [...rounds.filter(r => r !== 0), ...(rounds.includes(0) ? [0] : [])];
                        const max = Math.max(...rounds);
                        // ponytail: etiquetas relativas a la final, como en las páginas de torneo.
                        const roundText = (round: number) => {
                          if (round === 0) return 'TERCER PUESTO';
                          const fromEnd = max - round;
                          if (fromEnd === 0) return 'FINAL';
                          if (fromEnd === 1) return 'SEMIFINAL';
                          if (fromEnd === 2) return 'CUARTOS';
                          return `RONDA ${round}`;
                        };
                        return (
                          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1.5rem', overflowX: 'auto' }}>
                            {orderedRounds.map(round => (
                              <div key={round} style={{ minWidth: '160px', flex: '0 0 auto', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontSize: '0.625rem', color: 'var(--neon-cyan)', textAlign: 'center', marginBottom: '0.25rem', fontFamily: 'var(--font-display)' }}>{roundText(round)}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, gap: '0.5rem' }}>
                                  {t.matches.filter(m => m.round === round).map(m => (
                                    <div key={m.id} style={{ fontSize: '0.875rem', padding: '0.375rem 0.5rem', background: 'var(--bg)', border: `1px solid ${m.status === 'confirmed' ? 'var(--neon-green)' : 'var(--border)'}`, textAlign: 'center' }}>
                                      <div>{slotLabel(m.participantA, m)} vs {slotLabel(m.participantB, m)}</div>
                                      {m.winner && <div style={{ color: 'var(--neon-green)', fontFamily: 'var(--font-display)', fontSize: '0.625rem', marginTop: '0.25rem' }}>→ {m.winner}{isByeSlot(m) ? ' · PASA DIRECTO' : ''}</div>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
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
          )}

          {view === 'resultado' && (
            <>
            <div className="card">
              <h2 style={{ marginBottom: '1rem' }}>TORNEOS RECIENTES</h2>
              {state.recentTournaments.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Aún sin resultados</p>
              ) : (
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
              )}
            </div>
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <h2 style={{ marginBottom: '1rem' }}>NOVEDADES</h2>
              {state.activity.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Sin novedades por ahora</p>
              ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {state.activity.slice(0, 8).map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                    <span style={{ fontSize: '1.125rem' }}>{eventIcon(e.eventType)}</span>
                    <span style={{ flex: 1, fontSize: '1rem' }}>{e.message}</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {new Date(e.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
              )}
            </div>
            </>
          )}

          {view === 'actividad' && (() => {
            const now = new Date().getTime();
            const sorted = [...state.activities].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
            const live = sorted.filter(a => a.status !== 'finished' && +new Date(a.startsAt) <= now && now <= +new Date(a.endsAt));
            const next = sorted.find(a => a.status !== 'finished' && +new Date(a.startsAt) > now);
            if (!live.length && !next) return null;
            return (
              <div className="card" style={{ gridColumn: '1 / -1', borderColor: 'var(--neon-green)' }}>
                {live.length > 0 && (
                  <div style={{ marginBottom: next ? '1rem' : 0 }}>
                    <h2 style={{ marginBottom: '0.5rem' }}>AHORA</h2>
                    {live.map(a => (
                      <p key={a.id} style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{a.title} <span style={{ fontSize: '1rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>· hasta {new Date(a.endsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span></p>
                    ))}
                  </div>
                )}
                {next && (
                  <div>
                    <h2 style={{ marginBottom: '0.5rem' }}>SIGUIENTE</h2>
                    <p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{next.title} <span style={{ fontSize: '1rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>· {new Date(next.startsAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span></p>
                  </div>
                )}
              </div>
            );
          })()}

          {view === 'qr' && (
          <div className="card" style={{ borderColor: 'var(--neon-cyan)', gridColumn: '1 / -1' }}>
            <h2 style={{ marginBottom: '0.5rem' }}>ÚNETE</h2>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'center' }}>
                {typeof window !== 'undefined' && <QrCode text={state.qrUrl || state.joinUrl || window.location.origin} size={160} />}
                <p style={{ fontSize: '1rem', fontWeight: 'bold', wordBreak: 'break-all', marginTop: '0.5rem' }}>{state.joinUrl || (typeof window !== 'undefined' ? window.location.origin : '')}</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)' }}>Escanea y entra con Steam</p>
              </div>
              {state.wifi && (
                <div style={{ textAlign: 'center' }}>
                  <QrCode text={wifiQrString(state.wifi.ssid, state.wifi.password)} size={160} />
                  <p style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '0.5rem' }}>WiFi: {state.wifi.ssid}</p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)' }}>Conecta a la wifi de la party</p>
                </div>
              )}
            </div>
          </div>
          )}
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
