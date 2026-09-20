import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useAuth } from '../../components/AuthContext';

export function ParticipantLogin() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [error, setError] = useState<string | null>(null);
  const [steamEnabled, setSteamEnabled] = useState(true);

  useEffect(() => {
    fetch('/api/auth/config').then(r => r.json()).then(c => setSteamEnabled(c.steamEnabled !== false)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading && user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const errorParam = params.get('error');
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        AUTH_FAILED: 'La autenticación falló. Inténtalo de nuevo.',
        STEAM_UNAVAILABLE: 'Steam no está disponible en este momento.',
        NO_ACTIVE_PARTY: 'No hay ninguna party activa en este momento.',
      };
      setError(errorMessages[errorParam] || 'Error desconocido');
    }
  }, [search]);

  const handleSteamLogin = () => {
    window.location.href = '/auth/steam?returnTo=' + encodeURIComponent(window.location.pathname);
  };

  if (loading) {
    return <div className="container"><div className="loading">Cargando</div></div>;
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '500px', margin: '2rem auto', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>PARTYMAN</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          LAN PARTY COMPANION
        </p>

        {error && (
          <div className="alert error">
            {error}
          </div>
        )}

        {steamEnabled ? (
        <button
          onClick={handleSteamLogin}
          className="primary"
          style={{ width: '100%', marginBottom: '1.25rem' }}
        >
          ▶ ENTRAR CON STEAM
        </button>
        ) : (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            El login con Steam está desactivado en este servidor.
          </p>
        )}

        <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Al iniciar sesión, te unirás automáticamente a la party activa.
        </p>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <a href="/display" style={{ fontSize: '0.75rem' }}>PANTALLA PÚBLICA →</a>
          <a href="/leaderboard" style={{ fontSize: '0.75rem' }}>RANKING →</a>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: '1.25rem', paddingTop: '1.25rem' }}>
          <a href="/admin/login" style={{ fontSize: '0.75rem' }}>
            ACCESO ADMINISTRADOR →
          </a>
        </div>
      </div>
    </div>
  );
}
