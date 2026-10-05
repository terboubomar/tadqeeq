import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal/LegalPage";
import { legalDoc } from "@/lib/legal";
import { legalHead } from "@/lib/legal-seo";

const doc = legalDoc("refunds");

export const Route = createFileRoute("/refund-policy")({
  head: () => legalHead(doc),
  component: () => <LegalPage doc={doc} />,
});
