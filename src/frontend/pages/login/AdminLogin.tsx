import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../../components/AuthContext';

export function AdminLogin() {
  const { user, loading, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user?.role === 'admin') {
      navigate('/admin');
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/auth/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin,
        },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        await refreshUser();
        navigate('/admin');
      } else {
        const data = await res.json();
        if (data.error?.code === 'AUTH_INVALID_CREDENTIALS') {
          setError('Usuario o contraseña incorrectos');
        } else if (data.error?.code === 'FORBIDDEN') {
          setError('Acceso denegado');
        } else {
          setError('Error al iniciar sesión');
        }
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="container"><div className="loading">Cargando</div></div>;
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>ADMIN</h1>
        <p style={{ color: 'var(--muted)', textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          PANEL DE CONTROL
        </p>

        {error && (
          <div className="alert error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>USUARIO</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="admin"
            />
          </div>

          <div className="form-group">
            <label>CONTRASEÑA</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="primary"
            disabled={submitting}
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {submitting ? 'VERIFICANDO...' : '▶ INICIAR SESIÓN'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', textAlign: 'center' }}>
          <a href="/login" style={{ fontSize: '0.75rem' }}>
            ← VOLVER AL LOGIN DE PARTICIPANTES
          </a>
        </div>
      </div>
    </div>
  );
}
