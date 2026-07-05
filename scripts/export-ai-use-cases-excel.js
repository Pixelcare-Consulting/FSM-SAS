#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Export AI use case recommendations for the SAS FSM portal to Excel.
 *
 * Usage:
 *   node scripts/export-ai-use-cases-excel.js
 *   node scripts/export-ai-use-cases-excel.js --output=docs/AI-Use-Cases-Portal.xlsx
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'docs', 'AI-Use-Cases-Portal.xlsx');

function parseArgs(argv) {
  let output = DEFAULT_OUTPUT;
  for (const arg of argv) {
    if (arg.startsWith('--output=')) output = path.resolve(REPO_ROOT, arg.slice(9).trim());
  }
  return { output };
}

function sheetFromRows(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const colWidths = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = String(cell ?? '').length;
      colWidths[i] = Math.min(Math.max(colWidths[i] || 10, len + 2), 80);
    });
  }
  ws['!cols'] = colWidths.map((w) => ({ wch: w }));
  return ws;
}

function buildWorkbook() {
  const wb = XLSX.utils.book_new();

  const overview = [
    ['SAS & ME Field Service Management Portal — AI Use Cases'],
    ['Generated', new Date().toISOString().slice(0, 10)],
    ['Stack', 'Next.js + Supabase + SAP Business One'],
    ['Current AI status', 'No production AI integration today (README claims are aspirational)'],
    [],
    ['Recommended starting pilots'],
    ['1', 'SAP Sync Troubleshooter — immediate ops value from existing job_sync_logs'],
    ['2', 'Lead Intake Assistant — reduces manual work on Google Forms → Job workflow'],
    [],
    ['Architecture pattern'],
    ['Flow', 'Browser → /api/ai/* (Next.js) → OpenAI or Azure OpenAI → Supabase context'],
    ['Optional', 'pgvector in Supabase for Help RAG document search'],
    [],
    ['Guardrails'],
    ['Human-in-the-loop', 'Confirm before create/update, especially SAP writes'],
    ['Audit', 'Log prompts and responses via auditLog service'],
    ['Privacy', 'No customer PII in model training; use API with data retention off'],
  ];

  const topUseCases = [
    [
      'Rank',
      'Use Case',
      'Portal Area',
      'What AI Does',
      'Why It Fits',
      'Start Small (MVP)',
      'Impact',
      'Effort',
      'Priority',
    ],
    [
      1,
      'Dispatch Copilot',
      'Technicians Scheduler, job assignment',
      'Suggest best technician (skills, location, availability, workload); flag conflicts; explain recommendations',
      'Scheduler is manual drag-and-drop today; closes gap vs README "AI-powered scheduling"',
      'Button on job card → "Suggest technician" → ranked list with reasons',
      'High',
      'High',
      'Phase 3',
    ],
    [
      2,
      'Lead Intake Assistant',
      'Google Forms sync → Customer Leads → Create Job',
      'Parse messy notes/time_slot/addresses; score lead quality; pre-fill job title, priority, duration, dates',
      'Time slot parsing uses regex today; AI handles free text and edge cases better',
      'On lead view → "Enhance & create job draft" → dispatcher confirms',
      'High',
      'Medium',
      'Phase 1 pilot',
    ],
    [
      3,
      'SAP Sync Troubleshooter',
      'job_sync_logs, audit logs, jobs list SAP errors',
      'Plain-English error explanation; suggested fix; one-click apply where safe (e.g. trim long notes)',
      'Sync payloads already logged; ops pain is interpreting SAP rejection messages',
      'Error badge on job row → "Diagnose" panel using last job_sync_logs entry',
      'High',
      'Low',
      'Phase 1 pilot',
    ],
    [
      4,
      'Pre-Visit Customer Brief',
      'Job detail page ([jobId])',
      'Summarize customer history: past jobs, address_notes, follow-ups, memos; highlight risks',
      'Data scattered across jobs, customers, address details, follow-ups',
      '"Generate brief" button → 5-bullet summary before dispatch',
      'Medium',
      'Medium',
      'Phase 2',
    ],
    [
      5,
      'Follow-up Prioritization',
      'Follow-Ups page',
      'Daily "needs attention" queue; suggest priority, owner, next action',
      'Manual triage at scale; priority 1–5 and types already exist',
      'Morning digest widget: top 10 follow-ups ranked by urgency',
      'Medium',
      'Medium',
      'Phase 2',
    ],
    [
      6,
      'Portal Help Copilot (RAG)',
      'Help page + floating chat',
      'Answer portal questions grounded in docs/, FAQs, release notes',
      'Low risk, fast win, reduces support load',
      'Chat widget on Help page with links to relevant docs',
      'Medium',
      'Low',
      'Phase 1',
    ],
  ];

  const currentState = [
    ['Module', 'Current State', 'AI Opportunity', 'Key Files / Areas'],
    [
      'Leads',
      'Google Forms → manual sync → manual Create Job',
      'Auto-parse, score, pre-fill jobs',
      'pages/dashboard/leads/, docs/GOOGLE_FORMS_INTEGRATION_FLOWCHART.md',
    ],
    [
      'Scheduler',
      'Drag-and-drop timeline',
      'Smart technician + slot suggestions',
      'pages/dashboard/scheduling/workers/scheduler.js, TimelineScheduler',
    ],
    [
      'Jobs + SAP',
      'jobSyncToSap, hourly sync, job_sync_logs',
      'Explain failures, auto-fix common issues',
      'lib/services/jobSyncToSap.js, pages/api/jobs/sync-to-sap.js, sync-hourly.js',
    ],
    [
      'Follow-ups',
      'Manual priority 1–5, large list UI',
      'Predict urgency, suggest next action',
      'pages/dashboard/follow-ups/index.js',
    ],
    [
      'Help',
      'Static FAQ accordion',
      'RAG copilot over docs + portal',
      'pages/dashboard/help/index.js, docs/',
    ],
    [
      'Live tracking',
      'Google Maps markers',
      'Route sequencing for daily technician runs',
      'pages/dashboard/jobs/live-tracking.js, LiveTrackingAdvancedMarkers.js',
    ],
  ];

  const rollout = [
    ['Phase', 'Timeline', 'Use Cases', 'Deliverables'],
    [
      'Phase 1',
      '2–4 weeks',
      'Help copilot (RAG); Lead field parser; SAP sync diagnostician',
      'API routes /api/ai/*; UI hooks on Help, Leads, Jobs list',
    ],
    [
      'Phase 2',
      '1–2 months',
      'Pre-visit brief; Follow-up prioritization',
      'Job detail brief panel; Follow-ups digest widget',
    ],
    [
      'Phase 3',
      '2–3 months',
      'Dispatch copilot',
      'Scheduler integration with human-in-the-loop assignment',
    ],
  ];

  const quickVsBig = [
    ['Category', 'Item', 'Notes'],
    ['Quick win (< 1 week each)', 'Help RAG chatbot', 'Index docs/ and help FAQs'],
    ['Quick win', 'Lead notes → structured fields', 'Enhance existing lead-to-job flow'],
    ['Quick win', 'SAP error explainer', 'Uses existing job_sync_logs data'],
    ['Bigger bet', 'Auto technician assignment', 'Needs skills matrix, travel time, UX trust'],
    ['Bigger bet', 'Route optimization across day', 'Google Maps API + constraint solver'],
    ['Bigger bet', 'Predictive SLA breach alerts', 'Needs historical SLA data quality'],
  ];

  const lowerPriority = [
    ['Use Case', 'Note', 'When to Revisit'],
    ['Voice-to-job-notes (mobile)', 'Nice for field techs; needs mobile app work', 'After mobile workforce rollout'],
    ['Predictive repeat visit', 'Needs 6–12 months clean job history', 'When job data volume is sufficient'],
    ['Auto-generated report narratives', 'Monthly reports page enhancement', 'Phase 2+ reporting work'],
    ['Full autonomous scheduling', 'High risk; keep human-in-the-loop', 'Only after Dispatch Copilot proves value'],
  ];

  XLSX.utils.book_append_sheet(wb, sheetFromRows(overview), 'Overview');
  XLSX.utils.book_append_sheet(wb, sheetFromRows(topUseCases), 'Top Use Cases');
  XLSX.utils.book_append_sheet(wb, sheetFromRows(currentState), 'Current vs AI');
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rollout), 'Rollout Plan');
  XLSX.utils.book_append_sheet(wb, sheetFromRows(quickVsBig), 'Quick Wins vs Big Bets');
  XLSX.utils.book_append_sheet(wb, sheetFromRows(lowerPriority), 'Lower Priority');

  return wb;
}

function main() {
  const { output } = parseArgs(process.argv.slice(2));
  const dir = path.dirname(output);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const wb = buildWorkbook();
  XLSX.writeFile(wb, output);
  console.log(`Wrote ${output}`);
}

main();
