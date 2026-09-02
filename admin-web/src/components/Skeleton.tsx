// .skel — shimmer via the shared `shim` keyframe (plan §1.6, W3-loading).
export function Skeleton({ width = "100%", height = 12 }: { width?: number | string; height?: number }) {
  return <div className="skel" style={{ width, height }} />;
}
