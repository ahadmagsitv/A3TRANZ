// Thin Server Component wrapper. This Next version rejects
// `generateStaticParams` inside a "use client" page — the real page moved to CustomerDetailClient.tsx
// unchanged; this file is the Server Component boundary.
import CustomerDetailClient from "./CustomerDetailClient";


export default function CustomerDetailPage(props: PageProps<"/customers/[id]">) {
  return <CustomerDetailClient params={props.params} />;
}
