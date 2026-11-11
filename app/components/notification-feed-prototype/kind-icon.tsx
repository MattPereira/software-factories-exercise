// PROTOTYPE — throwaway.
import {
  CircleCheck,
  CircleX,
  MessageCircleQuestion,
  MessageSquareReply,
  Receipt,
  UserPlus,
  Armchair,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type { NotificationKind } from "./use-feed";

const ICONS: Record<NotificationKind, [typeof Receipt, string]> = {
  refund_approved: [CircleCheck, "text-green-600 bg-green-500/10"],
  refund_declined: [CircleX, "text-red-600 bg-red-500/10"],
  refund_request_opened: [Receipt, "text-amber-600 bg-amber-500/10"],
  seat_claimed: [Armchair, "text-sky-600 bg-sky-500/10"],
  enrollment_created: [UserPlus, "text-violet-600 bg-violet-500/10"],
  discussion_question: [MessageCircleQuestion, "text-primary bg-primary/10"],
  discussion_reply: [MessageSquareReply, "text-primary bg-primary/10"],
};

export function KindIcon({
  kind,
  className,
}: {
  kind: NotificationKind;
  className?: string;
}) {
  const [Icon, tone] = ICONS[kind];
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        tone,
        className
      )}
    >
      <Icon className="size-4" />
    </div>
  );
}
