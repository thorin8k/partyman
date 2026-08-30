import { useAuth } from '../components/AuthContext';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

interface Party {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  description: string | null;
  location: string | null;
}

export function Dashboard() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [activeParty, setActiveParty] = useState<Party | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetch('/api/parties/active')
        .then(res => res.json())
        .then(data => setActiveParty(data.party))
        .catch(() => {});
      fetch('/api/participants/join', { method: 'POST' }).catch(() => {});
    }
  }, [user]);

  if (loading) {
    return <div className="container"><div className="loading">Cargando</div></div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container">
      <div className="header">
        <h1>PARTYMAN</h1>
        <div className="nav">
          <span style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>
            {user.displayName}
          </span>
          {user.role === 'admin' && (
            <a href="/admin">ADMIN →</a>
          )}
          <a href="/display" target="_blank">DISPLAY →</a>
          <button onClick={logout} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>
            SALIR
          </button>
        </div>
      </div>

      <div className="card">
        <h2>PERFIL</h2>
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              style={{ width: '64px', height: '64px', borderRadius: '50%', border: '2px solid var(--neon-cyan)' }}
            />
          ) : (
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--bg)'
            }}>
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{user.displayName}</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>PARTY ACTUAL</h2>
        {activeParty ? (
          <div style={{ marginTop: '1rem' }}>
            <h3 style={{ color: 'var(--neon-green)', marginBottom: '0.5rem' }}>{activeParty.name}</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)' }}>
              {new Date(activeParty.startsAt).toLocaleDateString()} - {new Date(activeParty.endsAt).toLocaleDateString()}
            </p>
            {activeParty.location && (
              <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                <span style={{ color: 'var(--neon-cyan)' }}>UBICACIÓN:</span> {activeParty.location}
              </p>
            )}{activeParty.description && (
              <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                
                <span style={{ color: 'var(--neon-cyan)' }}>DESCRIPCIÓN:</span> {activeParty.description}
              </p>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <h3>SIN PARTY ACTIVA</h3>
            <p style={{ fontSize: '0.875rem' }}>
              No hay party activa en este momento.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
