/**
 * Runs `import-aifm-masterlist-customers.js` then `import-aifm-masterlist-site-contacts-notes.js`
 * with the **same** `--file=` so `customer_location` keys match the workbook used for AH–AQ.
 *
 * Usage (repo root):
 *   pnpm migrate:aifm-full:latest
 *   pnpm migrate:aifm-full:latest -- --dry-run --limit=100
 *   pnpm migrate:aifm-full:latest -- --file=public/sample-migration/your.xlsx
 *
 * Orchestrated wipe + migrate: `pnpm migrate:aifm-fresh-full -- --wipe --file=… --confirm=DELETE` (see scripts/aifm-fresh-full-migrate.js).
 *
 * If you **already** imported customers/locations and only need to refresh Excel columns AH–AQ:
 *   pnpm migrate:aifm-site-notes:update
 *   (same as: --only-site-notes below)
 *
 *   node scripts/run-aifm-masterlist-then-site-notes.js -- --only-site-notes
 *   node scripts/run-aifm-masterlist-then-site-notes.js -- --only-site-notes --file=public/sample-migration/your.xlsx
 *
 * `--only-site-notes` is **not** forwarded to children; all other args go to the site-notes script only.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const { DEFAULT_AIFM_MASTERLIST_LATEST_SUBMITTED_WORKBOOK } = require('./aifmMasterlistPaths');

const node = process.execPath;
const root = path.join(__dirname, '..');

function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const onlySiteNotes = argv.includes('--only-site-notes');
  const forward = argv.filter((a) => a !== '--only-site-notes');
  const fileArg = forward.find((a) => a.startsWith('--file='));
  const file = fileArg ? fileArg.slice(7).trim() : DEFAULT_AIFM_MASTERLIST_LATEST_SUBMITTED_WORKBOOK;
  const common = fileArg ? forward : [`--file=${file}`, ...forward];

  const master = path.join(__dirname, 'import-aifm-masterlist-customers.js');
  const site = path.join(__dirname, 'import-aifm-masterlist-site-contacts-notes.js');

  if (onlySiteNotes) {
    console.log('[migrate:aifm] AH–AQ update only (skips masterlist — use when DB already has customers/locations).');
    console.log(`[migrate:aifm] workbook: ${file}`);
    const r = spawnSync(node, [site, ...common], { stdio: 'inherit', cwd: root });
    process.exit(r.status ?? 0);
    return;
  }

  console.log(`[migrate:aifm-full] using workbook: ${file}`);
  console.log('[migrate:aifm-full] (1/2) migrate:aifm-masterlist …');
  let r = spawnSync(node, [master, ...common], { stdio: 'inherit', cwd: root });
  if (r.status !== 0) process.exit(r.status ?? 1);

  console.log('\n[migrate:aifm-full] (2/2) migrate:aifm-site-contacts-notes …');
  r = spawnSync(node, [site, ...common], { stdio: 'inherit', cwd: root });
  process.exit(r.status ?? 0);
}

main();
