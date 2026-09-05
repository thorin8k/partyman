import { useAuth } from '../../components/AuthContext';
import { useEffect, useState } from 'react';
import { useParams } from 'wouter';

export function ParticipantHistory() {
  const { user } = useAuth();
  const params = useParams();
  const id = params?.id ?? String(user?.id ?? '');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (id) fetch(`/api/participants/${id}/history`).then(r => r.json()).then(setData).catch(() => {});
  }, [id]);

  return (
    <div className="container">
      <div className="header"><h1>HISTORIAL</h1><a href="/">VOLVER →</a></div>
      {!data ? <div className="loading">Cargando</div> : (
        <>
          <div className="card"><h2>PUNTOS</h2>{data.ledger?.length === 0 ? <p style={{ color: 'var(--text-dim)' }}>Sin puntos</p> : data.ledger.map((l:any) => <div key={l.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{l.reason} · {l.source_type}:{l.source_key}</span><span style={{ color: 'var(--neon-green)' }}>{l.points} pts</span></div>)}</div>
          <div className="card" style={{ marginTop: '1rem' }}><h2>PREMIOS</h2>{data.awards?.length === 0 ? <p style={{ color: 'var(--text-dim)' }}>Sin premios</p> : data.awards.map((a:any) => <div key={a.id} className="list-item"><h3>{a.title}</h3><p style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{a.note}</p></div>)}</div>
        </>
      )}
    </div>
  );
}
