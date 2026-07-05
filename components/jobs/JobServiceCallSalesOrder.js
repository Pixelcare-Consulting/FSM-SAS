import React from "react";

const EMPTY = "—";

function displayValue(value) {
  if (value == null) return EMPTY;
  const trimmed = String(value).trim();
  return trimmed || EMPTY;
}

export default function JobServiceCallSalesOrder({
  serviceCallNumber,
  salesOrderNumber,
  variant = "scheduler",
  className,
}) {
  const items = [
    { label: "Service Call", value: displayValue(serviceCallNumber) },
    { label: "Sales Order", value: displayValue(salesOrderNumber) },
  ];

  if (variant === "header") {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem 1.25rem",
          fontSize: "13px",
          color: "rgba(255, 255, 255, 0.8)",
          marginBottom: "0.5rem",
        }}
      >
        {items.map(({ label, value }) => (
          <span key={label}>
            <span style={{ color: "rgba(255, 255, 255, 0.65)" }}>{label}: </span>
            {value}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {items.map(({ label, value }) => (
        <span key={label}>
          <span data-label>{label}: </span>
          {value}
        </span>
      ))}
    </div>
  );
}
