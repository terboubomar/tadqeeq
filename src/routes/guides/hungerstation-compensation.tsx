import { createFileRoute } from "@tanstack/react-router";

import { GuidePage } from "@/components/guides/GuidePages";
import { guideBySlug } from "@/lib/guides";
import { guideHead } from "@/lib/guides-seo";

const guide = guideBySlug("hungerstation-compensation");

export const Route = createFileRoute("/guides/hungerstation-compensation")({
  head: () => guideHead(guide),
  component: () => <GuidePage guide={guide} />,
});
