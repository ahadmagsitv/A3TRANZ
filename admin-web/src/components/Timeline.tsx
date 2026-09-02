// .timeline / .tl-i — dot colour by tone (plan W-07a).
import type { TimelineEvent } from "@/data/contracts/jobs";

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="timeline">
      {events.map((e) => (
        <div key={e.id} className={`tl-i c-${e.tone}`}>
          <div className="tl-t">{e.title}</div>
          <div className="tl-m">{e.meta}</div>
        </div>
      ))}
    </div>
  );
}
