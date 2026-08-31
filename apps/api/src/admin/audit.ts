import type { Request } from 'express';
import { portalDb } from '../db/portal-connection';

/** Best-effort audit trail for admin actions — never blocks the request if it fails. */
export async function writeAuditLog(
  req: Request,
  action: string,
  entityType: string,
  entityId: number | null,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await portalDb()('hp_audit_log').insert({
      actor_user_id: req.user?.sub ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      payload_json: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
