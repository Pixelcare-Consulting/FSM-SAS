const release = {
  id: "portal-update-log-2026-05-19",
  title: "Portal update log - 19 May 2026",
  date: "2026-05-19",
  slug: "portal-update-log-19-may-2026",
  summary: "Summary of improvements deployed to the SAS&FM portal today.",
  sections: [
    {
      heading: "Jobs & SAP synchronization",
      items: [
        "Hourly job sync: preview mode, improved counts, pagination; reduced dependency on SAP session cookies.",
        "Jobs list: confirmation modal, live progress feed, clearer alerts during sync.",
        "AIFM import: day run, SAP identifier alignment, service call / sales order enrichment, audit logging.",
        "Equipment API: Supabase fallback when SAP session unavailable.",
        "Job contacts, quotations, and customer masterlist sync improvements.",
      ],
    },
    {
      heading: "Incentives & reporting",
      items: [
        "Incentive settings: SAP UDT totals respect selected labor month/quarter.",
      ],
    },
    {
      heading: "Admin & audit",
      items: [
        "Audit Logs page and Quick Menu entry.",
        "Login/logout and migration actions logged where applicable.",
      ],
    },
    {
      heading: "Customer & job UI",
      items: [
        "Create/Edit Job: improved address normalization.",
        "Quotations: clearer error messages.",
      ],
    },
  ],
};

function buildReleaseMarkdown(data) {
  const lines = [];

  lines.push(`# ${data.title}`);
  lines.push("");
  lines.push(`Date: ${data.date}`);
  lines.push("");
  lines.push(data.summary);
  lines.push("");

  for (const section of data.sections) {
    lines.push(`## ${section.heading}`);
    for (const item of section.items) lines.push(`1. ${item}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}

module.exports = {
  release,
  releaseMarkdown: buildReleaseMarkdown(release),
  buildReleaseMarkdown,
};
