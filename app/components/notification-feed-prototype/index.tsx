// PROTOTYPE — throwaway. Three Notification Feed variants mounted in the app layout,
// switchable via ?variant=A|B|C on any page inside the layout.
import { useSearchParams } from "react-router";
import { useFeed, type FeedConfig } from "./use-feed";
import { VariantA, name as nameA } from "./variant-a";
import { VariantB, name as nameB } from "./variant-b";
import { VariantC, name as nameC } from "./variant-c";

export const NOTIFICATION_FEED_VARIANTS = [
  { key: "A", name: nameA },
  { key: "B", name: nameB },
  { key: "C", name: nameC },
];

export function useNotificationFeedPrototype(config: FeedConfig | null) {
  const [params] = useSearchParams();
  const variant = params.get("variant") ?? "A";
  const feed = useFeed(config);
  if (!config) return { variant, headerAction: null, navExtra: null };
  return {
    variant,
    headerAction: variant === "A" ? <VariantA feed={feed} /> : null,
    navExtra:
      variant === "B" ? <VariantB feed={feed} /> : variant === "C" ? <VariantC feed={feed} /> : null,
  };
}
