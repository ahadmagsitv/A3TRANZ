// Thin Server Component wrapper — see customers/[id]/page.tsx for why.
// The Suspense boundary is required by `useSearchParams()` inside
// JobDetailClient (the `?view=chat` toggle).
import { Suspense } from "react";
import JobDetailClient from "./JobDetailClient";


export default function JobDetailPage(props: PageProps<"/jobs/[id]">) {
  return (
    <Suspense>
      <JobDetailClient params={props.params} />
    </Suspense>
  );
}
