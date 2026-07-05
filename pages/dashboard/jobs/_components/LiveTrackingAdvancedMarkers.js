import React, { useEffect, useRef } from "react";
import { useGoogleMap } from "@react-google-maps/api";

/** Pixel size of circular stop pins (matches popup offset math in LiveTrackingDashboard). */
export const LIVE_TRACKING_STOP_PIN_SIZE_PX = 28;

/** Pixel size of crew vehicle markers on the map. */
export const LIVE_TRACKING_VEHICLE_MARKER_SIZE_PX = 32;

const VEHICLE_MARKER_Z_INDEX = 3;
const STOP_MARKER_Z_INDEX = 1;
const STOP_SELECTED_Z_INDEX = 2;
/** Lift hovered marker above siblings so its tooltip is not covered. */
const MARKER_HOVER_Z_INDEX = 1000;

const VEHICLE_TRUCK_SVG_PATH =
  "M3 6h11v8H3V6zm11 2h2.5L20 11v3h-6V8zm-14 9a2 2 0 110-4 2 2 0 010 4zm14 0a2 2 0 110-4 2 2 0 010 4z";

/** Tooltip chrome aligned with LT tokens in LiveTrackingDashboard. */
const MARKER_TOOLTIP_THEME = {
  bg: "rgba(255, 255, 255, 0.97)",
  border: "rgba(15, 23, 42, 0.12)",
  text: "#0f172a",
  muted: "#64748b",
  shadow:
    "0 4px 14px rgba(15, 23, 42, 0.14), 0 2px 4px rgba(15, 23, 42, 0.06)",
};

function buildMarkerAriaLabel({ title, lines = [], subtitle }) {
  return [title, ...lines, subtitle].filter(Boolean).join(". ");
}

/** Raise {@link AdvancedMarkerElement} z-index on hover so tooltips clear nearby markers. */
function wireMarkerHoverElevation(marker, contentEl, baseZIndex) {
  const elevate = () => {
    marker.zIndex = MARKER_HOVER_Z_INDEX;
  };
  const restore = () => {
    marker.zIndex = baseZIndex;
  };
  contentEl.addEventListener("mouseenter", elevate);
  contentEl.addEventListener("mouseleave", restore);
  contentEl.addEventListener("focus", elevate);
  contentEl.addEventListener("blur", restore);
  return () => {
    contentEl.removeEventListener("mouseenter", elevate);
    contentEl.removeEventListener("mouseleave", restore);
    contentEl.removeEventListener("focus", elevate);
    contentEl.removeEventListener("blur", restore);
  };
}

function appendHoverTooltip(parent, { title, lines = [], subtitle }) {
  const tooltip = document.createElement("div");
  tooltip.setAttribute("role", "tooltip");
  tooltip.style.cssText = [
    "position:absolute",
    "left:50%",
    "bottom:calc(100% + 14px)",
    "transform:translateX(-50%) translateY(4px)",
    "opacity:0",
    "pointer-events:none",
    "z-index:50",
    "width:max-content",
    "min-width:140px",
    "max-width:200px",
    "transition:opacity 120ms ease, transform 120ms ease",
  ].join(";");

  const card = document.createElement("div");
  card.style.cssText = [
    "position:relative",
    `background:${MARKER_TOOLTIP_THEME.bg}`,
    `border:1px solid ${MARKER_TOOLTIP_THEME.border}`,
    "border-radius:8px",
    `box-shadow:${MARKER_TOOLTIP_THEME.shadow}`,
    "padding:8px 10px",
    "text-align:center",
    "width:max-content",
    "min-width:140px",
    "max-width:200px",
    "box-sizing:border-box",
  ].join(";");

  const titleEl = document.createElement("div");
  titleEl.textContent = title;
  titleEl.style.cssText = [
    `color:${MARKER_TOOLTIP_THEME.text}`,
    "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:13px",
    "font-weight:700",
    "line-height:1.3",
    "white-space:nowrap",
    "word-break:normal",
    "overflow-wrap:normal",
  ].join(";");
  card.appendChild(titleEl);

  for (const line of lines) {
    if (!line) continue;
    const lineEl = document.createElement("div");
    lineEl.textContent = line;
    lineEl.style.cssText = [
      `color:${MARKER_TOOLTIP_THEME.text}`,
      "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "font-size:12px",
      "font-weight:500",
      "line-height:1.35",
      "margin-top:2px",
      "white-space:nowrap",
      "word-break:normal",
      "overflow-wrap:normal",
    ].join(";");
    card.appendChild(lineEl);
  }

  if (subtitle) {
    const subEl = document.createElement("div");
    subEl.textContent = subtitle;
    subEl.style.cssText = [
      `color:${MARKER_TOOLTIP_THEME.muted}`,
      "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "font-size:11px",
      "font-weight:400",
      "line-height:1.35",
      "margin-top:4px",
      "white-space:nowrap",
      "word-break:normal",
      "overflow-wrap:normal",
    ].join(";");
    card.appendChild(subEl);
  }

  const arrow = document.createElement("div");
  arrow.setAttribute("aria-hidden", "true");
  arrow.style.cssText = [
    "position:absolute",
    "left:50%",
    "bottom:-5px",
    "transform:translateX(-50%) rotate(45deg)",
    "width:8px",
    "height:8px",
    `background:${MARKER_TOOLTIP_THEME.bg}`,
    `border-right:1px solid ${MARKER_TOOLTIP_THEME.border}`,
    `border-bottom:1px solid ${MARKER_TOOLTIP_THEME.border}`,
  ].join(";");
  card.appendChild(arrow);

  tooltip.appendChild(card);
  parent.appendChild(tooltip);

  const show = () => {
    tooltip.style.opacity = "1";
    tooltip.style.transform = "translateX(-50%) translateY(0)";
  };
  const hide = () => {
    tooltip.style.opacity = "0";
    tooltip.style.transform = "translateX(-50%) translateY(4px)";
  };
  parent.addEventListener("mouseenter", show);
  parent.addEventListener("mouseleave", hide);
  parent.addEventListener("focus", show);
  parent.addEventListener("blur", hide);

  return tooltip;
}

