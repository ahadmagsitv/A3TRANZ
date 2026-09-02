// "Numbers on this job" — container no. (office, on the job card) + seal no.
// (driver, at Confirm pickup — a real captured value per plan §8 Q1) + the
// disclosure that J1/chassis-return tickets are photographed, never keyed.
// Shared by the job detail page (W5) and the approve modal (W22) — same
// card, two call sites.
import { Camera, Hash, Info } from "lucide-react";
import type { Job } from "@/data/contracts/jobs";

export function NumbersOnJobCard({ job, bare = false }: { job: Job; bare?: boolean }) {
  // The two frames specify slightly different spacing in the gallery: W5's
  // card (bare=false) zeroes the second `.evid`'s bottom margin and gives the
  // toast marginTop:14; W22's modal (bare=true) keeps both `.evid` rows at
  // their default margin-bottom:8px and gives the toast `margin:0 0 18px`.
  // Ported verbatim per context rather than forcing one spacing on both.
  const body = (
    <>
      <div className="evid">
        <span className="eic">
          <Hash />
        </span>
        <div className="eb">
          <div className="el">Container no. · office, on the job card</div>
          <div className="ev">{job.containerNo}</div>
        </div>
      </div>
      <div className="evid" style={bare ? undefined : { marginBottom: 0 }}>
        <span className="eic">
          <Hash />
        </span>
        <div className="eb">
          <div className="el">Seal no. · driver, at Confirm pickup</div>
          <div className="ev">{job.sealNo ?? "Not captured yet"}</div>
        </div>
        {job.sealNo && (
          <span className="eshot">
            <Camera />
          </span>
        )}
      </div>
      <div className="toast toast-info" style={bare ? { marginTop: 0, marginBottom: 18 } : { marginTop: 14 }}>
        <Info />
        <span>
          J1 and chassis return tickets are captured as <b>photos</b> at Confirm delivery — their numbers are not
          keyed in the app.
        </span>
      </div>
    </>
  );

  if (bare) return body;

  return (
    <div className="card">
      <div className="card-h">
        <h3>Numbers on this job</h3>
      </div>
      <div style={{ padding: "18px 20px" }}>{body}</div>
    </div>
  );
}
