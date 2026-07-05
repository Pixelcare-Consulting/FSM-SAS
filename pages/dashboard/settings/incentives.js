import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Col,
  Collapse,
  Form,
  OverlayTrigger,
  Modal,
  Pagination,
  Row,
  Spinner,
  Table,
  Tooltip,
} from "react-bootstrap";
import Link from "next/link";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { clientAuditLog, buildAuditChanges } from "../../../utils/clientAuditLog";
import {
  collectUdtRowsForWorkerMonth,
  duplicateUdtODataKeysForMonth,
  findSummaryRowForSapTech,
  pickCanonicalUdtRowForMonth,
  pickUdtRowForPush,
  parseSapPeriodLabel,
  sapTechFromUdtAndSp,
  summaryRowWorkingHrs,
  sumUdtWorkingHrsForRows,
  udtRowCode,
  udtRowODataKey,
  udtRowPeriodLabel,
  udtTotalsFromRows,
} from "../../../lib/sap/jobIncentiveMatch";
import { formatFsmPeriodLabel } from "../../../lib/supabase/technicianHours";
import layoutStyles from "../settings.module.css";

const PAGE_SIZE = 10;
const PUSH_ALL_ELIGIBLE_PREVIEW = 10;
const PUSH_ALL_SKIPPED_PREVIEW = 8;

/** Set true to restore the raw SAP incentive UDT panel and table. */
const SHOW_SAP_UDT_PANEL = false;

function resolvePushPayload(worker, udtRows, laborYear, laborMonth, fsmLaborByTech) {
  const { row, hits, monthRows } = pickUdtRowForPush(worker, udtRows, laborYear, laborMonth);
  const odataKey = udtRowODataKey(row);
  const displayKey = udtRowCode(row);
  const code = odataKey || displayKey;
  const udtName = row?.Name ?? row?.name ?? null;

  if (!row || !code) {
    const reason =
      hits.length === 0
        ? "No matching SAP UDT row"
        : `No SAP incentive row for ${laborMonth}/${laborYear}`;
    return { ok: false, reason, hits };
  }

  const zeroCodes = duplicateUdtODataKeysForMonth(monthRows, row);
  const hrsRaw = fsmLaborByTech[worker.id];
  const workingHrs = Number(hrsRaw);
  const workingHrsFinal = Number.isFinite(workingHrs) ? Math.round(workingHrs * 100) / 100 : 0;

  return {
    ok: true,
    row,
    code,
    odataKey,
    name: udtName != null ? String(udtName).trim() : "",
    workingHrs: workingHrsFinal,
    zeroCodes,
    monthRows,
    displayKey,
    hits,
  };
}

async function postFsmHoursToSap({
  code,
  odataKey,
  name,
  year,
  month,
  workingHrs,
  zeroCodes,
  technicianId,
  technicianName,
  sapTechCode,
  bulkBatchId,
  bulkIndex,
  bulkTotal,
}) {
  const response = await fetch("/api/sap/incentive-udt-working-hrs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      code: odataKey || code,
      name: name || undefined,
      year,
      month,
      workingHrs,
      zeroCodes: zeroCodes || [],
      technicianId,
      technicianName,
      sapTechCode,
      bulkBatchId,
      bulkIndex,
      bulkTotal,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "SAP update failed");
  }
  return payload;
}

/** Calendar months 1–3, 4–6, … for quarterly UDT roll-up. */
function monthsInQuarter(quarter) {
  const q = Math.max(1, Math.min(4, Number(quarter) || 1));
  const start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

const formatSapValue = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
};

const formatSapAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function SectionLabel({ children, isFirst }) {
  return (
    <h3
      className={`h6 fw-semibold text-body mb-3 pb-2 border-bottom ${isFirst ? "mt-0" : "mt-4 pt-1 border-opacity-50"}`}
    >
      {children}
    </h3>
  );
}

