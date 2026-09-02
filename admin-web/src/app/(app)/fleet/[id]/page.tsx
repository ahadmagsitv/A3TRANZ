// Thin Server Component wrapper — see customers/[id]/page.tsx for why.
import FleetUnitClient from "./FleetUnitClient";


export default function FleetUnitPage(props: PageProps<"/fleet/[id]">) {
  return <FleetUnitClient params={props.params} />;
}
