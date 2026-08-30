export type PartyStatus = 'planned' | 'active' | 'finished' | 'archived';

export interface Party {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  description: string | null;
  location: string | null;
  status: PartyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePartyInput {
  name: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  location?: string;
}

export interface UpdatePartyInput {
  name?: string;
  startsAt?: string;
  endsAt?: string;
  description?: string;
  location?: string;
}

export interface AuditLogEntry {
  id: number;
  actorParticipantId: number | null;
  actorAdminId: number | null;
  action: string;
  targetType: string;
  targetId: number;
  metadataJson: string;
  createdAt: string;
}

export interface AuditLogFilter {
  targetType?: string;
  targetId?: number;
}
