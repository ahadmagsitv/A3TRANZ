// Thin Server Component wrapper — see customers/[id]/page.tsx for why.
import DriverDetailClient from "./DriverDetailClient";


export default function DriverDetailPage(props: PageProps<"/drivers/[id]">) {
  return <DriverDetailClient params={props.params} />;
}
