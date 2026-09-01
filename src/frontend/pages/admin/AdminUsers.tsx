import { useAuth } from '../../components/AuthContext';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

interface Participant {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  role: 'participant' | 'admin';
}

export function AdminUsers() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/admin/login');
    else if (!loading && user?.role !== 'admin') navigate('/');
  }, [user, loading, navigate]);

  useEffect(() => { if (user?.role === 'admin') fetchParticipants(); }, [user]);

  const fetchParticipants = async () => {
    const res = await fetch('/api/admin/participants');
    if (res.ok) setParticipants((await res.json()).participants);
  };

  const handleToggleRole = async (p: Participant) => {
    const newRole = p.role === 'admin' ? 'participant' : 'admin';
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/participants/${p.id}/role`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) fetchParticipants();
    else { const err = await res.json(); setError(err.error || 'Error'); }
  };

  if (loading || !user || user.role !== 'admin') return null;

  return (
    <div className="container">
      <div className="header">
        <h1>ADMIN</h1>
        <div className="nav">
          <a href="/admin">VOLVER →</a>
          <button onClick={logout} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>SALIR</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h2>USUARIOS ({participants.length})</h2>
        {participants.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>No hay usuarios todavía.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
            {participants.map(p => (
              <div key={p.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                  ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--bg)' }}>
                      {p.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span style={{ fontSize: '0.875rem' }}>{p.displayName}</span>
                  {p.role === 'admin' && (
                    <span style={{ padding: '0.125rem 0.5rem', border: '1px solid var(--neon-magenta)', color: 'var(--neon-magenta)', fontFamily: 'var(--font-display)', fontSize: '0.4rem' }}>ADMIN</span>
                  )}
                </div>
                <button onClick={() => handleToggleRole(p)} style={{ fontSize: '0.4rem', padding: '0.375rem 0.75rem' }}>
                  {p.role === 'admin' ? 'REVOCAR ADMIN' : 'HACER ADMIN'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
