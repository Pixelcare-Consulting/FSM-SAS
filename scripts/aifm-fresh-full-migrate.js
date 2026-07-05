/**
 * Single entrypoint: optional workbook-scoped wipe → masterlist import → AH–contacts (+ optional SAP leads).
 *
 * Wipe deletes every `SAP_CardCode` found in "Mapped AIFM to SAP" (same rules as migrate:aifm-delete-by-code:
 * skips CP… + SAP Lead rows). Destructive — use --dry-run first.
 *
 *   pnpm migrate:aifm-fresh-full -- --wipe --file=public/sample-migration/your.xlsx --dry-run
 *   pnpm migrate:aifm-fresh-full -- --wipe --file=… --confirm=DELETE
 *
 * Re-import without deleting:
 *   pnpm migrate:aifm-fresh-full -- --skip-wipe --file=…
 *
 * Optional third step (after site notes):
 *   pnpm migrate:aifm-fresh-full -- --wipe … --confirm=DELETE --with-sap-leads
 *
 * `--dry-run` is forwarded to the wipe step and to each child importer.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const node = process.execPath;
const root = path.join(__dirname, '..');

/** Flags only this orchestrator understands (not forwarded). */
function stripOrchestrationFlags(argv) {
  const drop = new Set(['--wipe', '--skip-wipe', '--with-sap-leads']);
  return argv.filter((a) => !drop.has(a));
}

function hasCodesSource(argv) {
  return argv.some(
    (a) => a === '--codes-from-excel' || a.startsWith('--codes=') || a.startsWith('--codes-file='),
  );
}

function run(stepLabel, scriptRel, argv) {
  const scriptAbs = path.join(__dirname, scriptRel);
  console.log(`\n[migrate:aifm-fresh-full] ${stepLabel}`);
  console.log(`  → ${scriptRel} ${argv.join(' ')}`);
  const r = spawnSync(node, [scriptAbs, ...argv], { stdio: 'inherit', cwd: root });
  return r.status ?? 0;
}

function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const wipe = argv.includes('--wipe');
  const skipWipe = argv.includes('--skip-wipe');
  const withSapLeads = argv.includes('--with-sap-leads');

  if (wipe && skipWipe) {
    console.error('Pick one: --wipe (delete workbook customers first) or --skip-wipe (import only).');
    process.exit(1);
  }

  const forward = stripOrchestrationFlags(argv);

  if (wipe) {
    const delArgv = [...forward];
    if (!hasCodesSource(delArgv)) {
      delArgv.push('--codes-from-excel');
      console.log(
        '[migrate:aifm-fresh-full] wipe: appended --codes-from-excel (use --codes= / --codes-file= instead if needed).',
      );
    }

    let st = run('(wipe) delete-aifm-customers-by-code', 'delete-aifm-customers-by-code.js', delArgv);
    if (st !== 0) process.exit(st);
  } else if (!skipWipe) {
    console.log(
      '[migrate:aifm-fresh-full] no --wipe: skipping delete (pass --skip-wipe to silence this hint).',
    );
  }

  let st = run(
    '(1/2+) masterlist + site contacts/notes',
    'run-aifm-masterlist-then-site-notes.js',
    forward,
  );
  if (st !== 0) process.exit(st);

  if (withSapLeads) {
    st = run('(+sap leads) import-aifm-masterlist-sap-leads.js', 'import-aifm-masterlist-sap-leads.js', forward);
    process.exit(st);
  }

  console.log('\n[migrate:aifm-fresh-full] done.');
  process.exit(0);
}

main();
