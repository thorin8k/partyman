import { useEffect, useState, useRef } from 'react';

interface PublicState {
  party: { id: number; name: string; startsAt: string; endsAt: string; status: string } | null;
  attendees: Array<{ id: number; displayName: string; avatarUrl: string | null; joinedAt: string }>;
  tournaments: unknown[];
  leaderboard: unknown[];
  activity: unknown[];
  generatedAt: string;
}

export function PublicDisplay() {
  const [state, setState] = useState<PublicState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
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
    <div style={{ minHeight: '100vh', padding: '2rem', fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', gridTemplateRows: 'auto 1fr' }}>
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
            <h2 style={{ marginBottom: '1rem' }}>PRÓXIMAMENTE</h2>
            <div className="empty-state">
              <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>No hay actividades programadas</p>
            </div>
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
