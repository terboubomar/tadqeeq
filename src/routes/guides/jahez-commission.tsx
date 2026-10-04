import { createFileRoute } from "@tanstack/react-router";

import { GuidePage } from "@/components/guides/GuidePages";
import { guideBySlug } from "@/lib/guides";
import { guideHead } from "@/lib/guides-seo";

const guide = guideBySlug("jahez-commission");

export const Route = createFileRoute("/guides/jahez-commission")({
  head: () => guideHead(guide),
  component: () => <GuidePage guide={guide} />,
});