function vehicleTooltipKey(tooltip) {
  if (!tooltip?.crewName) return "";
  return [tooltip.crewName, tooltip.vehicle || "", tooltip.subtitle || ""].join(
    "\u0000"
  );
}

function appendVehicleTruckSvg(parent, sizePx = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(sizePx));
  svg.setAttribute("height", String(sizePx));
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", VEHICLE_TRUCK_SVG_PATH);
  path.setAttribute("fill", "#ffffff");
  svg.appendChild(path);
  parent.appendChild(svg);
  return svg;
}

export function createVehicleMarkerElement(color, label, tooltip) {
  const el = document.createElement("div");
  el.dataset.liveVehicleMarker = "1";
  el.setAttribute("tabindex", "0");
  const size = LIVE_TRACKING_VEHICLE_MARKER_SIZE_PX;
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    "border-radius:8px",
    `background:${color || "#2563eb"}`,
    "border:2px solid #ffffff",
    "box-shadow:0 2px 8px rgba(0,0,0,0.35)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "position:relative",
    "overflow:visible",
    "cursor:pointer",
    "box-sizing:border-box",
    "user-select:none",
    "pointer-events:auto",
    "isolation:isolate",
  ].join(";");
  appendVehicleTruckSvg(el, 18);
  if (label) {
    const badge = document.createElement("span");
    badge.textContent = label;
    badge.style.cssText = [
      "position:absolute",
      "top:-5px",
      "right:-5px",
      "min-width:14px",
      "height:14px",
      "padding:0 3px",
      "border-radius:7px",
      "background:#0f172a",
      "border:1.5px solid #ffffff",
      "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "font-size:9px",
      "font-weight:700",
      "color:#ffffff",
      "line-height:11px",
      "text-align:center",
      "box-sizing:border-box",
      "z-index:2",
    ].join(";");
    el.appendChild(badge);
  }
  if (tooltip?.crewName) {
    const lines = tooltip.vehicle ? [tooltip.vehicle] : [];
    el.setAttribute(
      "aria-label",
      buildMarkerAriaLabel({
        title: tooltip.crewName,
        lines,
        subtitle: tooltip.subtitle,
      })
    );
    appendHoverTooltip(el, {
      title: tooltip.crewName,
      lines,
      subtitle: tooltip.subtitle,
    });
  }
  return el;
}

