import type { Database } from "bun:sqlite";
import { PartyService } from "../parties/service";
import { requireAdmin, requireSession } from "../auth/guards";
import { joinPasswordRequired } from "../auth/password";
import { createBackup } from "../ops/backup";
import { setParticipantRole, getAllParticipants, type ParticipantRole } from "../auth/participants";
import type { CreatePartyInput, UpdatePartyInput } from "../../shared/contracts/parties";
import { pathId } from "../http/ids";

function extractId(url: string, prefix: string): number | null {
  return pathId(url, prefix);
}

export function createPartyRoutes(db: Database) {
  const service = new PartyService(db);

  return {
    "/api/parties/active": {
      GET: handleGetActiveParty,
    },
    "/api/parties": {
      GET: handleGetParties,
    },
    "/api/parties/:id": {
      GET: handleGetParty,
    },
    "/api/admin/parties": {
      POST: handleCreateParty,
    },
    "/api/admin/parties/:id": {
      PATCH: handleUpdateParty,
    },
    "/api/admin/parties/:id/activate": {
      POST: handleActivateParty,
    },
    "/api/admin/parties/:id/finish": {
      POST: handleFinishParty,
    },
    "/api/admin/parties/:id/archive": {
      POST: handleArchiveParty,
    },
    "/api/admin/parties/:id/delete": {
      POST: handleDeleteParty,
    },
    "/api/admin/parties/:id/close": {
      POST: handleCloseParty,
    },
    "/api/admin/participants": {
      GET: handleGetParticipants,
    },
    "/api/admin/participants/:id/role": {
      PATCH: handleSetParticipantRole,
    },
  };

  async function handleGetActiveParty(request: Request): Promise<Response> {
    const party = service.getActive();
    // Alta perezosa: quien abre la app con party activa y sesión de participante
    // entra solo (cubre logins anteriores a la activación). Nunca falla a visitas.
    // Con JOIN_PASSWORD no hay atajos: solo /api/participants/join con la clave.
    if (party && !joinPasswordRequired()) {
      const ctx = requireSession(db, request);
      if (!(ctx instanceof Response) && ctx.session.subjectType === "participant") {
        db.run("INSERT OR IGNORE INTO party_memberships (party_id, participant_id, display_name_snapshot) VALUES (?, ?, (SELECT display_name FROM participants WHERE id = ?))",
          [party.id, ctx.session.subjectId, ctx.session.subjectId]);
      }
    }
    console.log("[parties] GET /api/parties/active →", party ? `party#${party.id}` : "null");
    return Response.json({ party });
  }

  async function handleGetParties(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") as any;
    const filter = status ? { status } : undefined;
    const parties = service.getAll(filter);
    console.log("[parties] GET /api/parties →", parties.length, "parties");
    return Response.json({ parties });
  }

  async function handleGetParty(request: Request): Promise<Response> {
    const id = extractId(request.url, "/api/parties/");
    if (id === null) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    const party = service.getById(id);
    console.log("[parties] GET /api/parties/" + id + " →", party ? "found" : "NOT_FOUND");
    if (!party) {
      return Response.json({ error: { code: "PARTY_NOT_FOUND", message: "PARTY_NOT_FOUND" } }, { status: 404 });
    }
    return Response.json({ party });
  }

  async function handleCreateParty(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const body = (await request.json()) as CreatePartyInput;

    const errors = validatePartyInput(body);
    if (errors.length > 0) {
      console.log("[parties] POST /api/admin/parties → VALIDATION_ERROR:", errors);
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: errors }, { status: 400 });
    }

    try {
      const party = service.create(body, auth.session.subjectId);
      console.log("[parties] POST /api/admin/parties → created party#" + party.id);
      return Response.json({ party }, { status: 201 });
    } catch (err) {
      console.log("[parties] POST /api/admin/parties → error:", err);
      return handleError(err);
    }
  }
  async function handleUpdateParty(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const id = extractId(request.url, "/api/admin/parties/");
    if (id === null) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const body = (await request.json()) as UpdatePartyInput;

    const errors = validatePartyUpdateInput(body);
    if (errors.length > 0) {
      console.log("[parties] PATCH /api/admin/parties/" + id + " → VALIDATION_ERROR:", errors);
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" }, details: errors }, { status: 400 });
    }

    try {
      const party = service.update(id, body, auth.session.subjectId);
      console.log("[parties] PATCH /api/admin/parties/" + id + " → updated");
      return Response.json({ party });
    } catch (err) {
      console.log("[parties] PATCH /api/admin/parties/" + id + " → error:", err);
      return handleError(err);
    }
  }

  async function handleActivateParty(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const id = extractId(request.url, "/api/admin/parties/");
    if (id === null) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    try {
      const party = service.activate(id, auth.session.subjectId);
      console.log("[parties] POST /api/admin/parties/" + id + "/activate → activated");
      return Response.json({ party });
    } catch (err) {
      console.log("[parties] POST /api/admin/parties/" + id + "/activate → error:", err);
      return handleError(err);
    }
  }

  async function handleFinishParty(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const id = extractId(request.url, "/api/admin/parties/");
    if (id === null) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    try {
      const party = service.finish(id, auth.session.subjectId);
      console.log("[parties] POST /api/admin/parties/" + id + "/finish → finished");
      return Response.json({ party });
    } catch (err) {
      console.log("[parties] POST /api/admin/parties/" + id + "/finish → error:", err);
      return handleError(err);
    }
  }

  async function handleArchiveParty(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const id = extractId(request.url, "/api/admin/parties/");
    if (id === null) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    try {
      const party = service.archive(id, auth.session.subjectId);
      console.log("[parties] POST /api/admin/parties/" + id + "/archive → archived");
      return Response.json({ party });
    } catch (err) {
      console.log("[parties] POST /api/admin/parties/" + id + "/archive → error:", err);
      return handleError(err);
    }
  }

  // Task 014: one-click close — cancel unstarted, finish (+score), backup. Resumable via step states.
  async function handleCloseParty(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = extractId(request.url, "/api/admin/parties/");
    if (id === null) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    const steps: Array<{ key: string; status: "done" | "blocked" | "failed"; detail: string }> = [];
    try {
      const pending = db.query<{ id: number; name: string }, [number]>(
        "SELECT id, name FROM tournaments WHERE party_id = ? AND status IN ('draft', 'upcoming')"
      ).all(id);
      for (const t of pending) {
        db.run("UPDATE tournaments SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [t.id]);
      }
      steps.push({ key: "cancel", status: "done", detail: `${pending.length} torneos sin empezar cancelados` });

      const live = db.query<{ name: string }, [number]>(
        "SELECT name FROM tournaments WHERE party_id = ? AND status = 'in_progress'"
      ).all(id);
      if (live.length > 0) {
        steps.push({ key: "finish", status: "blocked", detail: `En curso: ${live.map(t => t.name).join(", ")}` });
        return Response.json({ error: { code: "WIZARD_BLOCKED", message: "WIZARD_BLOCKED" }, steps }, { status: 409 });
      }

      try {
        service.finish(id, auth.session.subjectId);
        steps.push({ key: "finish", status: "done", detail: "Party finalizada y puntos asignados" });
      } catch (err) {
        return handleErrorWithSteps(err, steps);
      }

      try {
        const backupDir = process.env.BACKUP_DIR ?? "/data/backups";
        const backupKeep = Number.parseInt(process.env.BACKUP_KEEP ?? "20", 10);
        const meta = await createBackup(db, backupDir, { keep: backupKeep });
        steps.push({ key: "backup", status: "done", detail: `Copia ${meta.filename} verificada` });
      } catch {
        steps.push({ key: "backup", status: "failed", detail: "No se pudo crear la copia; reintenta" });
      }
      console.log("[parties] POST /api/admin/parties/" + id + "/close → wizard done");
      return Response.json({ ok: true, steps });
    } catch (err) {
      return handleErrorWithSteps(err, steps);
    }
  }

  function handleErrorWithSteps(err: any, steps: Array<{ key: string; status: string; detail: string }>): Response {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "PARTY_NOT_FOUND") return Response.json({ error: { code: "PARTY_NOT_FOUND", message: "PARTY_NOT_FOUND" }, steps }, { status: 404 });
    if (message === "UNFINISHED_TOURNAMENTS") return Response.json({ error: { code: "WIZARD_BLOCKED", message: "WIZARD_BLOCKED" }, steps }, { status: 409 });
    if (message === "INVALID_STATUS_TRANSITION") return Response.json({ error: { code: "INVALID_STATUS_TRANSITION", message: "INVALID_STATUS_TRANSITION" }, steps }, { status: 400 });
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "INTERNAL_ERROR" }, steps }, { status: 500 });
  }

  async function handleDeleteParty(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const id = extractId(request.url, "/api/admin/parties/");
    if (id === null) return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });

    try {
      service.deleteParty(id);
    } catch (err) {
      return handleError(err);
    }
    console.log("[parties] POST /api/admin/parties/" + id + "/delete → deleted");
    return Response.json({ ok: true });
  }

  function validatePartyInput(input: CreatePartyInput): string[] {
    const errors: string[] = [];

    if (!input.name || input.name.trim().length === 0) {
      errors.push("name is required");
    } else if (input.name.length > 120) {
      errors.push("name must be 120 characters or less");
    }

    if (!input.startsAt) {
      errors.push("startsAt is required");
    } else if (isNaN(Date.parse(input.startsAt))) {
      errors.push("startsAt must be a valid ISO date");
    }

    if (!input.endsAt) {
      errors.push("endsAt is required");
    } else if (isNaN(Date.parse(input.endsAt))) {
      errors.push("endsAt must be a valid ISO date");
    }

    if (input.startsAt && input.endsAt) {
      const start = Date.parse(input.startsAt);
      const end = Date.parse(input.endsAt);
      if (!isNaN(start) && !isNaN(end) && start >= end) {
        errors.push("startsAt must be before endsAt");
      }
    }

    if (input.description && input.description.length > 2000) {
      errors.push("description must be 2000 characters or less");
    }

    if (input.location && input.location.length > 200) {
      errors.push("location must be 200 characters or less");
    }

    return errors;
  }

  function validatePartyUpdateInput(input: UpdatePartyInput): string[] {
    const errors: string[] = [];

    if (input.name !== undefined) {
      if (input.name.trim().length === 0) {
        errors.push("name cannot be empty");
      } else if (input.name.length > 120) {
        errors.push("name must be 120 characters or less");
      }
    }

    if (input.startsAt !== undefined && isNaN(Date.parse(input.startsAt))) {
      errors.push("startsAt must be a valid ISO date");
    }

    if (input.endsAt !== undefined && isNaN(Date.parse(input.endsAt))) {
      errors.push("endsAt must be a valid ISO date");
    }

    if (input.startsAt && input.endsAt) {
      const start = Date.parse(input.startsAt);
      const end = Date.parse(input.endsAt);
      if (!isNaN(start) && !isNaN(end) && start >= end) {
        errors.push("startsAt must be before endsAt");
      }
    }

    if (input.description !== undefined && input.description.length > 2000) {
      errors.push("description must be 2000 characters or less");
    }

    if (input.location !== undefined && input.location.length > 200) {
      errors.push("location must be 200 characters or less");
    }

    return errors;
  }

  function handleError(err: any): Response {
    const message = err instanceof Error ? err.message : String(err);

    switch (message) {
      case "PARTY_NOT_FOUND":
        return Response.json({ error: { code: "PARTY_NOT_FOUND", message: "PARTY_NOT_FOUND" } }, { status: 404 });
      case "PARTY_FINALIZED":
        return Response.json({ error: { code: "PARTY_FINALIZED", message: "PARTY_FINALIZED" } }, { status: 409 });
      case "ACTIVE_PARTY_EXISTS":
        return Response.json({ error: { code: "ACTIVE_PARTY_EXISTS", message: "ACTIVE_PARTY_EXISTS" } }, { status: 409 });
      case "UNFINISHED_TOURNAMENTS":
        return Response.json({ error: { code: "UNFINISHED_TOURNAMENTS", message: "UNFINISHED_TOURNAMENTS" } }, { status: 409 });
      case "INVALID_STATUS_TRANSITION":
        return Response.json({ error: { code: "INVALID_STATUS_TRANSITION", message: "INVALID_STATUS_TRANSITION" } }, { status: 400 });
      default:
        return Response.json({ error: { code: "INTERNAL_ERROR", message: "INTERNAL_ERROR" } }, { status: 500 });
    }
  }

  async function handleGetParticipants(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const participants = getAllParticipants(db);
    console.log("[admin] GET /api/admin/participants →", participants.length, "participants");
    return Response.json({ participants });
  }

  async function handleSetParticipantRole(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const id = extractId(request.url, "/api/admin/participants/");
    if (id === null) {
      return Response.json({ error: { code: "INVALID_ID", message: "INVALID_ID" } }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.role || !["participant", "admin"].includes(body.role)) {
      return Response.json({ error: { code: "INVALID_ROLE", message: "role must be 'participant' or 'admin'" } }, { status: 400 });
    }

    const participant = db.query<{ id: number }, [number]>("SELECT id FROM participants WHERE id = ?").get(id);
    if (!participant) {
      return Response.json({ error: { code: "PARTICIPANT_NOT_FOUND", message: "PARTICIPANT_NOT_FOUND" } }, { status: 404 });
    }

    setParticipantRole(db, id, body.role as ParticipantRole);
    db.run("INSERT INTO audit_log (actor_participant_id, actor_admin_id, action, target_type, target_id, metadata_json) VALUES (?, ?, 'role_changed', 'participant', ?, ?)",
      [auth.session.subjectType === "participant" ? auth.session.subjectId : null, auth.session.subjectType === "admin" ? auth.session.subjectId : null, id, JSON.stringify({ role: body.role })]);
    console.log("[admin] PATCH /api/admin/participants/" + id + "/role →", body.role);
    return Response.json({ ok: true, role: body.role });
  }
}
