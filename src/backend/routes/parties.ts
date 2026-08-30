import type { Database } from "bun:sqlite";
import { PartyService } from "../parties/service";
import { requireAdmin } from "../auth/guards";
import { setParticipantRole, getAllParticipants, type ParticipantRole } from "../auth/participants";
import type { CreatePartyInput, UpdatePartyInput } from "../../shared/contracts/parties";

function extractId(url: string, prefix: string): number | null {
  const path = new URL(url).pathname;
  const suffix = path.slice(prefix.length);
  const id = parseInt(suffix.split("/")[0], 10);
  return isNaN(id) || id <= 0 ? null : id;
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
    "/api/admin/audit-log": {
      GET: handleGetAuditLog,
    },
    "/api/admin/participants": {
      GET: handleGetParticipants,
    },
    "/api/admin/participants/:id/role": {
      PATCH: handleSetParticipantRole,
    },
  };

  async function handleGetActiveParty(): Promise<Response> {
    const party = service.getActive();
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
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });
    const party = service.getById(id);
    console.log("[parties] GET /api/parties/" + id + " →", party ? "found" : "NOT_FOUND");
    if (!party) {
      return Response.json({ error: "PARTY_NOT_FOUND" }, { status: 404 });
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
      return Response.json({ error: "VALIDATION_ERROR", details: errors }, { status: 400 });
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
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const body = (await request.json()) as UpdatePartyInput;

    const errors = validatePartyUpdateInput(body);
    if (errors.length > 0) {
      console.log("[parties] PATCH /api/admin/parties/" + id + " → VALIDATION_ERROR:", errors);
      return Response.json({ error: "VALIDATION_ERROR", details: errors }, { status: 400 });
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
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

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
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

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
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    try {
      const party = service.archive(id, auth.session.subjectId);
      console.log("[parties] POST /api/admin/parties/" + id + "/archive → archived");
      return Response.json({ party });
    } catch (err) {
      console.log("[parties] POST /api/admin/parties/" + id + "/archive → error:", err);
      return handleError(err);
    }
  }

  async function handleDeleteParty(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const id = extractId(request.url, "/api/admin/parties/");
    if (id === null) return Response.json({ error: "INVALID_ID" }, { status: 400 });

    const party = service.getById(id);
    if (!party) return Response.json({ error: "PARTY_NOT_FOUND" }, { status: 404 });

    db.run("DELETE FROM party_memberships WHERE party_id = ?", [id]);
    db.run("DELETE FROM audit_log WHERE target_type = 'party' AND target_id = ?", [id]);
    db.run("DELETE FROM parties WHERE id = ?", [id]);
    console.log("[parties] POST /api/admin/parties/" + id + "/delete → deleted");
    return Response.json({ ok: true });
  }

  async function handleGetAuditLog(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;

    const url = new URL(request.url);
    const targetType = url.searchParams.get("targetType") ?? undefined;
    const targetIdStr = url.searchParams.get("targetId");
    const targetId = targetIdStr ? parseInt(targetIdStr, 10) : undefined;

    const entries = service.getAuditLog({ targetType, targetId });
    return Response.json({ entries });
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
        return Response.json({ error: "PARTY_NOT_FOUND" }, { status: 404 });
      case "PARTY_FINALIZED":
        return Response.json({ error: "PARTY_FINALIZED" }, { status: 409 });
      case "ACTIVE_PARTY_EXISTS":
        return Response.json({ error: "ACTIVE_PARTY_EXISTS" }, { status: 409 });
      case "UNFINISHED_TOURNAMENTS":
        return Response.json({ error: "UNFINISHED_TOURNAMENTS" }, { status: 409 });
      case "INVALID_STATUS_TRANSITION":
        return Response.json({ error: "INVALID_STATUS_TRANSITION" }, { status: 400 });
      default:
        return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
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
      return Response.json({ error: "INVALID_ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.role || !["participant", "admin"].includes(body.role)) {
      return Response.json({ error: "INVALID_ROLE", message: "role must be 'participant' or 'admin'" }, { status: 400 });
    }

    const participant = db.query<{ id: number }, [number]>("SELECT id FROM participants WHERE id = ?").get(id);
    if (!participant) {
      return Response.json({ error: "PARTICIPANT_NOT_FOUND" }, { status: 404 });
    }

    setParticipantRole(db, id, body.role as ParticipantRole);
    console.log("[admin] PATCH /api/admin/participants/" + id + "/role →", body.role);
    return Response.json({ ok: true, role: body.role });
  }
}
