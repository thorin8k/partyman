import { useAuth } from '../../components/AuthContext';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

interface Game {
  id: number;
  title: string;
  description: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  durationMinutes: number | null;
  setupNotes: string | null;
  imageUrl: string | null;
  enabled: boolean;
}

export function AdminGames() {
  const { user, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  const [games, setGames] = useState<Game[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', minPlayers: '', maxPlayers: '', durationMinutes: '', setupNotes: '' });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body = {
      title: form.title,
      description: form.description || null,
      minPlayers: form.minPlayers ? parseInt(form.minPlayers) : null,
      maxPlayers: form.maxPlayers ? parseInt(form.maxPlayers) : null,
      durationMinutes: form.durationMinutes ? parseInt(form.durationMinutes) : null,
      setupNotes: form.setupNotes || null,
    };
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    const url = editingGame ? `/api/admin/games/${editingGame.id}` : '/api/admin/games';
    const method = editingGame ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify(body) });
    if (res.ok) { setShowForm(false); setEditingGame(null); setForm({ title: '', description: '', minPlayers: '', maxPlayers: '', durationMinutes: '', setupNotes: '' }); fetchGames(); }
    else { const err = await res.json(); setError(err.error || 'Error'); }
  };

  const handleEdit = (g: Game) => {
    setEditingGame(g);
    setForm({ title: g.title, description: g.description || '', minPlayers: g.minPlayers?.toString() || '', maxPlayers: g.maxPlayers?.toString() || '', durationMinutes: g.durationMinutes?.toString() || '', setupNotes: g.setupNotes || '' });
    setShowForm(true);
  };

  const handleToggle = async (g: Game) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('partyman_csrf='))?.split('=')[1];
    await fetch(`/api/admin/games/${g.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Partyman-CSRF': csrf || '' }, body: JSON.stringify({ enabled: !g.enabled }) });
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
    else { const err = await res.json(); setError(err.error || 'Error'); }
  };

  if (loading || !user || user.role !== 'admin') return null;

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

      {showForm ? (
        <div className="card">
          <h2>{editingGame ? 'EDITAR JUEGO' : 'NUEVO JUEGO'}</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group"><label>TÍTULO *</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} maxLength={120} required /></div>
            <div className="form-group"><label>DESCRIPCIÓN</label><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group"><label>MIN JUGADORES</label><input type="number" min="1" value={form.minPlayers} onChange={e => setForm({...form, minPlayers: e.target.value})} /></div>
              <div className="form-group"><label>MAX JUGADORES</label><input type="number" min="1" value={form.maxPlayers} onChange={e => setForm({...form, maxPlayers: e.target.value})} /></div>
              <div className="form-group"><label>DURACIÓN (min)</label><input type="number" min="1" value={form.durationMinutes} onChange={e => setForm({...form, durationMinutes: e.target.value})} /></div>
            </div>
            <div className="form-group"><label>NOTAS DE SETUP</label><textarea value={form.setupNotes} onChange={e => setForm({...form, setupNotes: e.target.value})} rows={2} /></div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="primary">{editingGame ? 'GUARDAR' : 'CREAR'}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditingGame(null); }}>CANCELAR</button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2>JUEGOS ({games.length})</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="primary" style={{ fontSize: '0.5rem' }} onClick={() => { setShowForm(true); setEditingGame(null); setForm({ title: '', description: '', minPlayers: '', maxPlayers: '', durationMinutes: '', setupNotes: '' }); }}>+ NUEVO JUEGO</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input placeholder="Buscar en SteamGridDB..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ flex: 1 }} />
            <button onClick={handleSearch} disabled={searching} style={{ fontSize: '0.5rem' }}>{searching ? 'BUSCANDO...' : 'BUSCAR'}</button>
          </div>

          {searchResults.length > 0 && (
            <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <h3 style={{ fontSize: '0.75rem', marginBottom: '0.5rem', color: 'var(--neon-cyan)' }}>RESULTADOS DE STEAMGRIDDB</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {searchResults.map((g, i) => (
                  <div key={i} className="list-item" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {g.imageUrl && <img src={g.imageUrl} alt="" style={{ width: '48px', height: '48px', borderRadius: '4px', objectFit: 'cover' }} />}
                    <div style={{ flex: 1 }}><h3 style={{ fontSize: '0.875rem' }}>{g.name}</h3></div>
                    <button onClick={() => handleAddFromSearch(g)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>AÑADIR</button>
                  </div>
                ))}
              </div>
              <button onClick={() => { setSearchResults([]); setSearchQuery(''); }} style={{ fontSize: '0.4rem', marginTop: '0.5rem' }}>CERRAR</button>
            </div>
          )}
          {games.length === 0 ? (
            <div className="empty-state"><h3>SIN JUEGOS</h3><p style={{ fontSize: '0.875rem' }}>No hay juegos creados todavía.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {games.map(g => (
                <div key={g.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {g.imageUrl && <img src={g.imageUrl} alt="" style={{ width: '48px', height: '48px', borderRadius: '4px', objectFit: 'cover' }} />}
                    <div>
                      <h3 style={{ marginBottom: '0.25rem' }}>{g.title}</h3>
                      <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                        {g.minPlayers && g.maxPlayers ? `${g.minPlayers}-${g.maxPlayers} jug.` : ''}
                        {g.durationMinutes ? ` · ${g.durationMinutes}min` : ''}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button onClick={() => handleToggle(g)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem', borderColor: g.enabled ? 'var(--neon-green)' : 'var(--error)', color: g.enabled ? 'var(--neon-green)' : 'var(--error)' }}>
                      {g.enabled ? 'ACTIVO' : 'INACTIVO'}
                    </button>
                    <button onClick={() => handleEdit(g)} style={{ fontSize: '0.4rem', padding: '0.25rem 0.5rem' }}>EDITAR</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