const JobIncentiveSettings = ({ embedded = false }) => {
  const router = useRouter();
  const [workers, setWorkers] = useState([]);
  const [sapTechDrafts, setSapTechDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingSapId, setSavingSapId] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sapRows, setSapRows] = useState([]);
  const [sapLoading, setSapLoading] = useState(false);
  const [sapError, setSapError] = useState(null);
  const [udtTableOpen, setUdtTableOpen] = useState(false);
  const [fetchingFromSap, setFetchingFromSap] = useState(false);
  const [fsmLaborByTech, setFsmLaborByTech] = useState({});
  const [fsmLaborLoading, setFsmLaborLoading] = useState(false);
  const [fsmStaleWarning, setFsmStaleWarning] = useState(null);
  const [pushingSapHrsId, setPushingSapHrsId] = useState(null);
  const [pushSapModal, setPushSapModal] = useState(null);
  const [pushAllModal, setPushAllModal] = useState(null);
  const [pushingAllSap, setPushingAllSap] = useState(false);
  const [pushAllExpandEligible, setPushAllExpandEligible] = useState(false);
  const [pushAllExpandSkipped, setPushAllExpandSkipped] = useState(false);
  const udtAutoLoadedRef = useRef(false);

  const now = new Date();
  const [filterType, setFilterType] = useState("M");
  const [spYear, setSpYear] = useState(now.getFullYear());
  const [spQuarter, setSpQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [spMonth, setSpMonth] = useState(now.getMonth() + 1);

  const fsmPeriodLabel = useMemo(
    () => formatFsmPeriodLabel(filterType, spYear, spMonth, spQuarter),
    [filterType, spYear, spMonth, spQuarter]
  );

  useEffect(() => {
    if (!embedded && router.isReady) {
      router.replace("/dashboard/settings#incentives");
    }
  }, [embedded, router]);

  const loadWorkers = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return [];
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("technicians")
        .select(
          "id, full_name, email, status, sap_tech_code, sap_udt_total_income, sap_udt_total_working_hrs, sap_udt_snapshot_label, sap_udt_snapshot_at, user:users!technicians_user_id_fkey(username)"
        )
        .is("deleted_at", null)
        .order("full_name", { ascending: true, nullsFirst: false });

      if (queryError) throw queryError;

      const rows = data || [];
      setWorkers(rows);
      setSapTechDrafts(
        rows.reduce((drafts, worker) => {
          drafts[worker.id] = worker.sap_tech_code != null ? String(worker.sap_tech_code) : "";
          return drafts;
        }, {})
      );
      return rows;
    } catch (err) {
      console.error("Error loading incentive settings:", err);
      setError(err?.message || "Failed to load incentive settings.");
      setWorkers([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSapIncentives = useCallback(async () => {
    setSapLoading(true);
    setSapError(null);

    try {
      const response = await fetch("/api/sap/incentives", { credentials: "include" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.success === false) {
        setSapRows([]);
        setSapError(payload?.error || "Failed to load SAP incentive records.");
        return [];
      }

      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      setSapRows(rows);
      return rows;
    } catch (err) {
      console.error("Error loading SAP incentive records:", err);
      setSapRows([]);
      setSapError(err?.message || "Failed to load SAP incentive records.");
      return [];
    } finally {
      setSapLoading(false);
    }
  }, []);

  const loadFsmHours = useCallback(async () => {
    setFsmLaborLoading(true);
    try {
      const params = new URLSearchParams({
        filterType,
        year: String(spYear),
        month: String(spMonth),
        quarter: String(spQuarter),
      });
      const response = await fetch(`/api/settings/fsm-labor-hours?${params}`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || "Failed to load portal (FSM) labor hours.");
      }
      setFsmLaborByTech(payload?.hoursByTechnician || {});
      setFsmStaleWarning(payload?.staleWarning || null);
    } catch (e) {
      console.error(e);
      setFsmLaborByTech({});
      setFsmStaleWarning(null);
      toast.error(e?.message || "Failed to load portal (FSM) labor hours.");
    } finally {
      setFsmLaborLoading(false);
    }
  }, [filterType, spYear, spMonth, spQuarter]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  /** Incentive UDT: load once when this panel mounts. */
  useEffect(() => {
    if (udtAutoLoadedRef.current) return;
    udtAutoLoadedRef.current = true;
    void loadSapIncentives();
  }, [loadSapIncentives]);

  useEffect(() => {
    void loadFsmHours();
  }, [loadFsmHours]);

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workers;

    return workers.filter((worker) => {
      const haystack = [
        worker.full_name,
        worker.email,
        worker.user?.username,
        worker.status,
        worker.sap_tech_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [workers, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredWorkers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedWorkers = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredWorkers.slice(start, start + PAGE_SIZE);
  }, [filteredWorkers, safePage]);

  const snapshotCount = useMemo(
    () => workers.filter((w) => w.sap_udt_snapshot_at != null).length,
    [workers]
  );

  /** SAP UDT income / U_WorkingHrs for the selected labor period (not stored snapshots). */
  const sapUdtForPeriod = useMemo(() => {
    const hrsByTech = {};
    const incomeByTech = {};
    const hasRowByTech = {};
    const months = filterType === "Q" ? monthsInQuarter(spQuarter) : [spMonth];
    const periodLabel = fsmPeriodLabel || (filterType === "Q" ? `Q${spQuarter} ${spYear}` : `${spMonth} ${spYear}`);

    if (!sapRows.length) {
      return { hrsByTech, incomeByTech, hasRowByTech, periodLabel };
    }

    for (const worker of workers) {
      let income = 0;
      let workingHrs = 0;
      let matched = false;

      for (const m of months) {
        const monthRows = collectUdtRowsForWorkerMonth(worker, sapRows, spYear, m);
        if (!monthRows.length) continue;
        matched = true;
        const totals = udtTotalsFromRows(monthRows);
        income += totals.income;
        workingHrs += totals.workingHrs;
      }

      if (matched) {
        hasRowByTech[worker.id] = true;
        incomeByTech[worker.id] = income;
        hrsByTech[worker.id] = Math.round(workingHrs * 100) / 100;
      }
    }

    return { hrsByTech, incomeByTech, hasRowByTech, periodLabel };
  }, [workers, sapRows, filterType, spYear, spMonth, spQuarter, fsmPeriodLabel]);

  const fetchFromSapAndSaveWorkers = useCallback(
    async (udtRowsOverride, workersOverride) => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        toast.error("Supabase is not configured.");
        return;
      }
      const workerList = workersOverride ?? workers;
      if (!workerList.length) {
        toast.error("No workers loaded.");
        return;
      }
      if (filterType !== "M") {
        toast.error("Switch roll-up to Monthly to sync SAP UDT for one calendar month.");
        return;
      }

      setFetchingFromSap(true);
      try {
        let udtRows = udtRowsOverride ?? sapRows;
        if (!udtRows.length) {
          const tid = toast.loading("Loading UDT from SAP…");
          udtRows = await loadSapIncentives();
          toast.dismiss(tid);
          if (!udtRows.length) {
            toast.error("No SAP UDT rows returned. Log in to SAP or use Refresh all.");
            return;
          }
        }

        let applied = 0;
        let skipped = 0;
        for (const worker of workerList) {
          const monthRows = collectUdtRowsForWorkerMonth(worker, udtRows, spYear, spMonth);
          const udtRow = pickCanonicalUdtRowForMonth(monthRows, worker);
          const tech = sapTechFromUdtAndSp(udtRow, null);
          const totals = monthRows.length ? udtTotalsFromRows(monthRows) : null;

          const patch = {};
          if (tech) patch.sap_tech_code = tech;
          if (totals) {
            patch.sap_udt_total_income = totals.income;
            patch.sap_udt_total_working_hrs = totals.workingHrs;
            patch.sap_udt_snapshot_label = totals.periodLabel;
            patch.sap_udt_snapshot_at = new Date().toISOString();
          }
          if (Object.keys(patch).length === 0) {
            skipped += 1;
            continue;
          }

          patch.updated_at = new Date().toISOString();
          const { error: upErr } = await supabase.from("technicians").update(patch).eq("id", worker.id);
          if (upErr) throw upErr;
          applied += 1;
        }

        if (applied === 0) {
          toast.error(
            `No updates applied for ${spMonth}/${spYear}. Check UDT names and that incentive rows exist for that month.`
          );
        } else {
          toast.success(
            skipped > 0
              ? `Updated ${applied} worker(s) from SAP (tech code, income & hours where UDT rows matched). ${skipped} skipped.`
              : `Updated ${applied} worker(s) from SAP (tech code, income & hours).`
          );
          void clientAuditLog({
            action: "WORKER_SAP_SNAPSHOT_SYNC",
            category: "worker",
            entityType: "worker_snapshot",
            description: `Synced ${applied} worker(s) from SAP UDT for ${spMonth}/${spYear}`,
            details: { applied, skipped, year: spYear, month: spMonth },
            status: "success",
          });
          await loadWorkers();
        }
      } catch (e) {
        console.error(e);
        void clientAuditLog({
          action: "WORKER_SAP_SNAPSHOT_SYNC",
          category: "worker",
          entityType: "worker_snapshot",
          description: `SAP worker snapshot sync failed: ${e?.message || "unknown"}`,
          details: { year: spYear, month: spMonth, error: e?.message || String(e) },
          status: "failure",
        });
        toast.error(e?.message || "Failed to sync from SAP.");
      } finally {
        setFetchingFromSap(false);
      }
    },
    [workers, sapRows, loadSapIncentives, loadWorkers, filterType, spYear, spMonth]
  );

  const refreshAll = useCallback(async () => {
    const udtRows = await loadSapIncentives();
    const [loadedWorkers] = await Promise.all([loadWorkers(), loadFsmHours()]);
    if (filterType === "M") {
      await fetchFromSapAndSaveWorkers(udtRows, loadedWorkers);
    } else {
      toast("Monthly roll-up required to sync worker snapshots from SAP.", { icon: "ℹ️" });
    }
  }, [loadWorkers, loadSapIncentives, loadFsmHours, fetchFromSapAndSaveWorkers, filterType]);

  const closePushSapModal = useCallback(() => {
    setPushSapModal(null);
  }, []);

  const loadSapAddonReportContext = useCallback(async (sapTech, laborYear, laborMonth) => {
    const tech = String(sapTech || "").trim();
    if (!tech) return { addonHrs: null, invoiceLineCount: null };

    const base = new URLSearchParams({
      filterType: "M",
      year: String(laborYear),
      month: String(laborMonth),
      quarter: "1",
    });

    let addonHrs = null;
    let invoiceLineCount = null;

    try {
      const summaryRes = await fetch(`/api/sap/job-incentive-summary?${base}`, { credentials: "include" });
      const summaryPayload = await summaryRes.json().catch(() => ({}));
      if (summaryRes.ok && summaryPayload?.success !== false) {
        const spRow = findSummaryRowForSapTech(summaryPayload?.rows, tech);
        addonHrs = summaryRowWorkingHrs(spRow);
      }
    } catch (e) {
      console.warn("SAP job-incentive-summary:", e);
    }

    try {
      const detailParams = new URLSearchParams(base);
      detailParams.set("tech", tech);
      detailParams.set("docType", "Invoice");
      const detailRes = await fetch(`/api/sap/job-incentive-detail?${detailParams}`, {
        credentials: "include",
      });
      const detailPayload = await detailRes.json().catch(() => ({}));
      if (detailRes.ok && detailPayload?.success !== false) {
        invoiceLineCount = Array.isArray(detailPayload?.rows) ? detailPayload.rows.length : 0;
      }
    } catch (e) {
      console.warn("SAP job-incentive-detail:", e);
    }

    return { addonHrs, invoiceLineCount };
  }, []);

  const preparePushSapModal = useCallback(
    async (worker, periodOverride) => {
      const laborYear = periodOverride?.year ?? spYear;
      const laborMonth = periodOverride?.month ?? spMonth;

      if (filterType !== "M") {
        setPushSapModal({
          worker,
          status: "blocked",
          message:
            "Switch labor period roll-up to Monthly to push hours (one SAP UDT row per calendar month).",
        });
        return;
      }

      setPushSapModal({ worker, status: "loading", laborYear, laborMonth });

      try {
        let udtRows = sapRows;
        if (!udtRows.length) {
          udtRows = await loadSapIncentives();
        }
        if (!udtRows.length) {
          setPushSapModal({
            worker,
            status: "error",
            laborYear,
            laborMonth,
            message: "No SAP UDT rows. Sign in to SAP and use Refresh all.",
          });
          return;
        }

        const pushPayload = resolvePushPayload(worker, udtRows, laborYear, laborMonth, fsmLaborByTech);
        const { row, matchKind, hits, monthRows } = pickUdtRowForPush(
          worker,
          udtRows,
          laborYear,
          laborMonth
        );
        const odataKey = udtRowODataKey(row);
        const displayKey = udtRowCode(row);
        const code = odataKey || displayKey;
        const udtName = row?.Name ?? row?.name ?? null;
        const zeroCodes = row ? duplicateUdtODataKeysForMonth(monthRows, row) : [];
        const sapMonthHrsSum = sumUdtWorkingHrsForRows(monthRows);
        const workingHrsFinal = pushPayload.ok ? pushPayload.workingHrs : 0;

        if (!pushPayload.ok) {
          const snapshotPeriod = parseSapPeriodLabel(worker.sap_udt_snapshot_label);
          const suggestedPeriods = [];
          const seen = new Set();
          for (const h of hits) {
            const label = udtRowPeriodLabel(h);
            if (!label || seen.has(label)) continue;
            seen.add(label);
            const p = parseSapPeriodLabel(label);
            if (p) suggestedPeriods.push({ ...p, label, row: h });
          }
          if (snapshotPeriod) {
            const snapLabel = worker.sap_udt_snapshot_label;
            if (!suggestedPeriods.some((p) => p.month === snapshotPeriod.month && p.year === snapshotPeriod.year)) {
              suggestedPeriods.unshift({
                ...snapshotPeriod,
                label: snapLabel,
                fromSnapshot: true,
              });
            }
          }

          setPushSapModal({
            worker,
            status: "no-row",
            laborYear,
            laborMonth,
            hits,
            suggestedPeriods,
            message:
              hits.length === 0
                ? "No SAP UDT row matches this worker by name or SAP tech code. Check U_TechName in SAP, or set SAP tech code to match Code/Name in SAP."
                : `No SAP incentive row for ${laborMonth}/${laborYear}. Matched ${hits.length} row(s) for this worker in other months — align labor period Month/Year with SAP.`,
          });
          return;
        }

        if (periodOverride) {
          setSpYear(laborYear);
          setSpMonth(laborMonth);
        }

        const sapTech =
          String(worker.sap_tech_code || "").trim() ||
          sapTechFromUdtAndSp(row, null) ||
          String(row.U_TechName ?? row.u_TechName ?? "").trim();
        const { addonHrs, invoiceLineCount } = await loadSapAddonReportContext(
          sapTech,
          laborYear,
          laborMonth
        );

        setPushSapModal({
          worker,
          status: "confirm",
          laborYear,
          laborMonth,
          udtRow: row,
          matchKind,
          code,
          odataKey,
          udtName: udtName != null ? String(udtName).trim() : "",
          zeroCodes,
          monthRowCount: monthRows.length,
          sapMonthHrsSum,
          sapAddonHrs: addonHrs,
          sapInvoiceLineCount: invoiceLineCount,
          workingHrs: workingHrsFinal,
          currentSapHrs: row.U_WorkingHrs ?? row.U_WorkingHs,
          periodLabel: udtRowPeriodLabel(row),
          sapTechName: row.U_TechName ?? row.u_TechName,
        });
      } catch (err) {
        console.error(err);
        setPushSapModal({
          worker,
          status: "error",
          laborYear,
          laborMonth,
          message: err?.message || "Failed to prepare push to SAP.",
        });
      }
    },
    [filterType, spYear, spMonth, sapRows, loadSapIncentives, fsmLaborByTech, loadSapAddonReportContext]
  );

  const confirmPushFsmHoursToSap = async () => {
    const modal = pushSapModal;
    if (!modal || modal.status !== "confirm" || !modal.worker || !modal.code) return;

    setPushingSapHrsId(modal.worker.id);
    setPushSapModal((prev) => (prev ? { ...prev, status: "pushing" } : prev));

    try {
      await postFsmHoursToSap({
        code: modal.odataKey || modal.code,
        odataKey: modal.odataKey,
        name: modal.udtName || undefined,
        year: modal.laborYear,
        month: modal.laborMonth,
        workingHrs: modal.workingHrs,
        zeroCodes: modal.zeroCodes || [],
        technicianId: modal.worker?.id,
        technicianName: modal.worker?.full_name || modal.worker?.email,
        sapTechCode: modal.worker?.sap_tech_code,
      });
      setPushSapModal((prev) =>
        prev
          ? {
              ...prev,
              status: "success",
              message: `SAP U_WorkingHrs set to ${modal.workingHrs} on row ${modal.code} (${modal.laborMonth}/${modal.laborYear})${
                modal.zeroCodes?.length
                  ? `; cleared ${modal.zeroCodes.length} duplicate row(s) so the addon total matches FSM.`
                  : "."
              }`,
            }
          : prev
      );
      toast.success("Hours pushed to SAP.");
      void loadSapIncentives();
    } catch (err) {
      console.error(err);
      setPushSapModal((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              message: err?.message || "Failed to push hours to SAP.",
            }
          : prev
      );
    } finally {
      setPushingSapHrsId(null);
    }
  };

  const closePushAllModal = useCallback(() => {
    if (pushingAllSap) return;
    setPushAllModal(null);
    setPushAllExpandEligible(false);
    setPushAllExpandSkipped(false);
  }, [pushingAllSap]);

  const openPushAllModal = useCallback(async () => {
    if (filterType !== "M") {
      toast.error("Switch roll-up to Monthly to push hours (one SAP UDT row per calendar month).");
      return;
    }
    if (sapError) {
      toast.error(
        sapError === "SAP session required"
          ? "Sign in to SAP Business One in this browser, then try again."
          : sapError
      );
      return;
    }
    if (!filteredWorkers.length) {
      toast.error("No workers match the current search.");
      return;
    }

    setPushAllModal({ status: "loading" });
    setPushAllExpandEligible(false);
    setPushAllExpandSkipped(false);
    try {
      let udtRows = sapRows;
      if (!udtRows.length) {
        udtRows = await loadSapIncentives();
      }
      if (!udtRows.length) {
        toast.error("No SAP UDT rows. Sign in to SAP and use Refresh all.");
        setPushAllModal(null);
        return;
      }

      const eligible = [];
      const skipped = [];
      for (const worker of filteredWorkers) {
        const payload = resolvePushPayload(worker, udtRows, spYear, spMonth, fsmLaborByTech);
        if (payload.ok) {
          eligible.push({ worker, ...payload });
        } else {
          skipped.push({
            worker,
            name: worker.full_name || worker.email || "Worker",
            reason: payload.reason,
          });
        }
      }

      setPushAllModal({
        status: "preview",
        eligible,
        skipped,
        laborYear: spYear,
        laborMonth: spMonth,
      });
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to prepare bulk push.");
      setPushAllModal(null);
    }
  }, [
    filterType,
    sapError,
    filteredWorkers,
    sapRows,
    loadSapIncentives,
    spYear,
    spMonth,
    fsmLaborByTech,
  ]);

  const confirmPushAllToSap = async () => {
    const modal = pushAllModal;
    if (!modal || modal.status !== "preview" || !modal.eligible?.length) return;

    setPushingAllSap(true);
    setPushAllModal((prev) =>
      prev
        ? { ...prev, status: "pushing", progress: 0, total: prev.eligible?.length ?? 0 }
        : prev
    );

    let pushed = 0;
    const failed = [];
    const bulkBatchId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `bulk-${Date.now()}`;
    const bulkTotal = modal.eligible.length;

    void clientAuditLog({
      action: "SAP_UDT_HOURS_PUSH",
      category: "sap",
      entityType: "udt_push",
      entityLabel: "Bulk SAP hours push",
      description: "SAP UDT hours push started",
      details: {
        phase: "started",
        bulkBatchId,
        bulkTotal,
        laborYear: modal.laborYear,
        laborMonth: modal.laborMonth,
      },
      status: "success",
    });

    for (let i = 0; i < modal.eligible.length; i += 1) {
      const item = modal.eligible[i];
      setPushAllModal((prev) => (prev ? { ...prev, progress: i + 1 } : prev));
      try {
        await postFsmHoursToSap({
          code: item.code,
          odataKey: item.odataKey,
          name: item.name || undefined,
          year: modal.laborYear,
          month: modal.laborMonth,
          workingHrs: item.workingHrs,
          zeroCodes: item.zeroCodes || [],
          technicianId: item.worker?.id,
          technicianName: item.worker?.full_name || item.worker?.email,
          sapTechCode: item.worker?.sap_tech_code,
          bulkBatchId,
          bulkIndex: i + 1,
          bulkTotal,
        });
        pushed += 1;
      } catch (err) {
        failed.push({
          name: item.worker?.full_name || item.worker?.email || "Worker",
          error: err?.message || "SAP update failed",
        });
      }
    }

    setPushingAllSap(false);
    setPushAllModal({
      status: "done",
      laborYear: modal.laborYear,
      laborMonth: modal.laborMonth,
      pushed,
      failed,
      skippedCount: modal.skipped?.length ?? 0,
    });

    const skippedCount = modal.skipped?.length ?? 0;
    void clientAuditLog({
      action: "SAP_UDT_HOURS_PUSH",
      category: "sap",
      entityType: "udt_push",
      entityLabel: "Bulk SAP hours push",
      description: "SAP UDT hours push completed",
      details: {
        phase: "completed",
        bulkBatchId,
        pushed,
        failed: failed.length,
        skipped: skippedCount,
        laborYear: modal.laborYear,
        laborMonth: modal.laborMonth,
      },
      status: failed.length > 0 ? "warning" : "success",
    });

    if (pushed > 0) {
      toast.success(`Pushed ${pushed} worker(s) to SAP.`);
    }
    if (failed.length > 0) {
      toast.error(`${failed.length} worker(s) failed to push.`);
    }
    if (pushed === 0 && failed.length === 0) {
      toast.error("No workers were pushed.");
    }
    if (skippedCount > 0) {
      toast(`${skippedCount} worker(s) skipped (no UDT match).`, { icon: "ℹ️" });
    }

    void loadSapIncentives();
  };

  const saveSapTech = async (worker) => {
    const code = (sapTechDrafts[worker.id] ?? "").trim();
    const beforeCode = worker.sap_tech_code ?? null;
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }

    setSavingSapId(worker.id);
    try {
      const { error: updateError } = await supabase
        .from("technicians")
        .update({
          sap_tech_code: code || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", worker.id);

      if (updateError) throw updateError;

      setWorkers((prev) =>
        prev.map((item) => (item.id === worker.id ? { ...item, sap_tech_code: code || null } : item))
      );
      void clientAuditLog({
        action: "WORKER_UPDATE",
        category: "worker",
        entityType: "technician",
        entityId: worker.id,
        entityLabel: worker.full_name || worker.email || worker.id,
        description: "SAP technician code updated",
        changes: buildAuditChanges(
          { sap_tech_code: beforeCode },
          { sap_tech_code: code || null }
        ),
        details: { area: "sap_tech_code" },
        status: "success",
      });
      toast.success("SAP technician ID saved.");
    } catch (err) {
      console.error("Error saving SAP technician ID:", err);
      void clientAuditLog({
        action: "WORKER_UPDATE",
        category: "worker",
        entityType: "technician",
        entityId: worker.id,
        entityLabel: worker.full_name || worker.email || worker.id,
        description: `SAP technician code save failed: ${err?.message || "unknown"}`,
        details: { area: "sap_tech_code", error: err?.message || String(err) },
        status: "failure",
      });
      toast.error(err?.message || "Failed to save SAP technician ID.");
    } finally {
      setSavingSapId(null);
    }
  };

  const content = (
    <>
      {!embedded && (
        <div className="border-bottom pb-4 mb-4 d-md-flex align-items-center justify-content-between">
          <div className="mb-3 mb-md-0">
            <h1 className="mb-1 h2 font-weight-bold">Job Incentive Settings</h1>
            <Breadcrumb>
              <Breadcrumb.Item linkAs={Link} href="/dashboard">
                Dashboard
              </Breadcrumb.Item>
              <Breadcrumb.Item linkAs={Link} href="/dashboard/settings">
                Settings
              </Breadcrumb.Item>
              <Breadcrumb.Item active>Job Incentives</Breadcrumb.Item>
            </Breadcrumb>
            <div className="small mt-2">
              <a href="/job-incentives/FSM_SAP_JobIncentives_Mapping.pdf" target="_blank" rel="noopener noreferrer">
                FSM ↔ SAP Job Incentives mapping (PDF)
              </a>
            </div>
          </div>
          <Button variant="outline-primary" onClick={loadWorkers} disabled={loading}>
            Refresh
          </Button>
        </div>
      )}

      {error && <Alert variant="danger">{error}</Alert>}
      {fsmStaleWarning && (
        <Alert variant="warning" className="py-2 small">
          {fsmStaleWarning}
        </Alert>
      )}

      <Card className="border rounded-4 overflow-hidden shadow-sm">
        <Card.Header className="bg-white border-bottom py-3 px-3 px-sm-4">
          <div className="fw-semibold text-body">Technicians &amp; SAP UDT</div>
        </Card.Header>
        <Card.Body className="px-3 px-sm-4 pt-3 pb-2">
          <SectionLabel isFirst>Overview</SectionLabel>
                <Row className="g-3 mb-4">
                  <Col md={4}>
                    <Card className="h-100 border rounded-3 shadow-sm">
                      <Card.Body>
                        <div className="text-muted small mb-1">Technicians</div>
                        <h3 className="mb-0">{workers.length}</h3>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={4}>
                    <Card className="h-100 border rounded-3 shadow-sm">
                      <Card.Body>
                        <div className="text-muted small mb-1">SAP UDT synced</div>
                        <h3 className="mb-0">{snapshotCount}</h3>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={4}>
                    <Card className="h-100 border rounded-3 shadow-sm">
                      <Card.Body>
                        <div className="text-muted small mb-1">Income / hours</div>
                        <h3 className="mb-0" style={{ fontSize: 20 }}>
                          From SAP add-on
                        </h3>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                <Row className="g-3 mb-3 align-items-end flex-wrap">
                  <Col xs={6} md="auto">
                    <Form.Group>
                      <Form.Label className="small">Roll-up</Form.Label>
                      <Form.Select
                        value={filterType}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFilterType(v);
                          if (v === "Q") {
                            setSpQuarter(Math.floor(((Number(spMonth) || 1) - 1) / 3) + 1);
                          }
                        }}
                        size="sm"
                        className="rounded-3"
                      >
                        <option value="M">Monthly — one calendar month</option>
                        <option value="Q">Quarterly — full quarter</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col xs={6} md="auto">
                    <Form.Group>
                      <Form.Label className="small">Year</Form.Label>
                      <Form.Control
                        type="number"
                        size="sm"
                        className="rounded-3"
                        value={spYear}
                        onChange={(e) => setSpYear(parseInt(e.target.value, 10) || spYear)}
                        style={{ width: 88 }}
                      />
                    </Form.Group>
                  </Col>
                  {filterType === "Q" ? (
                    <Col xs={6} md="auto">
                      <Form.Group>
                        <Form.Label className="small">Quarter</Form.Label>
                        <Form.Select
                          value={spQuarter}
                          onChange={(e) => setSpQuarter(parseInt(e.target.value, 10))}
                          size="sm"
                          className="rounded-3"
                        >
                          {[1, 2, 3, 4].map((q) => (
                            <option key={q} value={q}>
                              Q{q}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  ) : (
                    <Col xs={6} md="auto">
                      <Form.Group>
                        <Form.Label className="small">Month</Form.Label>
                        <Form.Select
                          value={spMonth}
                          onChange={(e) => setSpMonth(parseInt(e.target.value, 10))}
                          size="sm"
                          className="rounded-3"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  )}
                  {fsmLaborLoading && (
                    <Col xs={12} md="auto" className="d-flex align-items-center small text-muted">
                      <Spinner animation="border" size="sm" className="me-2" />
                      Loading FSM hours…
                    </Col>
                  )}
                  {/* <Col xs={12} className="small text-muted">
                    Labor period: {fsmPeriodLabel} — matches worker Assignments month filter when set to the same
                    year/month.
                  </Col> */}
                </Row>

                {/* <SectionLabel>Portal workers</SectionLabel> */}
                {sapError && (
                  <Alert variant="warning" className="mb-3 py-2 small">
                    {sapError === "SAP session required"
                      ? "Sign in to SAP Business One in this browser, then try again."
                      : sapError}
                  </Alert>
                )}
                {fsmStaleWarning && (
                  <Alert variant="info" className="mb-3 py-2 small">
                    {fsmStaleWarning}
                  </Alert>
                )}
                <Row className="g-3 mb-3 align-items-end">
                  <Col xs={12} md className="min-w-0">
                    <Form.Group>
                      <Form.Label className="small">Search workers</Form.Label>
                      <Form.Control
                        type="search"
                        className="rounded-3"
                        placeholder="Name, email, or SAP code…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md="auto" className="d-flex align-items-end gap-2 flex-wrap">
                    <OverlayTrigger
                      placement="top"
                      overlay={
                        <Tooltip id="refresh-all-tooltip" className="text-start">
                          <div style={{ maxWidth: 300 }}>
                            Reloads workers, SAP UDT, FSM hours, and syncs tech codes from SAP (monthly
                            only).
                          </div>
                        </Tooltip>
                      }
                    >
                      <span className="d-inline-block">
                        <Button
                          variant="outline-primary"
                          className="rounded-3"
                          onClick={() => void refreshAll()}
                          disabled={loading || sapLoading || fetchingFromSap || pushingAllSap}
                        >
                          {loading || sapLoading || fetchingFromSap ? "Refreshing…" : "Refresh all"}
                        </Button>
                      </span>
                    </OverlayTrigger>
                    <Button
                      variant="outline-success"
                      className="rounded-3"
                      onClick={() => void openPushAllModal()}
                      disabled={
                        filterType !== "M" ||
                        loading ||
                        sapLoading ||
                        fsmLaborLoading ||
                        pushingAllSap ||
                        pushingSapHrsId != null ||
                        filteredWorkers.length === 0
                      }
                      title={
                        filterType !== "M"
                          ? "Switch roll-up to Monthly to push hours for one SAP UDT month."
                          : `Push FSM hours to SAP for all ${filteredWorkers.length} worker(s) matching search.`
                      }
                    >
                      {pushingAllSap ? "Pushing all…" : "Push all to SAP"}
                    </Button>
                  </Col>
                </Row>

                <div className="rounded-3 border overflow-hidden mb-4">
                  <Table hover className="mb-0 align-middle">
                    <thead className="bg-light">
                      <tr>
                        <th className="px-4 py-3">Worker</th>
                        <th className="py-3">Status</th>
                        <th className="py-3" style={{ minWidth: 140 }}>
                          <span className="d-inline-flex align-items-center gap-1">
                            SAP tech code
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id="sap-tech-code-tooltip" className="text-start">
                                  <div style={{ maxWidth: 280 }}>
                                    Text ID (letters + digits), same value SAP uses on the job as{" "}
                                    <code>U_JobTech</code> You can find these on your SAP Business One Job Incentive Add-on. 
                                  </div>
                                </Tooltip>
                              }
                            >
                              <span
                                className="d-inline-flex align-items-center justify-content-center rounded-circle border text-secondary user-select-none"
                                style={{ width: 18, height: 18, fontSize: 11, lineHeight: 1, cursor: "help" }}
                                tabIndex={0}
                                role="button"
                                aria-label="What is SAP tech code?"
                              >
                                ?
                              </span>
                            </OverlayTrigger>
                          </span>
                        </th>
                        <th className="py-3 text-end">SAP income</th>
                        <th className="py-3 text-end">
                          <span className="d-inline-flex align-items-center justify-content-end gap-1 w-100">
                            Total hrs (SAP)
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id="sap-hours-tooltip" className="text-start">
                                  <div style={{ maxWidth: 300 }}>
                                    <code>U_WorkingHrs</code> from SAP incentive UDT rows {" "}
                                     Matched by{" "}
                                    <code>sap_tech_code</code> first, then technician name. Refreshed from live UDT
                                    when you use <strong>Refresh all</strong>.
                                  </div>
                                </Tooltip>
                              }
                            >
                              <span
                                className="d-inline-flex align-items-center justify-content-center rounded-circle border text-secondary user-select-none flex-shrink-0"
                                style={{ width: 18, height: 18, fontSize: 11, lineHeight: 1, cursor: "help" }}
                                tabIndex={0}
                                role="button"
                                aria-label="About total SAP hours"
                              >
                                ?
                              </span>
                            </OverlayTrigger>
                          </span>
                        </th>
                        <th className="py-3 text-end">
                          <span className="d-inline-flex align-items-center justify-content-end gap-1 w-100">
                            Total hrs (FSM)
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id="fsm-hours-tooltip" className="text-start">
                                  <div style={{ maxWidth: 320 }}>
                                    Sum of <code>technician_hours.labor_hours</code> where{" "}
                                    <code>period_anchor_at</code> This is a
                                    monthly roll-up — the worker Assignments tab all-time total can be higher. 
                                  </div>
                                </Tooltip>
                              }
                            >
                              <span
                                className="d-inline-flex align-items-center justify-content-center rounded-circle border text-secondary user-select-none flex-shrink-0"
                                style={{ width: 18, height: 18, fontSize: 11, lineHeight: 1, cursor: "help" }}
                                tabIndex={0}
                                role="button"
                                aria-label="About total FSM hours"
                              >
                                ?
                              </span>
                            </OverlayTrigger>
                          </span>
                        </th>
                        <th className="py-3 text-end">
                          <span className="d-inline-flex align-items-center justify-content-end gap-1 w-100">
                            Push hrs → SAP
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id="sap-push-hrs-tooltip" className="text-start">
                                  <div style={{ maxWidth: 320 }}>
                                    Writes <strong>Total hrs (FSM)</strong> into SAP <code>U_WorkingHrs</code> on the{" "}
                                    <code>U_JOB_INCENTIVES</code> row for this worker and the <strong>selected calendar month</strong>{" "}
                                    (filter must be Monthly). Requires an existing matching UDT row, SAP browser session, and
                                    Service Layer permissions to update the table.
                                  </div>
                                </Tooltip>
                              }
                            >
                              <span
                                className="d-inline-flex align-items-center justify-content-center rounded-circle border text-secondary user-select-none flex-shrink-0"
                                style={{ width: 18, height: 18, fontSize: 11, lineHeight: 1, cursor: "help" }}
                                tabIndex={0}
                                role="button"
                                aria-label="About pushing FSM hours to SAP"
                              >
                                ?
                              </span>
                            </OverlayTrigger>
                          </span>
                        </th>
                        <th className="py-3 text-end pe-4">
                          <span className="d-inline-flex align-items-center justify-content-end gap-1 w-100">
                            Action
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id="sap-save-tooltip" className="text-start">
                                  <div style={{ maxWidth: 300 }}>
                                    If you <strong>edit</strong> the SAP technician ID in the box, click the row&apos;s
                                    button to write it to the portal database. <strong>Refresh all</strong> (monthly)
                                    usually fills the ID for you automatically—you only need this after a manual change or clear.
                                  </div>
                                </Tooltip>
                              }
                            >
                              <span
                                className="d-inline-flex align-items-center justify-content-center rounded-circle border text-secondary user-select-none flex-shrink-0"
                                style={{ width: 18, height: 18, fontSize: 11, lineHeight: 1, cursor: "help" }}
                                tabIndex={0}
                                role="button"
                                aria-label="About saving the technician ID"
                              >
                                ?
                              </span>
                            </OverlayTrigger>
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={9} className="text-center py-5">
                            <Spinner animation="border" size="sm" className="me-2" />
                            Loading incentive settings...
                          </td>
                        </tr>
                      ) : filteredWorkers.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="text-center text-muted py-5">
                            No workers found.
                          </td>
                        </tr>
                      ) : (
                        pagedWorkers.map((worker) => (
                          <tr key={worker.id}>
                            <td className="px-4">
                              <div className="fw-semibold">
                                {worker.full_name || worker.user?.username || "Unnamed worker"}
                              </div>
                              <div className="text-muted small">{worker.email || worker.user?.username || worker.id}</div>
                            </td>
                            <td>
                              <Badge bg={String(worker.status || "").toUpperCase() === "ACTIVE" ? "success" : "secondary"}>
                                {worker.status || "Unknown"}
                              </Badge>
                            </td>
                            <td>
                              <Form.Control
                                type="text"
                                size="sm"
                                className="rounded-3"
                                placeholder="e.g. Name"
                                value={sapTechDrafts[worker.id] ?? ""}
                                onChange={(e) =>
                                  setSapTechDrafts((prev) => ({ ...prev, [worker.id]: e.target.value }))
                                }
                              />
                            </td>
                            <td className="text-end">
                              {sapLoading ? (
                                <span className="text-muted small">…</span>
                              ) : sapUdtForPeriod.hasRowByTech[worker.id] ? (
                                formatSapAmount(sapUdtForPeriod.incomeByTech[worker.id])
                              ) : sapRows.length ? (
                                formatSapAmount(0)
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="text-end">
                              {sapLoading ? (
                                <span className="text-muted small">…</span>
                              ) : sapUdtForPeriod.hasRowByTech[worker.id] ? (
                                formatSapAmount(sapUdtForPeriod.hrsByTech[worker.id])
                              ) : sapRows.length ? (
                                formatSapAmount(0)
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="text-end">
                              {fsmLaborLoading ? (
                                <span className="text-muted small">…</span>
                              ) : (
                                formatSapAmount(fsmLaborByTech[worker.id] ?? 0)
                              )}
                            </td>
                            <td className="text-end">
                              <Button
                                size="sm"
                                variant="outline-primary"
                                className="rounded-3 text-nowrap"
                                disabled={
                                  filterType !== "M" ||
                                  fsmLaborLoading ||
                                  pushingSapHrsId === worker.id ||
                                  pushingAllSap ||
                                  sapLoading
                                }
                                title={
                                  filterType !== "M"
                                    ? "Switch roll-up to Monthly to target one SAP UDT month."
                                    : "Writes FSM hours to SAP U_WorkingHrs for this month (needs matching UDT row)."
                                }
                                onClick={() => void preparePushSapModal(worker)}
                              >
                                {pushingSapHrsId === worker.id ? "Pushing…" : "Push to SAP"}
                              </Button>
                            </td>
                            <td className="text-end pe-4">
                              <Button
                                size="sm"
                                variant="outline-secondary"
                                className="rounded-3"
                                disabled={savingSapId === worker.id}
                                title="Saves the technician ID in the box to the portal. Use after you edit it manually; Refresh all usually fills it for you."
                                onClick={() => saveSapTech(worker)}
                              >
                                {savingSapId === worker.id ? "Saving…" : "Save"}
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
                  <small className="text-muted">
                    Showing {filteredWorkers.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}
                    {" - "}
                    {Math.min(safePage * PAGE_SIZE, filteredWorkers.length)}
                    {" of "}
                    {filteredWorkers.length} workers
                  </small>
                  {totalPages > 1 && (
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={safePage === 1}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      />
                      {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                        <Pagination.Item
                          key={pageNumber}
                          active={pageNumber === safePage}
                          onClick={() => setPage(pageNumber)}
                        >
                          {pageNumber}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={safePage === totalPages}
                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                      />
                    </Pagination>
                  )}
                </div>
                {SHOW_SAP_UDT_PANEL && (
                  <>
                <SectionLabel>SAP incentive UDT</SectionLabel>
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                  <div className="d-flex flex-wrap gap-2 align-items-center">
                    <Button
                      variant="success"
                      size="sm"
                      className="rounded-3"
                      onClick={() => void fetchFromSapAndSaveWorkers()}
                      disabled={fetchingFromSap || loading || sapLoading || !workers.length}
                    >
                      {fetchingFromSap ? "Saving…" : "Fetch from SAP → save workers"}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="rounded-3"
                      onClick={() => void loadSapIncentives()}
                      disabled={sapLoading}
                    >
                      {sapLoading ? "Refreshing…" : "Refresh UDT"}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      className="rounded-3"
                      onClick={() => setUdtTableOpen((v) => !v)}
                      aria-expanded={udtTableOpen}
                    >
                      {udtTableOpen ? "Hide raw UDT" : "Show raw UDT"}
                    </Button>
                  </div>
                </div>
                <Collapse in={udtTableOpen}>
                  <div
                    id="sap-incentive-udt-collapse"
                    className="table-responsive rounded-3 border mb-4"
                    style={{ maxHeight: "min(70vh, 560px)", overflow: "auto" }}
                  >
                    <Table hover className="mb-0 align-middle">
                      <thead className="bg-light sticky-top">
                        <tr>
                          <th className="px-4 py-3">Code</th>
                          <th className="py-3">Technician</th>
                          <th className="py-3">Period</th>
                          <th className="py-3 text-end">Income</th>
                          <th className="py-3 text-end">Expense</th>
                          <th className="py-3 text-end">Working Hours</th>
                          <th className="py-3 text-end">Income / Hour</th>
                          <th className="py-3 text-end pe-4">Service Income / Hour</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sapLoading ? (
                          <tr>
                            <td colSpan={8} className="text-center py-5">
                              <Spinner animation="border" size="sm" className="me-2" />
                              Loading SAP incentive records...
                            </td>
                          </tr>
                        ) : sapRows.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center text-muted py-5">
                              No rows yet. Refresh all, or sign in to SAP Business One in this browser. If it stays
                              empty, the incentive table in SAP may use different column names than this company expects.
                            </td>
                          </tr>
                        ) : (
                          sapRows.map((row) => (
                            <tr key={`${row.Code || row.Name}-${row.U_TechName || ""}`}>
                              <td className="px-4">{formatSapValue(row.Code || row.Name)}</td>
                              <td>{formatSapValue(row.U_TechName)}</td>
                              <td>
                                {formatSapValue(row.U_JobMonth)}
                                {row.U_Year ? ` ${row.U_Year}` : ""}
                              </td>
                              <td className="text-end">{formatSapAmount(row.U_Income)}</td>
                              <td className="text-end">{formatSapAmount(row.U_Expense)}</td>
                              <td className="text-end">
                                {formatSapAmount(row.U_WorkingHrs ?? row.U_WorkingHs)}
                              </td>
                              <td className="text-end">{formatSapAmount(row.U_IncomePerHour)}</td>
                              <td className="text-end pe-4">{formatSapAmount(row.U_SIncomePerHour)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </Table>
                  </div>
                </Collapse>
                  </>
                )}
        </Card.Body>
      </Card>

      <Modal show={Boolean(pushSapModal)} onHide={closePushSapModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>Push FSM hours to SAP</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!pushSapModal ? null : pushSapModal.status === "loading" ? (
            <div className="d-flex align-items-center text-muted">
              <Spinner animation="border" size="sm" className="me-2" />
              Loading SAP incentive rows…
            </div>
          ) : (
            <>
              <div className="mb-3">
                <div className="fw-semibold">
                  {pushSapModal.worker?.full_name || pushSapModal.worker?.email || "Worker"}
                </div>
                {pushSapModal.worker?.sap_tech_code ? (
                  <div className="small text-muted">SAP tech code: {pushSapModal.worker.sap_tech_code}</div>
                ) : null}
              </div>

              {pushSapModal.status === "confirm" || pushSapModal.status === "pushing" ? (
                <>
                  <p className="mb-2 small text-muted">
                    This writes <code>U_WorkingHrs</code> on the incentive UDT row for{" "}
                    <strong>
                      {pushSapModal.laborMonth}/{pushSapModal.laborYear}
                    </strong>
                    {pushSapModal.periodLabel ? ` (SAP: ${pushSapModal.periodLabel})` : null}. The SAP B1
                    Technician Report uses stored procedure data (job/invoice lines), not this UDT field
                    alone.
                  </p>
                  {pushSapModal.sapAddonHrs != null &&
                  Math.abs(pushSapModal.sapAddonHrs - pushSapModal.workingHrs) > 0.05 ? (
                    <Alert variant="warning" className="small py-2">
                      SAP addon report shows <strong>{formatSapAmount(pushSapModal.sapAddonHrs)}</strong>{" "}
                      working hrs for this month (from <code>_SPPXC_Job_Incentive_Data</code>
                      {pushSapModal.sapInvoiceLineCount != null && pushSapModal.sapInvoiceLineCount > 0 ? (
                        <>
                          , <strong>{pushSapModal.sapInvoiceLineCount}</strong> invoice line
                          {pushSapModal.sapInvoiceLineCount === 1 ? "" : "s"} in the drill-down
                        </>
                      ) : null}
                      ). FSM labor is <strong>{formatSapAmount(pushSapModal.workingHrs)}</strong>.
                      {pushSapModal.sapInvoiceLineCount >= 2 &&
                      Math.abs(pushSapModal.sapAddonHrs - pushSapModal.workingHrs * pushSapModal.sapInvoiceLineCount) <
                        0.15 ? (
                        <>
                          {" "}
                          That pattern often means SAP is counting similar hours once per invoice (
                          {formatSapAmount(pushSapModal.workingHrs)} × {pushSapModal.sapInvoiceLineCount} ≈{" "}
                          {formatSapAmount(pushSapModal.workingHrs * pushSapModal.sapInvoiceLineCount)}). Pushing
                          to the UDT will not change the addon grid until job/invoice hours in SAP are aligned.
                        </>
                      ) : (
                        <>
                          {" "}
                          Align <code>@API_JOB_SCHEDULE</code> / invoice job hours in SAP, or ask your SAP
                          consultant how the addon should use FSM vs invoice-derived hours.
                        </>
                      )}
                    </Alert>
                  ) : null}
                  {pushSapModal.monthRowCount > 1 ? (
                    <Alert variant="info" className="small py-2">
                      SAP has <strong>{pushSapModal.monthRowCount}</strong> incentive rows for this worker in this
                      month. The addon sums <code>U_WorkingHrs</code> across them (currently{" "}
                      <strong>{formatSapAmount(pushSapModal.sapMonthHrsSum)}</strong>
                      {pushSapModal.sapMonthHrsSum > pushSapModal.workingHrs * 1.5 ? (
                        <>
                          , which is higher than FSM <strong>{formatSapAmount(pushSapModal.workingHrs)}</strong>
                        </>
                      ) : null}
                      ). Push will set the primary row to FSM hours and clear{" "}
                      <strong>{pushSapModal.zeroCodes?.length || 0}</strong> duplicate row(s) to{" "}
                      <strong>0</strong> so the addon total matches the portal.
                    </Alert>
                  ) : null}
                  <Table size="sm" bordered className="mb-0">
                    <tbody>
                      <tr>
                        <td className="text-muted">SAP row (Code)</td>
                        <td className="fw-semibold">{pushSapModal.odataKey || pushSapModal.code}</td>
                      </tr>
                      {pushSapModal.udtName && pushSapModal.udtName !== (pushSapModal.odataKey || pushSapModal.code) ? (
                        <tr>
                          <td className="text-muted">SAP Name</td>
                          <td>{pushSapModal.udtName}</td>
                        </tr>
                      ) : null}
                      {pushSapModal.sapTechName ? (
                        <tr>
                          <td className="text-muted">SAP technician</td>
                          <td>{pushSapModal.sapTechName}</td>
                        </tr>
                      ) : null}
                      <tr>
                        <td className="text-muted">Current U_WorkingHrs (SAP UDT row)</td>
                        <td>{formatSapAmount(pushSapModal.currentSapHrs ?? 0)}</td>
                      </tr>
                      <tr>
                        <td className="text-muted">New value (FSM)</td>
                        <td className="fw-semibold text-primary">{formatSapAmount(pushSapModal.workingHrs)}</td>
                      </tr>
                    </tbody>
                  </Table>
                </>
              ) : null}

              {pushSapModal.status === "no-row" ? (
                <>
                  <Alert variant="warning" className="mb-3">
                    {pushSapModal.message}
                  </Alert>
                  <p className="small mb-2">
                    Portal labor period: <strong>{pushSapModal.laborMonth}/{pushSapModal.laborYear}</strong>
                    {pushSapModal.worker?.sap_udt_snapshot_label ? (
                      <>
                        {" "}
                        · Last SAP snapshot: <strong>{pushSapModal.worker.sap_udt_snapshot_label}</strong>
                      </>
                    ) : null}
                  </p>
                  {pushSapModal.hits?.length > 0 ? (
                    <div className="mb-3">
                      <div className="small fw-semibold mb-2">Matching SAP rows (other months)</div>
                      <div className="rounded border overflow-hidden">
                        <Table size="sm" className="mb-0">
                          <thead className="bg-light">
                            <tr>
                              <th>Code</th>
                              <th>U_TechName</th>
                              <th>Period</th>
                              <th className="text-end">U_WorkingHrs</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...pushSapModal.hits]
                              .sort(
                                (a, b) =>
                                  (parseInt(String(b.U_Year ?? 0), 10) || 0) * 100 +
                                  (parseInt(String(b.U_JobMonth ?? 0), 10) || 0) -
                                  ((parseInt(String(a.U_Year ?? 0), 10) || 0) * 100 +
                                    (parseInt(String(a.U_JobMonth ?? 0), 10) || 0))
                              )
                              .slice(0, 8)
                              .map((row) => (
                                <tr key={`${udtRowCode(row)}-${udtRowPeriodLabel(row)}`}>
                                  <td>{formatSapValue(udtRowCode(row))}</td>
                                  <td>{formatSapValue(row.U_TechName)}</td>
                                  <td>{udtRowPeriodLabel(row) || "—"}</td>
                                  <td className="text-end">
                                    {formatSapAmount(row.U_WorkingHrs ?? row.U_WorkingHs)}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </Table>
                      </div>
                    </div>
                  ) : null}
                  {pushSapModal.suggestedPeriods?.length > 0 ? (
                    <div>
                      <div className="small fw-semibold mb-2">Use a period that exists in SAP</div>
                      <div className="d-flex flex-wrap gap-2">
                        {pushSapModal.suggestedPeriods.map((p) => (
                          <Button
                            key={`${p.year}-${p.month}-${p.label}`}
                            size="sm"
                            variant="outline-primary"
                            className="rounded-3"
                            onClick={() =>
                              void preparePushSapModal(pushSapModal.worker, { year: p.year, month: p.month })
                            }
                          >
                            {p.fromSnapshot ? "Snapshot" : "SAP"} {p.month}/{p.year}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}

              {pushSapModal.status === "blocked" || pushSapModal.status === "error" ? (
                <Alert variant={pushSapModal.status === "blocked" ? "info" : "danger"} className="mb-0">
                  {pushSapModal.message}
                </Alert>
              ) : null}

              {pushSapModal.status === "success" ? (
                <Alert variant="success" className="mb-0">
                  {pushSapModal.message}
                </Alert>
              ) : null}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          {pushSapModal?.status === "confirm" ? (
            <>
              <Button variant="outline-secondary" className="rounded-3" onClick={closePushSapModal}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="rounded-3"
                disabled={pushingSapHrsId != null}
                onClick={() => void confirmPushFsmHoursToSap()}
              >
                Push to SAP
              </Button>
            </>
          ) : pushSapModal?.status === "pushing" ? (
            <Button variant="primary" className="rounded-3" disabled>
              <Spinner animation="border" size="sm" className="me-2" />
              Pushing…
            </Button>
          ) : (
            <Button variant="outline-secondary" className="rounded-3" onClick={closePushSapModal}>
              Close
            </Button>
          )}
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(pushAllModal)} onHide={closePushAllModal} centered size="lg">
        <Modal.Header closeButton={!pushingAllSap}>
          <Modal.Title>Push all FSM hours to SAP</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!pushAllModal ? null : pushAllModal.status === "loading" ? (
            <div className="d-flex align-items-center text-muted">
              <Spinner animation="border" size="sm" className="me-2" />
              Preparing bulk push…
            </div>
          ) : pushAllModal.status === "pushing" ? (
            <div className="d-flex align-items-center text-muted">
              <Spinner animation="border" size="sm" className="me-2" />
              Pushing worker {pushAllModal.progress ?? 0} of {pushAllModal.total ?? pushAllModal.eligible?.length ?? 0}
              …
            </div>
          ) : pushAllModal.status === "done" ? (
            <>
              <Alert variant={pushAllModal.failed?.length ? "warning" : "success"} className="mb-3">
                Pushed <strong>{pushAllModal.pushed}</strong> worker(s) for{" "}
                <strong>
                  {pushAllModal.laborMonth}/{pushAllModal.laborYear}
                </strong>
                .
                {pushAllModal.failed?.length ? (
                  <>
                    {" "}
                    <strong>{pushAllModal.failed.length}</strong> failed.
                  </>
                ) : null}
                {pushAllModal.skippedCount > 0 ? (
                  <>
                    {" "}
                    {pushAllModal.skippedCount} skipped (no UDT match).
                  </>
                ) : null}
              </Alert>
              {pushAllModal.failed?.length > 0 ? (
                <div className="rounded border overflow-hidden">
                  <Table size="sm" className="mb-0">
                    <thead className="bg-light">
                      <tr>
                        <th>Worker</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pushAllModal.failed.map((f) => (
                        <tr key={f.name}>
                          <td>{f.name}</td>
                          <td className="text-danger small">{f.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="small text-muted mb-3">
                Push <strong>Total hrs (FSM)</strong> to SAP <code>U_WorkingHrs</code> for{" "}
                <strong>
                  {pushAllModal.laborMonth}/{pushAllModal.laborYear}
                </strong>
                . Scope: workers matching current search ({filteredWorkers.length} total).
              </p>
              <div className="mb-3">
                <div className="fw-semibold mb-2">
                  Eligible: {pushAllModal.eligible?.length ?? 0} worker(s)
                </div>
                {pushAllModal.eligible?.length > 0 ? (
                  <div className="rounded border overflow-hidden">
                    <div
                      className={pushAllExpandEligible ? "overflow-auto" : undefined}
                      style={
                        pushAllExpandEligible
                          ? { maxHeight: "min(50vh, 320px)" }
                          : undefined
                      }
                    >
                      <Table size="sm" className="mb-0">
                        <thead className="bg-light sticky-top">
                          <tr>
                            <th className="text-muted text-center" style={{ width: 44 }}>
                              #
                            </th>
                            <th>SAP row</th>
                            <th>Worker</th>
                            <th className="text-end">FSM Total Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(pushAllExpandEligible
                            ? pushAllModal.eligible
                            : pushAllModal.eligible.slice(0, PUSH_ALL_ELIGIBLE_PREVIEW)
                          ).map((item, index) => (
                            <tr key={item.worker.id}>
                              <td className="text-muted text-center">{index + 1}</td>
                              <td className="text-break">{item.odataKey || item.code}</td>
                              <td>{item.worker.full_name || item.worker.email || "Worker"}</td>
                              <td className="text-end">{formatSapAmount(item.workingHrs)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                    {pushAllModal.eligible.length > PUSH_ALL_ELIGIBLE_PREVIEW ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="w-100 text-start px-3 py-2 border-top rounded-0 text-decoration-none"
                        onClick={() => setPushAllExpandEligible((expanded) => !expanded)}
                        aria-expanded={pushAllExpandEligible}
                      >
                        {pushAllExpandEligible
                          ? "Show less"
                          : `Show ${pushAllModal.eligible.length - PUSH_ALL_ELIGIBLE_PREVIEW} more worker${
                              pushAllModal.eligible.length - PUSH_ALL_ELIGIBLE_PREVIEW === 1 ? "" : "s"
                            }`}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <Alert variant="warning" className="mb-0 py-2 small">
                    No workers with a matching SAP UDT row for this period.
                  </Alert>
                )}
              </div>
              {pushAllModal.skipped?.length > 0 ? (
                <div>
                  <div className="fw-semibold mb-2 small">
                    Skipped: {pushAllModal.skipped.length} worker(s)
                  </div>
                  <ul
                    className={`small text-muted mb-0 ps-3 ${pushAllExpandSkipped ? "overflow-auto pe-2" : ""}`}
                    style={pushAllExpandSkipped ? { maxHeight: "min(40vh, 240px)" } : undefined}
                  >
                    {(pushAllExpandSkipped
                      ? pushAllModal.skipped
                      : pushAllModal.skipped.slice(0, PUSH_ALL_SKIPPED_PREVIEW)
                    ).map((s) => (
                      <li key={s.worker.id} className="mb-1">
                        {s.name}: {s.reason}
                      </li>
                    ))}
                  </ul>
                  {pushAllModal.skipped.length > PUSH_ALL_SKIPPED_PREVIEW ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="px-0 text-decoration-none"
                      onClick={() => setPushAllExpandSkipped((expanded) => !expanded)}
                      aria-expanded={pushAllExpandSkipped}
                    >
                      {pushAllExpandSkipped
                        ? "Show less"
                        : `Show ${pushAllModal.skipped.length - PUSH_ALL_SKIPPED_PREVIEW} more skipped worker${
                            pushAllModal.skipped.length - PUSH_ALL_SKIPPED_PREVIEW === 1 ? "" : "s"
                          }`}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          {pushAllModal?.status === "preview" ? (
            <>
              <Button variant="outline-secondary" className="rounded-3" onClick={closePushAllModal}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="rounded-3"
                disabled={!pushAllModal.eligible?.length}
                onClick={() => void confirmPushAllToSap()}
              >
                Push {pushAllModal.eligible?.length ?? 0} to SAP
              </Button>
            </>
          ) : pushAllModal?.status === "pushing" ? (
            <Button variant="primary" className="rounded-3" disabled>
              <Spinner animation="border" size="sm" className="me-2" />
              Pushing…
            </Button>
          ) : (
            <Button variant="outline-secondary" className="rounded-3" onClick={closePushAllModal}>
              Close
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <Row>
      <Col xl={{ offset: 2, span: 8 }} lg={10} md={12}>
        {content}
      </Col>
    </Row>
  );
};

export default JobIncentiveSettings;
