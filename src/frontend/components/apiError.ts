// Códigos { error: { code } } del API → castellano para el admin.
// Un solo mapa; ampliar aquí, no en cada página.
const ADMIN_ES: Record<string, string> = {
  ACTIVE_PARTY_EXISTS: "Ya hay una party activa. Finalízala antes de crear otra.",
  UNFINISHED_TOURNAMENTS: "Hay torneos sin finalizar.",
  WIZARD_BLOCKED: "Hay torneos en curso.",
  PARTY_FINALIZED: "La party ya está finalizada.",
  PARTY_NOT_FOUND: "La party ya no existe.",
  INVALID_STATUS_TRANSITION: "Esa transición de estado no es válida.",
  ACTIVITY_FULL: "Actividad llena, no quedan plazas.",
  ACTIVITY_NOT_FOUND: "La actividad ya no existe.",
  TOURNAMENT_FULL: "Torneo lleno, no quedan plazas.",
  TOURNAMENT_NOT_JOINABLE: "Ya no admite inscripciones.",
  TOURNAMENT_NOT_FOUND: "El torneo ya no existe.",
  INVALID_TOURNAMENT_STATE: "El torneo no está en un estado válido para eso.",
  GAME_NOT_FOUND: "El juego ya no existe.",
  PARTICIPANT_NOT_FOUND: "El participante ya no existe.",
  PROPOSAL_NOT_FOUND: "La propuesta ya no existe.",
  MATCH_NOT_FOUND: "El partido ya no existe.",
  NOT_FOUND: "No encontrado.",
  NOT_ACTIVE_PARTY: "No hay party activa.",
  NO_ACTIVE_PARTY: "No hay party activa.",
  VALIDATION_ERROR: "Revisa los datos del formulario.",
  INVALID_REQUEST: "Petición no válida.",
  INVALID_ROLE: "El rol debe ser participant o admin.",
  INVALID_ID: "Identificador no válido.",
  NO_CHANGES: "Sin cambios que guardar.",
  DUPLICATE_CODE: "Ese código ya existe.",
  FORBIDDEN: "Sin permiso para esta acción.",
  BACKUP_NOT_FOUND: "Esa copia ya no existe.",
  BACKUP_CORRUPT: "La copia está corrupta.",
  BACKUP_FAILED: "No se pudo crear la copia.",
  BACKUP_DIR_NOT_WRITABLE: "El directorio de copias no es escribible.",
};

export function apiError(data: any, fallback = "Error"): string {
  const code = data?.error?.code ?? data?.error;
  if (typeof code === "string" && ADMIN_ES[code]) return ADMIN_ES[code];
  if (typeof code === "string" && code.length < 60) return code.replace(/_/g, " ").toLowerCase();
  return fallback;
}
