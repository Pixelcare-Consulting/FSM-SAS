import { getSupabaseAdmin } from "../../../../lib/supabase/server";
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
  buildChanges,
} from "../../../../lib/services/auditLog";

export default async function handler(req, res) {
  if (req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { technicianId } = req.query;
  const { color } = req.body;

  if (!technicianId) {
    return res.status(400).json({ error: "Technician ID is required" });
  }

  if (!color || !/^#[0-9A-F]{6}$/i.test(color)) {
    return res.status(400).json({ error: "Valid hex color code is required (e.g., #1aaa55)" });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("technicians")
      .update({ color })
      .eq("id", technicianId)
      .select("id, full_name, color")
      .single();

    if (error) {
      console.error("Error updating technician color:", error);
      return res.status(500).json({ error: error.message || "Failed to update technician color" });
    }

    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.WORKER_UPDATE,
      category: AUDIT_CATEGORIES.WORKER,
      entityType: 'worker',
      entityId: technicianId,
      entityLabel: data?.full_name || technicianId,
      description: 'Technician calendar color updated',
      details: { field: 'color' },
      changes: buildChanges({ color: null }, { color }),
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({ success: true, technician: data });
  } catch (error) {
    console.error("Technician color update error", error);
    return res.status(500).json({
      error: error.message || "Unable to update technician color.",
    });
  }
}

