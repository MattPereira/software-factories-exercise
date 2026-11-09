import {
  data,
  isRouteErrorResponse,
  Link,
  redirect,
  useFetcher,
} from "react-router";
import { z } from "zod";
import type { Route } from "./+types/admin.refunds";
import { requireAdmin } from "~/lib/access.server";
import { parseFormData } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import {
  RefundDecisionError,
  approveRefundRequest,
  declineRefundRequest,
  listOpenRefundRequests,
  type RefundDecisionErrorCode,
} from "~/lib/refund-decisions.server";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { AlertTriangle, Undo2 } from "lucide-react";

const refundDecisionActionSchema = z.object({
  intent: z.enum(["approve", "decline"]),
  refundRequestId: z.coerce.number().int(),
});

const errorStatus: Record<RefundDecisionErrorCode, number> = {
  "not-found": 404,
  "not-open": 409,
  "not-admin": 403,
};

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Decide Open Refund Requests" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return { openRefundRequests: listOpenRefundRequests() };
}

export async function action({ request }: Route.ActionArgs) {
  const { userId } = await requireAdmin(request);

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundDecisionActionSchema);

  if (!parsed.success) {
    throw data(Object.values(parsed.errors)[0] ?? "Invalid input.", {
      status: 400,
    });
  }

  const { intent, refundRequestId } = parsed.data;
  const decide =
    intent === "approve" ? approveRefundRequest : declineRefundRequest;

  try {
    decide(refundRequestId, userId);
  } catch (error) {
    if (error instanceof RefundDecisionError) {
      throw data(error.message, { status: errorStatus[error.code] });
    }
    throw error;
  }

  throw redirect("/admin/refunds");
}

function OpenRefundRequestRow({
  refundRequest,
}: {
  refundRequest: Route.ComponentProps["loaderData"]["openRefundRequests"][number];
}) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const pendingIntent = fetcher.formData?.get("intent");

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3">
        <div className="text-sm font-medium">{refundRequest.learnerName}</div>
        <div className="text-sm text-muted-foreground">
          {refundRequest.learnerEmail}
        </div>
      </td>
      <td className="px-4 py-3 text-sm">{refundRequest.courseTitle}</td>
      <td className="px-4 py-3 text-sm">
        {formatPrice(refundRequest.amountPaid)}
      </td>
      <td className="max-w-sm px-4 py-3 text-sm">{refundRequest.reason}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {new Date(refundRequest.requestedAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <fetcher.Form method="post" className="flex gap-2">
          <input
            type="hidden"
            name="refundRequestId"
            value={refundRequest.id}
          />
          <Button
            type="submit"
            name="intent"
            value="approve"
            size="sm"
            disabled={busy}
          >
            {busy && pendingIntent === "approve" ? "Approving..." : "Approve"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="decline"
            variant="outline"
            size="sm"
            disabled={busy}
          >
            {busy && pendingIntent === "decline" ? "Declining..." : "Decline"}
          </Button>
        </fetcher.Form>
      </td>
    </tr>
  );
}

const columns = ["Learner", "Course", "Paid", "Reason", "Requested", "Actions"];

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { openRefundRequests } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refund Requests</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          Open Refund Requests waiting on a decision, oldest first
        </p>
      </div>

      {openRefundRequests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Undo2 className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No Open Refund Requests. Nothing to decide right now.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {columns.map((column) => (
                      <th
                        key={column}
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {openRefundRequests.map((refundRequest) => (
                    <OpenRefundRequestRow
                      key={refundRequest.id}
                      refundRequest={refundRequest}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading Refund Requests.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only admins can access this page.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
