export interface LegendItem {
  color: string;
  label: string;
  value: string;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="legend">
      {items.map((item) => (
        <div className="leg" key={item.label}>
          <span className="sw" style={{ background: item.color }} />
          {item.label}
          <span className="v">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
