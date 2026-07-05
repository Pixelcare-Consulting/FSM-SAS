import { useEffect, useRef } from "react";
import { useGoogleMap } from "@react-google-maps/api";

function getTechnicianMarkerOffset(index, total) {
  if (total <= 1) return { lat: 0, lng: 0 };
  const angle = (2 * Math.PI * index) / total;
  const radius = 0.0001;
  return {
    lat: radius * Math.cos(angle),
    lng: radius * Math.sin(angle),
  };
}

function buildMarkersDepsSignature({
  location,
  jobMapLabel,
  assignedTechnicians,
  technicianLocations,
}) {
  const techs = (assignedTechnicians || []).map((technician, index) => {
    const techId = technician.technician_id || technician.id;
    const data = technicianLocations?.[techId];
    return [techId, index, data];
  });
  return JSON.stringify({
    lat: location?.lat,
    lng: location?.lng,
    jobMapLabel,
    techs,
  });
}

export function computeTechnicianMapPosition(
  technician,
  index,
  assignedTechnicians,
  baseJobLocation,
  technicianLocations
) {
  const techId = technician.technician_id || technician.id;
  const techLocationData = technicianLocations?.[techId];
  let techLocation;
  if (techLocationData?.current_latitude && techLocationData?.current_longitude) {
    techLocation = {
      lat: parseFloat(techLocationData.current_latitude),
      lng: parseFloat(techLocationData.current_longitude),
    };
  } else if (
    techLocationData?.destination_latitude &&
    techLocationData?.destination_longitude
  ) {
    techLocation = {
      lat: parseFloat(techLocationData.destination_latitude),
      lng: parseFloat(techLocationData.destination_longitude),
    };
  } else {
    const offset = getTechnicianMarkerOffset(index, assignedTechnicians.length);
    techLocation = {
      lat: baseJobLocation.lat + offset.lat,
      lng: baseJobLocation.lng + offset.lng,
    };
  }
  return { techId, techLocation, techLocationData };
}

export default function JobDetailsAdvancedMarkers({
  location,
  jobMapLabel,
  assignedTechnicians,
  technicianLocations,
  setSelectedMarker,
}) {
  const map = useGoogleMap();
  const markersRef = useRef([]);
  const markersDepsSig = buildMarkersDepsSignature({
    location,
    jobMapLabel,
    assignedTechnicians,
    technicianLocations,
  });

  useEffect(() => {
    if (!map || typeof window === "undefined") return undefined;

    let cancelled = false;

    const run = async () => {
      if (!window.google?.maps?.importLibrary) return;
      const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
      if (cancelled) return;

      markersRef.current.forEach(({ marker, detach }) => {
        detach?.();
        marker.map = null;
      });
      markersRef.current = [];

      const jobPin = new PinElement({
        background: "#FF0000",
        borderColor: "#FFFFFF",
        glyphColor: "#FFFFFF",
      });
      const jobMarker = new AdvancedMarkerElement({
        map,
        position: location,
        content: jobPin,
        title: jobMapLabel,
      });
      const onJobGmpClick = () =>
        setSelectedMarker({ type: "job", position: location });
      jobMarker.addEventListener("gmp-click", onJobGmpClick);
      markersRef.current.push({
        marker: jobMarker,
        detach: () => jobMarker.removeEventListener("gmp-click", onJobGmpClick),
      });

      (assignedTechnicians || []).forEach((technician, index) => {
        const { techId, techLocation } = computeTechnicianMapPosition(
          technician,
          index,
          assignedTechnicians,
          location,
          technicianLocations
        );
        const techName = technician.full_name || technician.fullName || "Technician";
        const techStatus = technician.assignment_status || "ASSIGNED";

        const pin = new PinElement({
          background: "#4285F4",
          borderColor: "#FFFFFF",
          glyphColor: "#FFFFFF",
        });
        const marker = new AdvancedMarkerElement({
          map,
          position: techLocation,
          content: pin,
          title: `${techName} - ${techStatus}`,
        });
        const onTechGmpClick = () =>
          setSelectedMarker({
            type: "technician",
            techId,
            position: techLocation,
          });
        marker.addEventListener("gmp-click", onTechGmpClick);
        markersRef.current.push({
          marker,
          detach: () => marker.removeEventListener("gmp-click", onTechGmpClick),
        });
      });
    };

    run();

    return () => {
      cancelled = true;
      markersRef.current.forEach(({ marker, detach }) => {
        detach?.();
        marker.map = null;
      });
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markersDepsSig encodes location, job label, technicians, and tracked coords
  }, [map, markersDepsSig, setSelectedMarker]);

  return null;
}
