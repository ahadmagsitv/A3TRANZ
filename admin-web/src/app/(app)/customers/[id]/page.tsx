import CustomerDetailClient from "./CustomerDetailClient";

export default function CustomerDetailPage(props: PageProps<"/customers/[id]">) {
  return <CustomerDetailClient params={props.params} />;
}
