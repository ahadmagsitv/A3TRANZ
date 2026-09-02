// Thin Server Component wrapper — see customers/[id]/page.tsx for why.
// The Suspense boundary is required by `useSearchParams()` inside
// PayrollPeriodClient (the `?confirm=1` deep link).
import { Suspense } from "react";
import PayrollPeriodClient from "./PayrollPeriodClient";


export default function PayrollPeriodPage(props: PageProps<"/payroll/[id]">) {
  return (
    <Suspense>
      <PayrollPeriodClient params={props.params} />
    </Suspense>
  );
}
