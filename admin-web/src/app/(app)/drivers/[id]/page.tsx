import DriverDetailClient from "./DriverDetailClient";

export default function DriverDetailPage(props: PageProps<"/drivers/[id]">) {
  return <DriverDetailClient params={props.params} />;
}
