import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Form, Spinner, Table } from "react-bootstrap";
import toast from "react-hot-toast";
import SessionResetConfirmModal from "./SessionResetConfirmModal";

function formatTs(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function getCookieValue(name) {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const cookie of cookies) {
    const [k, ...rest] = cookie.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function PortalLoginBadge({ value }) {
  if (value === true) return <Badge bg="success">Online</Badge>;
  if (value === false) return <Badge bg="secondary">Offline</Badge>;
  return (
    <Badge bg="light" text="dark">
      Unknown
    </Badge>
  );
}

function roleCountLabel(role, total) {
  if (role === "TECHNICIAN") return `${total} technician${total === 1 ? "" : "s"}`;
  if (role === "ADMIN") return `${total} admin${total === 1 ? "" : "s"}`;
  if (role === "MANAGER") return `${total} manager${total === 1 ? "" : "s"}`;
  return `${total} user${total === 1 ? "" : "s"}`;
}

const SessionDevicesPanel = () => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  const [adminUsers, setAdminUsers] = useState([]);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminPage, setAdminPage] = useState(1);
  const [adminLimit, setAdminLimit] = useState(20);
  const [adminQ, setAdminQ] = useState("");
  const [adminRole, setAdminRole] = useState("TECHNICIAN");
  const [adminLoading, setAdminLoading] = useState(false);
  const [rowResetting, setRowResetting] = useState({});
  const [selectedUserIds, setSelectedUserIds] = useState(() => new Set());
  const [batchResetting, setBatchResetting] = useState(false);

  const [resetModal, setResetModal] = useState(null);
  const [resetReason, setResetReason] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const clearSelection = useCallback(() => {
    setSelectedUserIds(new Set());
  }, []);

  const closeResetModal = useCallback(() => {
    if (resetSubmitting) return;
    setResetModal(null);
    setResetReason("");
  }, [resetSubmitting]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/session/status", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to load session status");
      }

      const data = await res.json();
      setStatus(data?.session ?? data);
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed to load session status");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const isAdmin = getCookieValue("isAdmin") === "true";

  const loadAdminUsers = useCallback(
    async ({ page, limit, q, role } = {}) => {
      if (!isAdmin) return;
      const nextPage = page ?? adminPage;
      const nextLimit = limit ?? adminLimit;
      const nextQ = q ?? adminQ;
      const nextRole = role ?? adminRole;

      setAdminLoading(true);
      try {
        clearSelection();
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: String(nextLimit),
        });
        if (nextQ && nextQ.trim()) params.set("q", nextQ.trim());
        if (nextRole && nextRole !== "ALL") params.set("role", nextRole);

        const res = await fetch(`/api/session/users?${params.toString()}`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || "Failed to load users");
        }

        const data = await res.json();
        setAdminUsers(Array.isArray(data.users) ? data.users : []);
        setAdminTotal(Number(data.totalCount) || 0);
        setAdminPage(Number(data.page) || nextPage);
        setAdminLimit(Number(data.limit) || nextLimit);
      } catch (e) {
        console.error(e);
        toast.error(e.message || "Failed to load users");
      } finally {
        setAdminLoading(false);
      }
    },
    [isAdmin, adminPage, adminLimit, adminQ, adminRole, clearSelection]
  );

  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => {
      loadAdminUsers({ page: 1, limit: adminLimit, q: adminQ, role: adminRole }).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [isAdmin, adminQ, adminLimit, adminRole, loadAdminUsers]);

  const confirmSessionReset = useCallback(async () => {
    if (!resetModal || resetSubmitting) return;

    const reason = String(resetReason || "").trim();
    setResetSubmitting(true);

    if (resetModal.mode === "self") {
      const t = toast.loading("Resetting session…");
      try {
        const res = await fetch("/api/session/reset", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: reason || "user_initiated_session_reset",
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Session reset failed");
        }

        toast.success("Session reset. Redirecting…", { id: t });
        window.location.href =
          "/sign-in?toast=" +
          encodeURIComponent(
            "Session reset. Please sign in again. You can now log in on the mobile app."
          );
      } catch (e) {
        console.error(e);
        toast.error(e.message || "Session reset failed", { id: t });
        setResetSubmitting(false);
      }
      return;
    }

    if (resetModal.mode === "single") {
      const user = resetModal.user;
      if (!user?.id) {
        setResetSubmitting(false);
        return;
      }
      const displayName = user.display_name || user.username || user.id;
      setRowResetting((prev) => ({ ...prev, [user.id]: true }));
      const t = toast.loading(`Resetting ${displayName}…`);
      try {
        const res = await fetch("/api/session/reset-user", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            reason: reason || "admin_initiated_user_session_reset",
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Reset failed");
        }

        toast.success(`Reset ${displayName}`, { id: t });
        closeResetModal();
        await loadAdminUsers();
      } catch (e) {
        console.error(e);
        toast.error(e.message || "Reset failed", { id: t });
      } finally {
        setRowResetting((prev) => ({ ...prev, [user.id]: false }));
        setResetSubmitting(false);
      }
      return;
    }

    if (resetModal.mode === "batch") {
      const ids = resetModal.userIds || [];
      if (ids.length === 0) {
        setResetSubmitting(false);
        return;
      }
      setBatchResetting(true);
      const t = toast.loading(`Resetting ${ids.length} user(s)…`);
      try {
        const res = await fetch("/api/session/reset-users", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userIds: ids,
            reason: reason || "admin_initiated_user_session_reset_batch",
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || data.error || "Batch reset failed");
        }

        const resetCount = Number(data.resetCount) || 0;
        const failedIds = Array.isArray(data.failedIds) ? data.failedIds : [];

        if (failedIds.length > 0) {
          toast.success(
            `Reset ${resetCount}/${ids.length}. Failed: ${failedIds.length}.`,
            { id: t }
          );
        } else {
          toast.success(`Reset ${resetCount} user(s).`, { id: t });
        }

        closeResetModal();
        clearSelection();
        await loadAdminUsers();
      } catch (e) {
        console.error(e);
        toast.error(e.message || "Batch reset failed", { id: t });
      } finally {
        setBatchResetting(false);
        setResetSubmitting(false);
      }
    }
  }, [
    resetModal,
    resetReason,
    resetSubmitting,
    closeResetModal,
    loadAdminUsers,
    clearSelection,
  ]);

  const handleReset = useCallback(() => {
    setResetReason("user_initiated_session_reset");
    setResetModal({ mode: "self" });
  }, []);

  const handleResetUser = useCallback((user) => {
    if (!user?.id) return;
    setResetReason("admin_initiated_user_session_reset");
    setResetModal({ mode: "single", user });
  }, []);

  const handleResetSelected = useCallback(() => {
    const ids = Array.from(selectedUserIds || []).filter(Boolean);
    if (ids.length === 0) return;
    setResetReason("admin_initiated_user_session_reset_batch");
    setResetModal({ mode: "batch", userIds: ids, count: ids.length });
  }, [selectedUserIds]);

  const handleToggleSelectUser = useCallback((userId, checked) => {
    if (!userId) return;
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }, []);

  const handleToggleSelectAllPage = useCallback(
    (checked) => {
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        const pageIds = (adminUsers || []).map((u) => u?.id).filter(Boolean);
        if (checked) {
          for (const id of pageIds) next.add(id);
        } else {
          for (const id of pageIds) next.delete(id);
        }
        return next;
      });
    },
    [adminUsers]
  );

  const badgeVariantForRole = (role) => {
    const r = String(role || "").toUpperCase();
    if (r === "ADMIN") return "danger";
    if (r === "MANAGER") return "primary";
    if (r === "TECHNICIAN") return "success";
    return "secondary";
  };

  const badgeVariantForStatus = (statusValue) => {
    const s = String(statusValue || "").toUpperCase();
    if (s === "ACTIVE") return "success";
    if (s === "INACTIVE") return "secondary";
    if (s === "SUSPENDED" || s === "DISABLED") return "warning";
    return "secondary";
  };

  if (loading) {
    return (
      <Card className="shadow-sm border-0">
        <Card.Body className="d-flex justify-content-center py-5">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading session status…
        </Card.Body>
      </Card>
    );
  }

  const adminTotalPages = Math.max(1, Math.ceil((adminTotal || 0) / (adminLimit || 1)));
  const pageIds = (adminUsers || []).map((u) => u?.id).filter(Boolean);
  const selectedOnPageCount = pageIds.filter((id) => selectedUserIds?.has(id)).length;
  const allSelectedOnPage = pageIds.length > 0 && selectedOnPageCount === pageIds.length;
  const someSelectedOnPage = selectedOnPageCount > 0 && !allSelectedOnPage;
  const selectedCount = selectedUserIds?.size || 0;

  return (
    <div className="d-flex flex-column gap-3">
      <Alert variant="light" className="border mb-0">
        <small className="text-muted">
          If you see “already logged in on another device” on the mobile app, use
          this to clear the session lock and sign in again. This is available to
          admins too because it resets <em>your</em> session lock when you get
          stuck between portal and mobile logins.
        </small>
      </Alert>

      {isAdmin ? (
        <Card className="shadow-sm border-0">
          <Card.Header className="bg-light fw-semibold d-flex justify-content-between align-items-center gap-2 flex-wrap">
            <div>Users (admin)</div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <Form.Control
                size="sm"
                placeholder="Search username/email…"
                value={adminQ}
                onChange={(e) => setAdminQ(e.target.value)}
                style={{ minWidth: 220 }}
                disabled={adminLoading}
              />
              <Form.Select
                size="sm"
                value={adminRole}
                onChange={(e) => setAdminRole(e.target.value)}
                disabled={adminLoading}
                style={{ width: 130 }}
                aria-label="Filter by role"
              >
                <option value="TECHNICIAN">Technician</option>
                <option value="ALL">All</option>
                <option value="ADMIN">Admin</option>
                {/* <option value="MANAGER">Manager</option> */}
              </Form.Select>
              <Form.Select
                size="sm"
                value={adminLimit}
                onChange={(e) => setAdminLimit(Number(e.target.value) || 20)}
                disabled={adminLoading}
                style={{ width: 110 }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </Form.Select>
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() =>
                  loadAdminUsers({
                    page: adminPage,
                    limit: adminLimit,
                    q: adminQ,
                    role: adminRole,
                  })
                }
                disabled={adminLoading}
              >
                Refresh
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={handleResetSelected}
                disabled={adminLoading || batchResetting || selectedCount === 0}
              >
                {batchResetting ? "Resetting…" : `Reset selected${selectedCount ? ` (${selectedCount})` : ""}`}
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
              <small className="text-muted">
                Showing page <strong>{adminPage}</strong> of{" "}
                <strong>{adminTotalPages}</strong> •{" "}
                <strong>{roleCountLabel(adminRole, adminTotal)}</strong>
              </small>
              <div className="d-flex gap-2">
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() =>
                    loadAdminUsers({
                      page: Math.max(1, adminPage - 1),
                      limit: adminLimit,
                      q: adminQ,
                      role: adminRole,
                    })
                  }
                  disabled={adminLoading || adminPage <= 1}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() =>
                    loadAdminUsers({
                      page: Math.min(adminTotalPages, adminPage + 1),
                      limit: adminLimit,
                      q: adminQ,
                      role: adminRole,
                    })
                  }
                  disabled={adminLoading || adminPage >= adminTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>

            <div className="table-responsive">
              <Table size="sm" bordered hover className="mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 42 }}>
                      <Form.Check
                        type="checkbox"
                        checked={allSelectedOnPage}
                        ref={(el) => {
                          if (el && el.input) el.input.indeterminate = someSelectedOnPage;
                        }}
                        onChange={(e) => handleToggleSelectAllPage(e.target.checked)}
                        disabled={adminLoading || adminUsers.length === 0}
                        aria-label="Select page"
                      />
                    </th>
                    <th style={{ width: 90 }}>Status</th>
                    <th>User</th>
                    <th style={{ width: 110 }}>Role</th>
                    <th style={{ width: 130 }}>Mobile App/ User login</th>
                    <th style={{ width: 190 }}>Updated</th>
                    <th style={{ width: 140 }} />
                  </tr>
                </thead>
                <tbody>
                  {adminLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4">
                        <Spinner animation="border" size="sm" className="me-2" />
                        Loading users…
                      </td>
                    </tr>
                  ) : adminUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-muted">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    adminUsers.map((u) => {
                      const busy = Boolean(rowResetting[u.id]);
                      const checked = Boolean(u?.id && selectedUserIds?.has(u.id));
                      return (
                        <tr key={u.id}>
                          <td>
                            <Form.Check
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => handleToggleSelectUser(u.id, e.target.checked)}
                              disabled={adminLoading}
                              aria-label={`Select ${u.display_name || u.username || u.id}`}
                            />
                          </td>
                          <td>
                            {u.status ? (
                              <Badge bg={badgeVariantForStatus(u.status)}>{u.status}</Badge>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td>
                            <div className="fw-semibold">{u.display_name || u.username || "—"}</div>
                            <div className="text-muted small" title={u.id}>
                              {u.username ? (
                                <span className="me-2">{u.username}</span>
                              ) : null}
                              <span>{u.id}</span>
                            </div>
                          </td>
                          <td>
                            {u.role ? (
                              <Badge bg={badgeVariantForRole(u.role)}>{u.role}</Badge>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td>
                            {u.is_logged_in ? (
                              <PortalLoginBadge value={true} />
                            ) : u.is_logged_in === false ? (
                              <PortalLoginBadge value={false} />
                            ) : (
                              <PortalLoginBadge value={null} />
                            )}
                          </td>
                          <td>{formatTs(u.updated_at)}</td>
                          <td className="text-end">
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleResetUser(u)}
                              disabled={busy || adminLoading}
                            >
                              {busy ? "Resetting…" : "Reset"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>
      ) : null}

      <SessionResetConfirmModal
        show={Boolean(resetModal)}
        onHide={closeResetModal}
        mode={resetModal?.mode || "single"}
        user={resetModal?.user}
        userIds={resetModal?.userIds}
        count={resetModal?.count}
        reason={resetReason}
        onReasonChange={setResetReason}
        onConfirm={() => void confirmSessionReset()}
        submitting={resetSubmitting}
      />
    </div>
  );
};

export default SessionDevicesPanel;
