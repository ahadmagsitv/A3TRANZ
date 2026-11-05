import { Suspense } from "react";
import PayrollPeriodClient from "./PayrollPeriodClient";

export default function PayrollPeriodPage(props: PageProps<"/payroll/[id]">) {
  return (
    <Suspense>
      <PayrollPeriodClient params={props.params} />
    </Suspense>
  );
}
