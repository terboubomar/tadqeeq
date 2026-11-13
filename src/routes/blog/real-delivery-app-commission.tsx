import { createFileRoute } from "@tanstack/react-router";

import { BlogPostPage } from "@/components/blog/BlogPages";
import { blogPostBySlug } from "@/lib/blog";
import { blogPostHead } from "@/lib/blog-seo";

const post = blogPostBySlug("real-delivery-app-commission");

export const Route = createFileRoute("/blog/real-delivery-app-commission")({
  head: () => blogPostHead(post),
  component: () => <BlogPostPage post={post} />,
});
