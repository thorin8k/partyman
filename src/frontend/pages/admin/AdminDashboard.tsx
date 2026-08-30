import { useAuth } from '../../components/AuthContext';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { PartyForm } from '../../components/PartyForm';

interface Party {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  status: 'planned' | 'active' | 'finished' | 'archived';
}

interface Participant {
  id: number;
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'participant' | 'admin';
}

export function AdminDashboard() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [parties, setParties] = useState<Party[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/admin/login');
    } else if (!loading && user?.role !== 'admin') {
      navigate('/');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchParties();
      fetchParticipants();
    }
  }, [user]);

  const fetchParties = async () => {
    try {
      const res = await fetch('/api/parties');
      if (res.ok) {
        const data = await res.json();
        setParties(data.parties);
      }
    } catch (error) {
      console.error('Failed to fetch parties:', error);
    }
  };

  const fetchParticipants = async () => {
    try {
      const res = await fetch('/api/admin/participants');
      if (res.ok) {
        const data = await res.json();
        setParticipants(data.participants);
      }
    } catch (error) {
      console.error('Failed to fetch participants:', error);
    }
  };

  const handleCreate = async (data: { name: string; startsAt: string; endsAt: string; description: string; location: string }) => {
    setCreating(true);
    setError(null);
    try {
      const csrfCookie = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
      const res = await fetch('/api/admin/parties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Partyman-CSRF': csrfCookie || '',
        },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowForm(false);
        fetchParties();
      } else {
        const err = await res.json();
        setError(err.error || 'Error al crear la party');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleRole = async (participant: Participant) => {
    const newRole = participant.role === 'admin' ? 'participant' : 'admin';
    try {
      const csrfCookie = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
      const res = await fetch(`/api/admin/participants/${participant.id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Partyman-CSRF': csrfCookie || '',
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        fetchParticipants();
      } else {
        const err = await res.json();
        setError(err.error || 'Error al cambiar rol');
      }
    } catch {
      setError('Error de conexión');
    }
  };

  if (loading) {
    return <div className="container"><div className="loading">Cargando</div></div>;
  }

  if (!user || user.role !== 'admin') {
    return null;
  }

  const statusColors: Record<string, string> = {
    planned: 'var(--neon-cyan)',
    active: 'var(--neon-green)',
    finished: 'var(--muted)',
    archived: 'var(--neon-magenta)',
  };

  const statusLabels: Record<string, string> = {
    planned: 'PLANIFICADA',
    active: 'ACTIVA',
    finished: 'FINALIZADA',
    archived: 'ARCHIVADA',
  };

  return (
    <div className="container">
      <div className="header">
        <h1>ADMIN</h1>
        <div className="nav">
          <span style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>
            {user.displayName}
          </span>
          <a href="/">SITIO →</a>
          <a href="/display" target="_blank">DISPLAY →</a>
          <button onClick={logout} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>
            SALIR
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {showForm ? (
        <div className="card">
          <h2>NUEVA PARTY</h2>
          <PartyForm
            onSubmit={handleCreate}
            onCancel={() => { setShowForm(false); setError(null); }}
            loading={creating}
          />
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2>PARTIES</h2>
            <button className="primary" style={{ fontSize: '0.5rem' }} onClick={() => setShowForm(true)}>
              + NUEVA PARTY
            </button>
          </div>

          {parties.length === 0 ? (
            <div className="empty-state">
              <h3>SIN PARTIES</h3>
              <p style={{ fontSize: '0.875rem' }}>
                No hay parties creadas todavía.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {parties.map((party) => (
                <div
                  key={party.id}
                  className="list-item"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}
                >
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <h3 style={{ marginBottom: '0.25rem', wordBreak: 'break-word' }}>{party.name}</h3>
                    <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.875rem' }}>
                      {new Date(party.startsAt).toLocaleDateString()} - {new Date(party.endsAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      border: `1px solid ${statusColors[party.status]}`,
                      color: statusColors[party.status],
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.5rem',
                    }}>
                      {statusLabels[party.status]}
                    </span>
                    <a href={`/admin/parties/${party.id}`} style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      VER →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>USUARIOS</h2>
        {participants.length === 0 ? (
          <div className="empty-state" style={{ padding: '1rem' }}>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>
              No hay usuarios registrados todavía.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {participants.map((p) => (
              <div
                key={p.id}
                className="list-item"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                  ) : (
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--bg)', flexShrink: 0,
                    }}>
                      {p.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span style={{ fontSize: '0.875rem' }}>{p.displayName}</span>
                  {p.role === 'admin' && (
                    <span style={{
                      padding: '0.125rem 0.5rem',
                      border: '1px solid var(--neon-magenta)',
                      color: 'var(--neon-magenta)',
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.4rem',
                    }}>
                      ADMIN
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleToggleRole(p)}
                  style={{ fontSize: '0.4rem', padding: '0.375rem 0.75rem' }}
                >
                  {p.role === 'admin' ? 'REVOCAR ADMIN' : 'HACER ADMIN'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2>ACCIONES RÁPIDAS</h2>
        <div className="grid grid-3" style={{ marginTop: '1rem' }}>
          <a href="/admin/games" style={{ fontSize: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.875rem 1.5rem', border: '2px solid var(--neon-cyan)', borderRadius: 'var(--radius)', textDecoration: 'none' }}>
            GESTIONAR JUEGOS
          </a>
          <a href="/admin/planning" style={{ fontSize: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.875rem 1.5rem', border: '2px solid var(--neon-cyan)', borderRadius: 'var(--radius)', textDecoration: 'none' }}>
            PLANIFICACIÓN
          </a>
          <button style={{ fontSize: '0.5rem' }}>
            BACKUP
          </button>
        </div>
      </div>
    </div>
  );
}
