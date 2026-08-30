import { useState } from 'react';

interface PartyFormData {
  name: string;
  startsAt: string;
  endsAt: string;
  description: string;
  location: string;
}

interface PartyFormProps {
  initialData?: Partial<PartyFormData>;
  onSubmit: (data: PartyFormData) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  loading?: boolean;
}

export function PartyForm({ initialData, onSubmit, onCancel, submitLabel = 'CREAR PARTY', loading }: PartyFormProps) {
  const [formData, setFormData] = useState<PartyFormData>({
    name: initialData?.name || '',
    startsAt: initialData?.startsAt || '',
    endsAt: initialData?.endsAt || '',
    description: initialData?.description || '',
    location: initialData?.location || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es obligatorio';
    } else if (formData.name.length > 120) {
      newErrors.name = 'El nombre no puede tener más de 120 caracteres';
    }

    if (!formData.startsAt) {
      newErrors.startsAt = 'La fecha de inicio es obligatoria';
    }

    if (!formData.endsAt) {
      newErrors.endsAt = 'La fecha de fin es obligatoria';
    }

    if (formData.startsAt && formData.endsAt && new Date(formData.startsAt) >= new Date(formData.endsAt)) {
      newErrors.endsAt = 'La fecha de fin debe ser posterior a la de inicio';
    }

    if (formData.description.length > 2000) {
      newErrors.description = 'La descripción no puede tener más de 2000 caracteres';
    }

    if (formData.location.length > 200) {
      newErrors.location = 'La ubicación no puede tener más de 200 caracteres';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(formData);
  };

  const toLocalDateTime = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label>NOMBRE *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Nombre de la party"
          maxLength={120}
        />
        {errors.name && <span className="error-text">{errors.name}</span>}
      </div>

      <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group">
          <label>INICIO *</label>
          <input
            type="datetime-local"
            value={toLocalDateTime(formData.startsAt)}
            onChange={(e) => setFormData({ ...formData, startsAt: new Date(e.target.value).toISOString() })}
          />
          {errors.startsAt && <span className="error-text">{errors.startsAt}</span>}
        </div>

        <div className="form-group">
          <label>FIN *</label>
          <input
            type="datetime-local"
            value={toLocalDateTime(formData.endsAt)}
            onChange={(e) => setFormData({ ...formData, endsAt: new Date(e.target.value).toISOString() })}
          />
          {errors.endsAt && <span className="error-text">{errors.endsAt}</span>}
        </div>
      </div>

      <div className="form-group">
        <label>DESCRIPCIÓN</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Descripción opcional de la party"
          rows={3}
          maxLength={2000}
        />
        {errors.description && <span className="error-text">{errors.description}</span>}
      </div>

      <div className="form-group">
        <label>UBICACIÓN</label>
        <input
          type="text"
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          placeholder="Ej: Garaje de Juan"
          maxLength={200}
        />
        {errors.location && <span className="error-text">{errors.location}</span>}
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'GUARDANDO...' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            CANCELAR
          </button>
        )}
      </div>
    </form>
  );
}
