import { useAuth } from '../../components/AuthContext';
import { useEffect, useState } from 'react';
import { useParams } from 'wouter';

// ponytail: mapa central razón técnica -> ES humano.
const REASON_ES: Record<string, string> = {
  party_participation: 'Participación en party',
  tournament_win: 'Victoria en torneo',
  tournament_runner_up: 'Subcampeón de torneo',
};

function reasonLabel(l: any): string {
  if (l.correction_of) return `Corrección: ${l.reason}`;
  return REASON_ES[l.reason] || l.reason;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? '' : new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
};

export function ParticipantHistory() {
  const { user } = useAuth();
  const params = useParams();
  const id = params?.id ?? String(user?.id ?? '');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setError(null);
    fetch(`/api/participants/${id}/history`)
      .then(async r => {
        if (r.status === 401) { setError('Tienes que entrar con Steam para ver historiales.'); return; }
        if (r.status === 403) { setError('Solo puedes ver tu propio historial.'); return; }
        if (!r.ok) { setError('No se pudo cargar el historial.'); return; }
        setData(await r.json());
      })
      .catch(() => setError('Error de conexión.'));
  }, [id]);

  const total = data?.ledger?.reduce((s: number, l: any) => s + (l.points || 0), 0) ?? 0;
  const wins = data?.ledger?.filter((l: any) => l.reason === 'tournament_win' && !l.correction_of).length ?? 0;

  return (
    <div className="container">
      <div className="header"><h1>HISTORIAL</h1><a href="/">VOLVER →</a></div>
      {error ? <div className="card"><div className="alert error">{error}</div><a href="/login">Ir al login →</a></div>
      : !data ? <div className="container"><div className="loading">Cargando historial…</div></div> : (
        <>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2>TOTAL</h2>
              <span style={{ fontFamily: 'var(--font-display)', color: 'var(--neon-green)' }}>{total} PTS · {wins} {wins === 1 ? 'victoria' : 'victorias'}</span>
            </div>
          </div>
          <div className="card" style={{ marginTop: '1rem' }}><h2>PUNTOS</h2>{data.ledger?.length === 0 ? <p style={{ color: 'var(--text-dim)' }}>Sin puntos todavía</p> : data.ledger.map((l: any) => (
            <div key={l.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{reasonLabel(l)} <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>· {fmtDate(l.created_at)}</span></span>
              <span style={{ color: l.points < 0 ? 'var(--error)' : 'var(--neon-green)' }}>{l.points > 0 ? `+${l.points}` : l.points} pts</span>
            </div>))}</div>
          <div className="card" style={{ marginTop: '1rem' }}><h2>PREMIOS</h2>{data.awards?.length === 0 ? <p style={{ color: 'var(--text-dim)' }}>Sin premios</p> : data.awards.map((a: any) => <div key={a.id} className="list-item"><h3>{a.title}</h3>{a.note && <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{a.note}</p>}{a.created_at && <p style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{fmtDate(a.created_at)}</p>}</div>)}</div>
        </>
      )}
    </div>
  );
}
