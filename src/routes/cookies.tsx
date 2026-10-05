import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal/LegalPage";
import { legalDoc } from "@/lib/legal";
import { legalHead } from "@/lib/legal-seo";

const doc = legalDoc("cookies");

export const Route = createFileRoute("/cookies")({
  head: () => legalHead(doc),
  component: () => <LegalPage doc={doc} />,
});
