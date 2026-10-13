import { MotionConfig } from "motion/react";
import { forwardRef, useRef, type ReactNode } from "react";

import { LogoMark } from "@/components/brand/Logo";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { cn } from "@/lib/utils";

/** AI assistants that can connect to Tadqeeq over MCP; logos from LobeHub Icons (public/ai/LICENSE.txt). */
const START_SIDE = [
  { name: "Claude", logo: "/ai/claude.svg" },
  { name: "ChatGPT", logo: "/ai/chatgpt.svg" },
  { name: "Grok", logo: "/ai/grok.svg" },
];
const END_SIDE = [
  { name: "Gemini", logo: "/ai/gemini.svg" },
  { name: "Mistral", logo: "/ai/mistral.svg" },
  { name: "Perplexity", logo: "/ai/perplexity.svg" },
];

/** Tadqeeq's colours for the travelling light: the amber accent fading into a lighter amber. */
const BEAM = { gradientStartColor: "#c8862f", gradientStopColor: "#f1c27d", pathColor: "#f6f1e7", pathOpacity: 0.18 };

const Node = forwardRef<HTMLDivElement, { className?: string; label: string; children: ReactNode }>(function Node(
  { className, label, children },
  ref,
) {
  return (
    <div className="z-10 flex flex-col items-center gap-2">
      <div
        ref={ref}
        className={cn(
          "grid size-12 place-items-center rounded-full border border-ink-foreground/10 bg-card p-2.5 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.6)] sm:size-14 sm:p-3",
          className,
        )}
      >
        {children}
      </div>
      <span className="text-[11px] font-medium text-ink-muted sm:text-xs">{label}</span>
    </div>
  );
});

/**
 * Tadqeeq in the middle with the AI assistants around it, each joined to it by an animated beam (21st.dev
 * «Animated Beam»). The beams flow in from the start side and out to the end side; they stop for reduced motion.
 */
export function AssistantBeams() {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const startRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const endRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const curves = [-60, 0, 60];
  const offsets = [-10, 0, 10];

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={containerRef}
        dir="ltr"
        className="relative flex h-[340px] w-full items-center justify-center overflow-hidden rounded-[24px] border border-ink-foreground/10 bg-ink-foreground/[0.03] px-4 sm:h-[400px] sm:px-10"
      >
        <div className="flex size-full max-w-lg items-center justify-between">
          <div className="flex h-full flex-col justify-center gap-7 sm:gap-9">
            {START_SIDE.map((ai, i) => (
              <Node key={ai.name} ref={startRefs[i]} label={ai.name}>
                <img src={ai.logo} alt="" width={32} height={32} className="size-full object-contain" />
              </Node>
            ))}
          </div>

          <Node ref={centerRef} label="تدقيق" className="size-20 p-4 ring-4 ring-primary/45 sm:size-24 sm:p-5">
            <LogoMark className="h-auto w-full text-ink" />
          </Node>

          <div className="flex h-full flex-col justify-center gap-7 sm:gap-9">
            {END_SIDE.map((ai, i) => (
              <Node key={ai.name} ref={endRefs[i]} label={ai.name}>
                <img src={ai.logo} alt="" width={32} height={32} className="size-full object-contain" />
              </Node>
            ))}
          </div>
        </div>

        {startRefs.map((ref, i) => (
          <AnimatedBeam
            key={`s${i}`}
            containerRef={containerRef}
            fromRef={ref}
            toRef={centerRef}
            curvature={curves[i]}
            endYOffset={offsets[i]}
            duration={4.5 + i * 0.6}
            {...BEAM}
          />
        ))}
        {endRefs.map((ref, i) => (
          <AnimatedBeam
            key={`e${i}`}
            containerRef={containerRef}
            fromRef={ref}
            toRef={centerRef}
            curvature={curves[i]}
            endYOffset={offsets[i]}
            duration={4.8 + i * 0.6}
            reverse
            {...BEAM}
          />
        ))}
      </div>
    </MotionConfig>
  );
}
