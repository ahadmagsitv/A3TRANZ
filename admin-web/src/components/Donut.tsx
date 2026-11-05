export interface DonutSegment {
  color: string;
  value: number;
}

export function Donut({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const stops = segments
    .map((s, i) => {
      const before = segments.slice(0, i).reduce((sum, p) => sum + p.value, 0);
      const from = (before / total) * 100;
      const to = ((before + s.value) / total) * 100;
      return `${s.color} ${from}% ${to}%`;
    })
    .join(",");
  return <div className="donut" style={{ background: `conic-gradient(${stops})` }} />;
}
