/**
 * OData key paths for SAP B1 user-defined tables (Service Layer).
 */

export function odataEscapeStringLiteral(s) {
  return String(s ?? "").replace(/'/g, "''");
}

/**
 * @returns {string|null} e.g. U_JOB_INCENTIVES('ABC') or U_JOB_INCENTIVES(544)
 */
export function buildUdtEntityKeyPath(entitySet, rawKey) {
  const key = String(rawKey ?? "").trim();
  if (!key) return null;

  if (/^\d+$/.test(key)) {
    return `${entitySet}(${key})`;
  }

  return `${entitySet}('${odataEscapeStringLiteral(key)}')`;
}

/**
 * PATCH exactly one UDT row by Code (no Name fallback — avoids updating the wrong duplicate row).
 */
export async function patchUdtRowByCode(sapService, sessionCookies, entitySet, code, body) {
  const key = String(code ?? "").trim();
  if (!key) throw new Error("UDT Code is required for PATCH");
  const path = buildUdtEntityKeyPath(entitySet, key);
  if (!path) throw new Error("Invalid UDT key");
  await sapService.makeRequest(path, { method: "PATCH", body, quiet: true }, sessionCookies);
  return { key };
}

/**
 * Resolve Code when GET rows only had Name populated in the portal match.
 */
export async function fetchUdtCodeByFilter(sapService, sessionCookies, entitySet, { name, year, month }) {
  const escName = odataEscapeStringLiteral(name);
  const parts = [`Name eq '${escName}'`];
  const y = parseInt(String(year), 10);
  const m = parseInt(String(month), 10);
  if (Number.isFinite(y)) parts.push(`U_Year eq ${y}`);
  if (Number.isFinite(m)) parts.push(`U_JobMonth eq ${m}`);

  const params = new URLSearchParams();
  params.set("$select", "Code,Name");
  params.set("$filter", parts.join(" and "));
  params.set("$top", "1");

  const data = await sapService.makeRequest(`${entitySet}?${params.toString()}`, { quiet: true }, sessionCookies);
  const row = Array.isArray(data?.value) ? data.value[0] : null;
  const codeRaw = row?.Code ?? row?.code;
  return codeRaw != null && codeRaw !== "" ? String(codeRaw).trim() : null;
}

/**
 * Resolve OData Code, then PATCH primary row and zero duplicate month rows (SAP addon sums U_WorkingHrs).
 */
export async function syncUdtWorkingHrsForMonth(
  sapService,
  sessionCookies,
  entitySet,
  { code, name, year, month, workingHrs, zeroCodes, field }
) {
  let primaryCode = code != null && code !== "" ? String(code).trim() : "";
  if (!primaryCode && name) {
    primaryCode = (await fetchUdtCodeByFilter(sapService, sessionCookies, entitySet, { name, year, month })) || "";
  }
  if (!primaryCode) {
    throw new Error("Could not resolve SAP UDT Code for this worker and month.");
  }

  const patchBody = { [field]: workingHrs };
  await patchUdtRowByCode(sapService, sessionCookies, entitySet, primaryCode, patchBody);

  const zeroed = [];
  const zeroList = Array.isArray(zeroCodes) ? zeroCodes : [];
  for (const raw of zeroList) {
    const zc = String(raw ?? "").trim();
    if (!zc || zc === primaryCode) continue;
    await patchUdtRowByCode(sapService, sessionCookies, entitySet, zc, { [field]: 0 });
    zeroed.push(zc);
  }

  return { key: primaryCode, zeroed };
}
