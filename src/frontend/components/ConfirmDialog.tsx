import { useEffect, useState } from 'react';

interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (value: boolean) => void;
}

let setRequest: ((r: ConfirmRequest | null) => void) | null = null;

// ponytail: singleton promise-based confirm; sustituye window.confirm (task 013).
export function confirmDialog(message: string, opts?: { confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    if (!setRequest) { resolve(false); return; }
    setRequest({ message, confirmLabel: opts?.confirmLabel ?? 'CONFIRMAR', danger: opts?.danger ?? false, resolve });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    setRequest = setReq;
    return () => { setRequest = null; };
  }, []);

  if (!req) return null;
  const close = (value: boolean) => { req.resolve(value); setReq(null); };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => close(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p style={{ marginBottom: '1.25rem', lineHeight: 1.5 }}>{req.message}</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => close(false)}>CANCELAR</button>
          <button
            type="button"
            className={req.danger ? 'danger' : 'primary'}
            onClick={() => close(true)}
            autoFocus
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
