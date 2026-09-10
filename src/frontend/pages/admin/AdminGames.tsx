import { useAuth } from '../../components/AuthContext';
import { apiError } from '../../components/apiError';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

interface Game {
  id: number;
  title: string;
  imageUrl: string | null;
  enabled: boolean;
}

export function AdminGames() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/admin/login');
    else if (!loading && user?.role !== 'admin') navigate('/');
  }, [user, loading, navigate]);

  useEffect(() => { if (user?.role === 'admin') fetchGames(); }, [user]);

  const fetchGames = async () => {
    const res = await fetch('/api/admin/games');
    if (res.ok) setGames((await res.json()).games);
  };

  const handleToggle = async (g: Game) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/admin/games/${g.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ enabled: !g.enabled }) });
    fetchGames();
  };

  const [notice, setNotice] = useState<string | null>(null);

  const handleDelete = async (id: number) => {
    if (!confirm('¿Borrar este juego del catálogo?')) return;
    setNotice(null);
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch(`/api/admin/games/${id}`, { method: 'DELETE', headers: { 'X-Partyman-CSRF': csrf || '' } }).catch(() => null);
    if (res && res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.disabled) setNotice('Está en uso: desactivado en vez de borrar. Reactívalo con INACTIVO → ACTIVO.');
      else setNotice('Juego borrado.');
    }
    fetchGames();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const res = await fetch(`/api/games/search?q=${encodeURIComponent(searchQuery)}`);
    if (res.ok) setSearchResults((await res.json()).games || []);
    setSearching(false);
  };

  const handleAddFromSearch = async (game: any) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const res = await fetch('/api/admin/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' },
      body: JSON.stringify({ title: game.name, imageUrl: game.imageUrl || null, steamgriddbId: game.id || null }),
    });
    if (res.ok) { fetchGames(); setSearchResults([]); setSearchQuery(''); }
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
          <a href="/display" target="_blank">DISPLAY →</a>
          <button onClick={logout} style={{ fontSize: '0.5rem', padding: '0.5rem 1rem' }}>SALIR</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <div className="card">
        <h2>JUEGOS ({games.length})</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: '1rem' }}>Añade juegos buscando en SteamGridDB</p>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input placeholder="Buscar en SteamGridDB..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ flex: 1 }} />
          <button onClick={handleSearch} disabled={searching} style={{ fontSize: '0.5rem' }}>{searching ? 'BUSCANDO...' : 'BUSCAR'}</button>
        </div>

        {searchResults.length > 0 && (
          <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <h3 style={{ fontSize: '0.75rem', marginBottom: '0.5rem', color: 'var(--neon-cyan)' }}>RESULTADOS DE STEAMGRIDDB</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {searchResults.map((g, i) => (
                <div key={i} className="list-item" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'nowrap' }}>
                  {g.imageUrl && <img src={g.imageUrl} alt="" style={{ width: '48px', height: '48px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}><h3 style={{ fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</h3></div>
                  <button onClick={() => handleAddFromSearch(g)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', flexShrink: 0 }}>AÑADIR</button>
                </div>
              ))}
            </div>
            <button onClick={() => { setSearchResults([]); setSearchQuery(''); }} style={{ fontSize: '0.4rem', marginTop: '0.5rem' }}>CERRAR</button>
          </div>
        )}

        {games.length === 0 ? (
          <div className="empty-state"><h3>SIN JUEGOS</h3><p style={{ fontSize: '0.875rem' }}>Busca y añade juegos desde SteamGridDB.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {games.map(g => (
              <div key={g.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {g.imageUrl && <img src={g.imageUrl} alt="" style={{ width: '48px', height: '48px', borderRadius: '4px', objectFit: 'cover' }} />}
                  <h3>{g.title}</h3>
                </div>
                <button onClick={() => handleToggle(g)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', borderColor: g.enabled ? 'var(--neon-green)' : 'var(--error)', color: g.enabled ? 'var(--neon-green)' : 'var(--error)' }}>
                  {g.enabled ? 'ACTIVO' : 'INACTIVO'}
                </button>
                <button onClick={() => handleDelete(g.id)} className="danger" style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>BORRAR</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
