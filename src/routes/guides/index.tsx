import { createFileRoute } from "@tanstack/react-router";

import { GuidesIndexPage } from "@/components/guides/GuidePages";
import { guidesIndexHead } from "@/lib/guides-seo";

export const Route = createFileRoute("/guides/")({
  head: guidesIndexHead,
  component: GuidesIndexPage,
});
