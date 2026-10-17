import { createFileRoute } from "@tanstack/react-router";

import { GuidePage } from "@/components/guides/GuidePages";
import { guideBySlug } from "@/lib/guides";
import { guideHead } from "@/lib/guides-seo";

const guide = guideBySlug("accounting-integrations");

export const Route = createFileRoute("/guides/accounting-integrations")({
  head: () => guideHead(guide),
  component: () => <GuidePage guide={guide} />,
});
