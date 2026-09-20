import { useAuth } from '../../components/AuthContext';
import { pageBtn, rowColumn, rowFooter, rowMain } from '../../components/listRow';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

interface Backup {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  integrity: 'ok' | 'corrupt';
}

const fmtBytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const fmtDate = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d); };

export function Backups() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) navigate('/admin/login'); else if (!loading && user?.role !== 'admin') navigate('/'); }, [user, loading, navigate]);
  useEffect(() => { if (user?.role === 'admin') fetchBackups(); }, [user]);

  const fetchBackups = async () => {
    const r = await fetch('/api/admin/backups').catch(() => null);
    if (r && r.ok) setBackups((await r.json()).backups || []);
  };

  const handleCreate = async () => {
    setCreating(true); setMsg(null); setErr(null);
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const origin = window.location.origin;
    const res = await fetch('/api/admin/backups', { method: 'POST', headers: { 'X-Partyman-CSRF': csrf || '', Origin: origin } }).catch(() => null);
    if (res && res.ok) { setMsg('Copia creada y verificada.'); fetchBackups(); }
    else setErr('No se pudo crear la copia.');
    setCreating(false);
  };

  if (loading) return <div className="container"><div className="loading">Cargando…</div></div>;
  if (!user || user.role !== 'admin') return <div className="container"><div className="loading">Redirigiendo…</div></div>;

  return (
    <div className="container">
      <div className="header"><h1>COPIAS</h1><div className="nav"><a href="/admin">VOLVER →</a></div></div>
      {msg && <div className="alert success">{msg}</div>}
      {err && <div className="alert error">{err}</div>}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2>COPIAS ({backups.length})</h2>
          <button className="primary" onClick={handleCreate} disabled={creating} style={pageBtn}>{creating ? 'CREANDO…' : '+ CREAR COPIA'}</button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>Copia transaccional con verificación. La restauración es offline y está en docs/operations.md.</p>
        {backups.length === 0 ? (
          <div className="empty-state"><h3>SIN COPIAS</h3><p style={{ fontSize: '0.875rem' }}>Crea la primera copia antes de la party.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
            {backups.map(b => (
              <div key={b.id} className="list-item" style={rowColumn}>
                <div style={{ ...rowMain }}>
                  <h3 style={{ fontSize: '0.875rem' }}>{fmtDate(b.createdAt)}</h3>
                  <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.75rem' }}>{fmtBytes(b.sizeBytes)} · {b.integrity === 'ok' ? 'verificada' : 'CORRUPTA'}</p>
                </div>
                <div style={rowFooter}>
                  <a href={`/api/admin/backups/${b.id}/download`} className="btn">DESCARGAR →</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
