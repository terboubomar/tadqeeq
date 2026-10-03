import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { EXPLAINER_DURATION, ExplainerFilm } from "@/components/film/ExplainerFilm";
import type { FilmFormat } from "@/components/film/kit";

export const Route = createFileRoute("/explainer")({
  validateSearch: (s: Record<string, unknown>) => ({ t: Number(s["t"] ?? -1), format: (s["format"] === "tall" ? "tall" : "wide") as FilmFormat }),
  component: ExplainerPage,
});

function ExplainerPage() {
  const { t, format } = Route.useSearch();
  const [now, setNow] = useState(t >= 0 ? t : 0);
  useEffect(() => {
    const w = window as unknown as { __setT?: (v: number) => void };
    w.__setT = setNow;
    if (t >= 0) return;
    const start = performance.now();
    let id = 0;
    const tick = () => {
      setNow(((performance.now() - start) / 1000) % EXPLAINER_DURATION);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [t]);
  return (
    <div style={{ margin: 0 }}>
      <ExplainerFilm t={now} format={format} />
    </div>
  );
}
