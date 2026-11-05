export function Skeleton({ width = "100%", height = 12 }: { width?: number | string; height?: number }) {
  return <div className="skel" style={{ width, height }} />;
}
