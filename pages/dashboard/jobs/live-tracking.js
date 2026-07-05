import dynamic from "next/dynamic";
import { Fragment } from "react";
import { GeeksSEO } from "widgets";

const LiveTrackingDashboard = dynamic(
  () => import("./_components/LiveTrackingDashboard"),
  { ssr: false }
);

export default function JobsLiveTrackingPage() {
  return (
    <Fragment>
      <GeeksSEO title="Live job tracking | SAS&ME | Portal" />
      <LiveTrackingDashboard />
    </Fragment>
  );
}
