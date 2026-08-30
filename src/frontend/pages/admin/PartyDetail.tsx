import { useAuth } from '../../components/AuthContext';
import { useLocation, useParams } from 'wouter';
import { useEffect, useState } from 'react';
import { PartyForm } from '../../components/PartyForm';

interface Party {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  description: string | null;
  location: string | null;
  status: 'planned' | 'active' | 'finished' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export function PartyDetail() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams();
  const partyId = params?.id;

  const [party, setParty] = useState<Party | null>(null);
  const [loadingParty, setLoadingParty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/admin/login');
    } else if (!loading && user?.role !== 'admin') {
      navigate('/');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user?.role === 'admin' && partyId) {
      fetchParty();
    }
  }, [user, partyId]);

  const fetchParty = async () => {
    setLoadingParty(true);
    try {
      const res = await fetch(`/api/parties/${partyId}`);
      if (res.ok) {
        const data = await res.json();
        setParty(data.party);
      } else {
        setError('Party no encontrada');
      }
    } catch {
      setError('Error al cargar la party');
    } finally {
      setLoadingParty(false);
    }
  };

  const handleUpdate = async (data: { name: string; startsAt: string; endsAt: string; description: string; location: string }) => {
    setActionLoading(true);
    try {
      const csrfCookie = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
      const res = await fetch(`/api/admin/parties/${partyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Partyman-CSRF': csrfCookie || '',
        },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setEditing(false);
        fetchParty();
      } else {
        const err = await res.json();
        setError(err.error || 'Error al actualizar');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAction = async (action: string) => {
    setActionLoading(true);
    setError(null);
    try {
      const csrfCookie = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
      const res = await fetch(`/api/admin/parties/${partyId}/${action}`, {
        method: 'POST',
        headers: {
          'X-Partyman-CSRF': csrfCookie || '',
        },
      });
      if (res.ok) {
        if (action === 'delete') {
          navigate('/admin');
          return;
        }
        fetchParty();
      } else {
        const err = await res.json();
        const errorMessages: Record<string, string> = {
          ACTIVE_PARTY_EXISTS: 'Ya hay una party activa. Finaliza la party actual primero.',
          UNFINISHED_TOURNAMENTS: 'Hay torneos sin finalizar. Cancela los torneos pendientes primero.',
          PARTY_FINALIZED: 'Esta party ya está finalizada y no se puede modificar.',
          INVALID_STATUS_TRANSITION: 'Transición de estado no válida.',
        };
        setError(errorMessages[err.error] || err.error || 'Error al ejecutar la acción');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta party? Esta acción no se puede deshacer.')) return;
    await handleAction('delete');
  };

  if (loading || !user || user.role !== 'admin') {
    return null;
  }

  if (loadingParty) {
    return (
      <div className="container">
        <div className="loading">Cargando party...</div>
      </div>
    );
  }

  if (error && !party) {
    return (
      <div className="container">
        <div className="header">
          <h1>ADMIN</h1>
          <div className="nav">
            <a href="/admin">VOLVER →</a>
          </div>
        </div>
        <div className="card">
          <div className="alert error">{error}</div>
          <a href="/admin">Volver al panel</a>
        </div>
      </div>
    );
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
          <a href="/admin">VOLVER →</a>
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

      {editing ? (
        <div className="card">
          <h2>EDITAR PARTY</h2>
          <PartyForm
            initialData={{
              name: party?.name,
              startsAt: party?.startsAt,
              endsAt: party?.endsAt,
              description: party?.description || '',
              location: party?.location || '',
            }}
            onSubmit={handleUpdate}
            onCancel={() => { setEditing(false); setError(null); }}
            submitLabel="GUARDAR CAMBIOS"
            loading={actionLoading}
          />
        </div>
      ) : party && (
        <>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
              <h2>{party.name}</h2>
              <span style={{
                padding: '0.5rem 1rem',
                border: `2px solid ${statusColors[party.status]}`,
                color: statusColors[party.status],
                fontFamily: 'var(--font-display)',
                fontSize: '0.625rem',
                letterSpacing: '0.1em',
              }}>
                {statusLabels[party.status]}
              </span>
            </div>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <p>
                <strong style={{ color: 'var(--neon-cyan)' }}>INICIO:</strong>{' '}
                {new Date(party.startsAt).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              <p>
                <strong style={{ color: 'var(--neon-cyan)' }}>FIN:</strong>{' '}
                {new Date(party.endsAt).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              {party.description && (
                <p>
                  <strong style={{ color: 'var(--neon-cyan)' }}>DESCRIPCIÓN:</strong>{' '}
                  {party.description}
                </p>
              )}
              {party.location && (
                <p>
                  <strong style={{ color: 'var(--neon-cyan)' }}>UBICACIÓN:</strong>{' '}
                  {party.location}
                </p>
              )}
            </div>
          </div>

          <div className="card">
            <h2>ACCIONES</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
              {party.status === 'planned' && (
                <>
                  <button
                    className="primary"
                    onClick={() => handleAction('activate')}
                    disabled={actionLoading}
                    style={{ width: '100%' }}
                  >
                    {actionLoading ? 'PROCESANDO...' : 'ACTIVAR PARTY'}
                  </button>
                  <button
                    onClick={() => setEditing(true)}
                    style={{ width: '100%' }}
                  >
                    EDITAR PARTY
                  </button>
                </>
              )}

              {party.status === 'active' && (
                <>
                  <button
                    onClick={() => handleAction('finish')}
                    disabled={actionLoading}
                    style={{ width: '100%', borderColor: 'var(--neon-orange)', color: 'var(--neon-orange)' }}
                  >
                    {actionLoading ? 'PROCESANDO...' : 'FINALIZAR PARTY'}
                  </button>
                  <button
                    onClick={() => setEditing(true)}
                    style={{ width: '100%' }}
                  >
                    EDITAR PARTY
                  </button>
                </>
              )}

              {party.status === 'finished' && (
                <button
                  onClick={() => handleAction('archive')}
                  disabled={actionLoading}
                  style={{ width: '100%', borderColor: 'var(--neon-magenta)', color: 'var(--neon-magenta)' }}
                >
                  {actionLoading ? 'PROCESANDO...' : 'ARCHIVAR PARTY'}
                </button>
              )}

              {party.status === 'archived' && (
                <div className="empty-state" style={{ padding: '1rem' }}>
                  <p style={{ color: 'var(--text-dim)' }}>Esta party está archivada y no tiene acciones disponibles.</p>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--error)' }}>
            <h2 style={{ color: 'var(--error)' }}>ZONA PELIGROSA</h2>
            <button
              className="danger"
              onClick={handleDelete}
              disabled={actionLoading}
              style={{ width: '100%', marginTop: '1rem' }}
            >
              {actionLoading ? 'ELIMINANDO...' : 'ELIMINAR PARTY'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
