import { useEffect, useRef } from "react";

/**
 * Reveals `[data-reveal]` elements inside the returned ref as they scroll into view (marks them `data-shown`), for
 * the homepage and product pages. The 3D tilt-in itself is CSS (`.lp-ready [data-reveal]` in styles.css). Content
 * stays visible without JS, and reduced motion shows everything at once.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const rootRef = useRef<T>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-shown", "");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) el.setAttribute("data-shown", "");
      else observer.observe(el);
    });
    root.classList.add("lp-ready");
    return () => observer.disconnect();
  }, []);
  return rootRef;
}
