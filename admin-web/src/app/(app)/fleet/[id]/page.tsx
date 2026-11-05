import FleetUnitClient from "./FleetUnitClient";

export default function FleetUnitPage(props: PageProps<"/fleet/[id]">) {
  return <FleetUnitClient params={props.params} />;
}
