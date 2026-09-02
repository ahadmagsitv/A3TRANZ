// .bars / .bar — flex <div> columns. No chart library (plan §1.6 / §2.2).
export interface BarItem {
  label: string;
  value: number;
  displayValue: string;
}

export function Bars({ items, max }: { items: BarItem[]; max?: number }) {
  const peak = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="bars">
      {items.map((item) => (
        <div className="bar" key={item.label}>
          <span className="bv">{item.displayValue}</span>
          <div className="col" style={{ height: `${(item.value / peak) * 100}%` }} />
          <span className="bl">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
