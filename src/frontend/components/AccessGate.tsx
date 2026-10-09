import { useEffect, useState, type ReactNode } from 'react';

// Puerta de acceso opcional (ACCESS_PASSWORD). Solo bloquea si el servidor la
// exige; con la contraseña vacía no interviene y el flujo sigue en automático.
export function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'granted' | 'locked'>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // El panel de admin tiene su propio login: no pasa por la puerta.
  const isAdminArea = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

  useEffect(() => {
    if (isAdminArea) { setState('granted'); return; }
    fetch('/api/auth/config')
      .then(r => r.json())
      .then(c => setState(!c.accessRequired || c.accessGranted ? 'granted' : 'locked'))
      .catch(() => setState('granted'));
  }, [isAdminArea]);

  const submit = async () => {
    setSubmitting(true); setError(null);
    const res = await fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) setState('granted');
    else { setError('Contraseña incorrecta.'); setSubmitting(false); }
  };

  if (state === 'checking') return <div className="container"><div className="loading">Cargando…</div></div>;
  if (state === 'granted') return <>{children}</>;

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '420px', margin: '4rem auto', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>PARTYMAN</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>ACCESO PRIVADO</p>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={e => { e.preventDefault(); submit(); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="password"
            placeholder="Contraseña de acceso"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            autoComplete="off"
          />
          <button type="submit" className="primary" disabled={submitting}>{submitting ? '…' : 'ENTRAR'}</button>
        </form>
      </div>
    </div>
  );
}
