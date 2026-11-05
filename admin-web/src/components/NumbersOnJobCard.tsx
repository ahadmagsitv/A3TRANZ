import { Camera, Hash, Info } from "lucide-react";
import type { Job } from "@/data/contracts/jobs";

export function NumbersOnJobCard({ job, bare = false }: { job: Job; bare?: boolean }) {
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
