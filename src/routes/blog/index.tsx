import { createFileRoute } from "@tanstack/react-router";

import { BlogIndexPage } from "@/components/blog/BlogPages";
import { blogIndexHead } from "@/lib/blog-seo";

export const Route = createFileRoute("/blog/")({
  head: blogIndexHead,
  component: BlogIndexPage,
});
