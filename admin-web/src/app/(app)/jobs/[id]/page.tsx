import { Suspense } from "react";
import JobDetailClient from "./JobDetailClient";

export default function JobDetailPage(props: PageProps<"/jobs/[id]">) {
  return (
    <Suspense>
      <JobDetailClient params={props.params} />
    </Suspense>
  );
}
