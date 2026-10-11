import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

// Alta de usuario nuevo: se pide la contraseña de registro. Si el QR del display
// trajo la clave (?access=), se envía sola.
export function Register() {
  const [, navigate] = useLocation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expired, setExpired] = useState(false);

  const submit = async (pwd: string) => {
    setSubmitting(true); setError(null);
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    if (res.ok) {
      try { sessionStorage.removeItem('partyman_access_pwd'); } catch { /* modo privado */ }
      navigate('/');
      return;
    }
    const d = await res.json().catch(() => ({}));
    const code = d?.error?.code;
    if (code === 'NO_PENDING_REGISTRATION') setExpired(true);
    else if (code === 'ACCESS_PASSWORD_INVALID') setError('Contraseña incorrecta.');
    else setError('No se pudo completar el registro.');
    setSubmitting(false);
  };

  useEffect(() => {
    let pwd: string | null = null;
    try { pwd = sessionStorage.getItem('partyman_access_pwd'); } catch { /* modo privado */ }
    if (pwd) submit(pwd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (expired) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: '420px', margin: '4rem auto', textAlign: 'center' }}>
          <h1 style={{ marginBottom: '1rem' }}>PARTYMAN</h1>
          <div className="alert error">El registro ha caducado. Vuelve a entrar con Steam.</div>
          <a href="/login">Volver al login →</a>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '420px', margin: '4rem auto', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>PARTYMAN</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>CONTRASEÑA DE REGISTRO</p>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={e => { e.preventDefault(); submit(password); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="password"
            placeholder="Contraseña de registro"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            autoComplete="off"
          />
          <button type="submit" className="primary" disabled={submitting}>{submitting ? '…' : 'CREAR CUENTA'}</button>
        </form>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '1rem' }}>
          Es tu primera vez: pide la contraseña a quien organiza la party.
        </p>
      </div>
    </div>
  );
}