/** Legend preview matching map crew vehicle markers. */
export function LiveTrackingVehicleLegendIcon({ color = "#2563eb", size = 18 }) {
  const box = Math.max(size + 6, 22);
  return (
    <span
      aria-hidden
      style={{
        width: box,
        height: box,
        borderRadius: 6,
        background: color,
        border: "2px solid #fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <path d={VEHICLE_TRUCK_SVG_PATH} fill="#ffffff" />
      </svg>
    </span>
  );
}

function createStopPinElement(label, selected, tooltip) {
  const el = document.createElement("div");
  el.textContent = label;
  el.dataset.liveStopPin = "1";
  el.setAttribute("tabindex", "0");
  const bg = selected ? "#16a34a" : "#2563eb";
  el.style.cssText = [
    `width:${LIVE_TRACKING_STOP_PIN_SIZE_PX}px`,
    `height:${LIVE_TRACKING_STOP_PIN_SIZE_PX}px`,
    "border-radius:50%",
    `background:${bg}`,
    "border:2px solid #ffffff",
    "box-shadow:0 2px 8px rgba(0,0,0,0.35)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "position:relative",
    "overflow:visible",
    "isolation:isolate",
    "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:12px",
    "font-weight:700",
    "color:#ffffff",
    "line-height:1",
    "cursor:pointer",
    "box-sizing:border-box",
    "user-select:none",
    "pointer-events:auto",
  ].join(";");
  if (tooltip?.title) {
    el.setAttribute("aria-label", buildMarkerAriaLabel(tooltip));
    appendHoverTooltip(el, tooltip);
  }
  return el;
}

/**
 * Live tracking map markers using {@link google.maps.marker.AdvancedMarkerElement}
 * (avoids deprecated {@link google.maps.Marker}).
 */
export default function LiveTrackingAdvancedMarkers({
  stopMarkers,
  selectedStopId,
  onStopMarkerClick,
  vehicleMarkers,
  onVehicleClick,
}) {
  const map = useGoogleMap();
  const stopMarkersRef = useRef([]);
  const vehicleMarkersRef = useRef(new Map());
  const onStopMarkerClickRef = useRef(onStopMarkerClick);
  const onVehicleClickRef = useRef(onVehicleClick);
  onStopMarkerClickRef.current = onStopMarkerClick;
  onVehicleClickRef.current = onVehicleClick;

  useEffect(() => {
    if (!map || typeof window === "undefined") return undefined;
    if (!window.google?.maps?.importLibrary) return undefined;

    let cancelled = false;

    const run = async () => {
      const { AdvancedMarkerElement } = await google.maps.importLibrary(
        "marker"
      );
      if (cancelled) return;

      stopMarkersRef.current.forEach(({ marker, detach }) => {
        detach?.();
        marker.map = null;
      });
      stopMarkersRef.current = [];

      stopMarkers.forEach((s) => {
        const selected = s.id === selectedStopId;
        const content = createStopPinElement(s.label, selected, s.tooltip);
        const baseZIndex = selected ? STOP_SELECTED_Z_INDEX : STOP_MARKER_Z_INDEX;
        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: s.lat, lng: s.lng },
          content,
          zIndex: baseZIndex,
        });
        const onGmpClick = () =>
          onStopMarkerClickRef.current?.({
            id: s.id,
            driverId: s.driverId,
          });
        marker.addEventListener("gmp-click", onGmpClick);
        const detachHover = wireMarkerHoverElevation(marker, content, baseZIndex);
        stopMarkersRef.current.push({
          marker,
          detach: () => {
            detachHover();
            marker.removeEventListener("gmp-click", onGmpClick);
          },
        });
      });
    };

    run();

    return () => {
      cancelled = true;
      stopMarkersRef.current.forEach(({ marker, detach }) => {
        detach?.();
        marker.map = null;
      });
      stopMarkersRef.current = [];
    };
  }, [map, stopMarkers, selectedStopId]);

  useEffect(() => {
    if (!map || typeof window === "undefined") return undefined;
    if (!window.google?.maps?.importLibrary) return undefined;

    let cancelled = false;

    const run = async () => {
      const { AdvancedMarkerElement } = await google.maps.importLibrary(
        "marker"
      );
      if (cancelled) return;

      const seen = new Set();
      for (const vm of vehicleMarkers) {
        seen.add(vm.id);
        const existing = vehicleMarkersRef.current.get(vm.id);
        const color = vm.color || "#2563eb";
        const label = vm.label || "";
        const tooltip = vm.tooltip || null;
        const tooltipKey = vehicleTooltipKey(tooltip);
        if (!existing) {
          const content = createVehicleMarkerElement(color, label, tooltip);
          const marker = new AdvancedMarkerElement({
            map,
            position: vm.position,
            content,
            zIndex: VEHICLE_MARKER_Z_INDEX,
          });
          const onGmpClick = () => onVehicleClickRef.current?.(vm.id);
          marker.addEventListener("gmp-click", onGmpClick);
          const detachHover = wireMarkerHoverElevation(
            marker,
            content,
            VEHICLE_MARKER_Z_INDEX
          );
          vehicleMarkersRef.current.set(vm.id, {
            marker,
            onGmpClick,
            detachHover,
            color,
            label,
            tooltipKey,
          });
        } else {
          existing.marker.position = vm.position;
          if (
            existing.color !== color ||
            existing.label !== label ||
            existing.tooltipKey !== tooltipKey
          ) {
            existing.detachHover?.();
            const content = createVehicleMarkerElement(
              color,
              label,
              tooltip
            );
            existing.marker.content = content;
            existing.detachHover = wireMarkerHoverElevation(
              existing.marker,
              content,
              VEHICLE_MARKER_Z_INDEX
            );
            existing.color = color;
            existing.label = label;
            existing.tooltipKey = tooltipKey;
          }
        }
      }

      for (const [id, { marker, onGmpClick, detachHover }] of vehicleMarkersRef.current) {
        if (!seen.has(id)) {
          detachHover?.();
          marker.removeEventListener("gmp-click", onGmpClick);
          marker.map = null;
          vehicleMarkersRef.current.delete(id);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [map, vehicleMarkers]);

  useEffect(
    () => () => {
      for (const [, { marker, onGmpClick, detachHover }] of vehicleMarkersRef.current) {
        detachHover?.();
        marker.removeEventListener("gmp-click", onGmpClick);
        marker.map = null;
      }
      vehicleMarkersRef.current.clear();
    },
    []
  );

  return null;
}
