import { useAuth } from '../../components/AuthContext';
import { apiError } from '../../components/apiError';
import { rowBtn, rowFooter, rowHead, rowMain, rowColumn, badge, headerBtn } from '../../components/listRow';
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

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPw.length < 8) { setPwMsg('La nueva contraseña debe tener al menos 8 caracteres.'); return; }
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/admin/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    if (res.ok) { setCurrentPw(''); setNewPw(''); setPwMsg('Contraseña actualizada.'); }
    else { const err = await res.json(); setPwMsg(apiError(err)); }
  };

  const handleToggleRole = async (p: Participant) => {
    const newRole = p.role === 'admin' ? 'participant' : 'admin';
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/participants/${p.id}/role`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) fetchParticipants();
    else { const err = await res.json(); setError(apiError(err)); }
  };

  if (loading) return <div className="container"><div className="loading">Cargando…</div></div>;
  if (!user || user.role !== 'admin') return <div className="container"><div className="loading">Redirigiendo…</div></div>;

  return (
    <div className="container">
      <div className="header">
        <h1>ADMIN</h1>
        <div className="nav">
          <a href="/admin">VOLVER →</a>
          <button onClick={logout} style={headerBtn}>SALIR</button>
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
              <div key={p.id} className="list-item" style={rowColumn}>
                <div style={rowHead}>
                  <div style={{ ...rowMain, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--bg)', flexShrink: 0 }}>
                        {p.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span style={{ fontSize: '0.875rem', wordBreak: 'break-word' }}>{p.displayName}</span>
                  </div>
                  {p.role === 'admin' && (
                    <span style={badge('var(--neon-magenta)')}>ADMIN</span>
                  )}
                </div>
                <div style={rowFooter}>
                  <button onClick={() => handleToggleRole(p)} style={rowBtn}>
                    {p.role === 'admin' ? 'REVOCAR ADMIN' : 'HACER ADMIN'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>CONTRASEÑA ADMIN</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem' }}>Cuenta local (no Steam). Mínimo 8 caracteres.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', maxWidth: '320px' }}>
          <input type="password" placeholder="Actual" value={currentPw} onChange={e => setCurrentPw(e.target.value)} autoComplete="current-password" />
          <input type="password" placeholder="Nueva (mín. 8)" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" />
          <button onClick={handleChangePassword} style={rowBtn}>CAMBIAR CONTRASEÑA</button>
          {pwMsg && <p style={{ fontSize: '0.875rem' }}>{pwMsg}</p>}
        </div>
      </div>
    </div>
  );
}
