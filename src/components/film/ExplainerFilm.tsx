import { Bot, Check, FileSpreadsheet, FileText, Play, Search, ShieldCheck, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { LogoLockup, LogoWordmark } from "@/components/brand/Logo";
import { PlatformIcon } from "@/components/brand/PlatformLogo";

import { C, clamp, Counter, DISPLAY_FONT, Eyebrow, FILM_SIZE, type FilmFormat, nf, Rise, scene, span } from "./kit";

/**
 * The Tadqeeq explainer (about 2.5 minutes): how an audit works, the Telegram compensation-evidence
 * workflow step by step, then ads, Smart Watch, AI and the close. A pure function of time like the
 * brand film. The problem and ads figures are real (one restaurant, August 2026, no names); the
 * compensation result is an illustrative example and is labelled as such on screen.
 */

export const EXPLAINER_DURATION = 154;

const REAL = { commission: 367_483, discounts: 260_780, adSpend: 50_237, platformRoas: 7.15, adProfit: 155_131 };

/** Illustrative only (shown with "مثال توضيحي"). */
const EXAMPLE = { branches: 12, cases: 214, deducted: 18_640, withEvidence: 152, recovered: 9_870 };

const ORDER = "58213";
const ORDER_FROM_RECEIPT = "58214";
const TG = "oklch(0.62 0.13 240)";

/** Voice-over lines, timed to the scenes; shown as captions and exported as the recording script. */
export const EXPLAINER_SCRIPT: Array<[number, number, string]> = [
  [4.2, 9.4, "كل شهر، المنصات تخصم من مطعمك مبالغ كبيرة."],
  [9.6, 14.8, "في مطعم واحد بس: ٣٦٧ ألف ريال عمولة، و٢٦٠ ألف خصومات… مين راجع هالأرقام؟"],
  [15.2, 24.8, "تدقيق يراجعها عنك. ترفع ملف الطلبات وفاتورة المنصة: هنقرستيشن، كيتا أو جاهز."],
  [25.2, 34.8, "وتدقيق يعيد حساب كل بند من جديد: العمولة، رسوم الدفع، الحملات، والتعويضات."],
  [35.2, 43.8, "وأي فرق يطلع لك باسم الفرع والمبلغ، ويصير استثناء له مسؤول وحالة، لين يتقفّل."],
  [44.2, 51.8, "وأكبر تسريب؟ التعويضات. المنصة تخصم تعويض لعميل… وأنت ما عندك دليل."],
  [52.2, 63.8, "هنا يجي دور تليجرام: تضيف بوت تدقيق لقروب الفرع، وتربطه بكود واحد."],
  [64.2, 70.8, "الكاشير يصوّر الطلب والفاتورة قبل ما يطلع، ويرسلها في القروب."],
  [71.2, 77.8, "وتدقيق يقرأ رقم الطلب من التعليق، أو من صورة الفاتورة بالذكاء الاصطناعي."],
  [78.2, 86.8, "ولما يجيك خصم تعويض، موظفك يبحث برقم الطلب، ويلقى الفيديو."],
  [87.2, 95.8, "ويطلع له طلب مراجعة جاهز بالعربي والإنجليزي. والفيديوهات تبقى في تليجرام."],
  [96.2, 109.8, "مثال: في شهر واحد، خصومات تعويض بـ ١٨ ألف ريال… ورجع منها قرابة ١٠ آلاف بالدليل."],
  [110.2, 121.8, "وفي الإعلانات: تدقيق يحسب الربح الحقيقي بعد العمولة والخصومات، ويقول لك أي حملة توقفها."],
  [122.2, 133.8, "والمراقب الذكي ينبّهك لأي رسوم غير معتادة. ولو المنصة غيّرت ملفها، تدقيق يفهم التغيير."],
  [134.2, 145.8, "واسأل Tadqeeq AI عن أي رقم. كل رقم من محرك محاسبي ثابت، وبيانات كل شركة منفصلة."],
  [146.4, 153.6, "تدقيق. لا تدفع فاتورة المنصة قبل ما تتأكد منها."],
];

/** Text typed out between `start` and `start + duration`, with a caret while typing. */
function Typed({ t, start, duration, text }: { t: number; start: number; duration: number; text: string }) {
  const shown = Math.round(text.length * clamp((t - start) / duration));
  return (
    <>
      {text.slice(0, shown)}
      {t >= start && shown < text.length ? <span style={{ color: C.gold }}>▍</span> : null}
    </>
  );
}

function Pop({ t, at, children, style }: { t: number; at: number; children: ReactNode; style?: CSSProperties }) {
  const p = span(t, at, 0.45);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px) scale(${0.94 + 0.06 * p})`, transformOrigin: "bottom", ...style }}>{children}</div>;
}

/** A Telegram-style branch group on a phone. */
function Phone({ tall, title, children }: { tall: boolean; title: string; children: ReactNode }) {
  const w = tall ? 640 : 560;
  const h = tall ? 1000 : 860;
  return (
    <div style={{ width: w, height: h, borderRadius: 64, background: C.ink, padding: 16, boxShadow: "0 30px 80px -30px oklch(0.22 0.027 218 / 0.55)", flexShrink: 0 }}>
      <div style={{ height: "100%", borderRadius: 50, overflow: "hidden", background: "oklch(0.95 0.015 220)", display: "flex", flexDirection: "column" }}>
        <div style={{ background: TG, color: "white", padding: "34px 30px 22px", display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ width: 62, height: 62, borderRadius: 999, background: "oklch(1 0 0 / 0.22)", display: "grid", placeItems: "center", fontSize: 28, fontWeight: 800 }}>ع</span>
          <div>
            <p style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.2 }}>{title}</p>
            <p style={{ fontSize: 21, opacity: 0.8 }}>٨ أعضاء · بوت تدقيق</p>
          </div>
        </div>
        <div style={{ flex: 1, padding: "26px 22px", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 16 }}>{children}</div>
      </div>
    </div>
  );
}

function Bubble({ from, children, bot }: { from: "me" | "them"; children: ReactNode; bot?: boolean }) {
  const me = from === "me";
  return (
    <div style={{ display: "flex", justifyContent: me ? "flex-start" : "flex-end" }}>
      <div
        style={{
          maxWidth: "86%",
          background: me ? "oklch(0.93 0.06 145)" : "white",
          borderRadius: me ? "26px 26px 26px 8px" : "26px 26px 8px 26px",
          padding: "16px 22px",
          fontSize: 25,
          lineHeight: 1.5,
          boxShadow: "0 2px 0 oklch(0.85 0.02 220)",
        }}
      >
        {bot ? (
          <p style={{ color: TG, fontSize: 21, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
            <Bot style={{ width: 22, height: 22 }} /> تدقيق
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function SystemNote({ children }: { children: ReactNode }) {
  return (
    <p style={{ alignSelf: "center", background: "oklch(0.22 0.027 218 / 0.35)", color: "white", borderRadius: 999, padding: "6px 20px", fontSize: 21 }}>{children}</p>
  );
}

function VideoThumb({ duration = "0:14" }: { duration?: string }) {
  return (
    <div style={{ position: "relative", width: 330, height: 220, borderRadius: 18, overflow: "hidden", background: `linear-gradient(140deg, ${C.ink2}, oklch(0.4 0.05 60))` }}>
      {/* A packed order: bag and receipt shapes */}
      <div style={{ position: "absolute", insetInlineStart: 60, top: 60, width: 110, height: 120, borderRadius: 14, background: "oklch(0.75 0.07 70)" }} />
      <div style={{ position: "absolute", insetInlineStart: 190, top: 80, width: 70, height: 100, borderRadius: 6, background: "oklch(0.97 0 0)" }} />
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <span style={{ width: 70, height: 70, borderRadius: 999, background: "oklch(0 0 0 / 0.45)", display: "grid", placeItems: "center" }}>
          <Play style={{ width: 34, height: 34, color: "white", fill: "white" }} />
        </span>
      </span>
      <span dir="ltr" style={{ position: "absolute", bottom: 10, insetInlineEnd: 12, background: "oklch(0 0 0 / 0.5)", color: "white", borderRadius: 8, padding: "2px 10px", fontSize: 19 }}>
        {duration}
      </span>
    </div>
  );
}

/** A receipt photo that the AI scans for the order number. */
function Receipt({ t, scanAt }: { t: number; scanAt: number }) {
  const scan = clamp((t - scanAt) / 1.6);
  const found = span(t, scanAt + 1.6, 0.4);
  return (
    <div style={{ position: "relative", width: 300, background: "white", borderRadius: 10, padding: "22px 24px", fontSize: 19, lineHeight: 1.7, color: C.ink, boxShadow: "0 2px 0 oklch(0.85 0.02 220)" }}>
      <p style={{ textAlign: "center", fontWeight: 800, fontSize: 22 }}>فاتورة ضريبية مبسطة</p>
      <p
        dir="ltr"
        style={{
          textAlign: "center",
          fontWeight: 800,
          fontSize: 24,
          margin: "6px 0",
          borderRadius: 6,
          outline: found > 0 ? `3px solid color-mix(in oklch, ${C.gold} ${found * 100}%, transparent)` : undefined,
          background: `color-mix(in oklch, ${C.gold} ${found * 18}%, transparent)`,
        }}
      >
        Order #{ORDER_FROM_RECEIPT}
      </p>
      {["برجر لحم × 2", "بطاطس × 1", "مشروب × 2"].map((line) => (
        <p key={line} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed oklch(0.85 0 0)" }}>
          <span>{line}</span>
        </p>
      ))}
      <p style={{ fontWeight: 800, marginTop: 6 }}>الإجمالي 86.00</p>
      {scan > 0 && scan < 1 ? (
        <div style={{ position: "absolute", insetInline: 0, top: `${scan * 100}%`, height: 4, background: C.gold, boxShadow: `0 0 18px ${C.gold}` }} />
      ) : null}
    </div>
  );
}

function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: C.card, border: `2px solid ${C.border}`, borderRadius: 32, padding: 36, ...style }}>{children}</div>;
}

function Step({ n, t, at, children }: { n: number; t: number; at: number; children: ReactNode }) {
  const p = span(t, at, 0.6);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, opacity: 0.25 + 0.75 * p, transform: `translateX(${(1 - p) * 30}px)` }}>
      <span style={{ width: 58, height: 58, borderRadius: 999, background: p > 0.5 ? C.gold : C.border, color: C.ink, display: "grid", placeItems: "center", fontSize: 28, fontWeight: 800, flexShrink: 0 }}>
        {n}
      </span>
      <span style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.35 }}>{children}</span>
    </div>
  );
}

export function ExplainerFilm({ t, format = "wide" }: { t: number; format?: FilmFormat }) {
  const { width, height } = FILM_SIZE[format];
  const tall = format === "tall";
  const headline = tall ? 72 : 76;
  const H = (text: ReactNode) => <p style={{ fontSize: headline, fontWeight: 800, fontFamily: DISPLAY_FONT, lineHeight: 1.3 }}>{text}</p>;

  const creamIn = span(t, 3.6, 0.6) * (1 - span(t, 145.8, 0.6));

  const sLogo = scene(t, -1, 4);
  const sProblem = scene(t, 4, 15);
  const sUpload = scene(t, 15, 25);
  const sRecalc = scene(t, 25, 35);
  const sException = scene(t, 35, 44);
  const sLeak = scene(t, 44, 52);
  const sSetup = scene(t, 52, 64);
  const sCashier = scene(t, 64, 78);
  const sCenter = scene(t, 78, 96);
  const sResult = scene(t, 96, 110);
  const sAds = scene(t, 110, 122);
  const sWatch = scene(t, 122, 134);
  const sAi = scene(t, 134, 146);
  const sClose = scene(t, 146, 156);

  const layer = (opacity: number): CSSProperties => ({
    position: "absolute",
    inset: 0,
    opacity,
    display: opacity > 0 ? "flex" : "none",
    flexDirection: "column",
    justifyContent: "center",
    padding: tall ? "150px 80px 330px" : "80px 140px 190px",
    gap: tall ? 44 : 36,
  });
  /** Text beside a visual (wide) or above it (tall). */
  const split = (opacity: number, text: ReactNode, visual: ReactNode) => (
    <div style={{ ...layer(opacity), flexDirection: tall ? "column" : "row", alignItems: "center", justifyContent: tall ? "center" : "space-between", gap: tall ? 56 : 90 }}>
      <div style={{ flex: tall ? undefined : 1, display: "flex", flexDirection: "column", gap: 30, width: tall ? "100%" : undefined }}>{text}</div>
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "center" }}>{visual}</div>
    </div>
  );

  const caption = EXPLAINER_SCRIPT.find(([start, end]) => t >= start && t <= end);
  const captionOpacity = caption ? clamp(Math.min((t - caption[0]) / 0.25, (caption[1] - t) / 0.25)) : 0;
  const onInk = 1 - creamIn > 0.5;

  return (
    <div
      dir="rtl"
      style={{ width, height, position: "relative", overflow: "hidden", background: C.cream, color: C.ink, fontFamily: '"IBM Plex Sans Arabic", system-ui, sans-serif' }}
    >
      <div style={{ position: "absolute", inset: 0, background: C.ink, opacity: 1 - creamIn }} />
      <div style={{ position: "absolute", insetInlineStart: 0, bottom: 0, height: 8, width: `${(t / EXPLAINER_DURATION) * 100}%`, background: C.gold }} />

      {/* Logo */}
      <div style={{ ...layer(sLogo), alignItems: "center", textAlign: "center", color: C.cream }}>
        <div style={{ transform: `scale(${0.85 + 0.15 * span(t, 0.2, 1.2)})`, opacity: span(t, 0.2, 1) }}>
          <LogoLockup className={tall ? "h-[300px] w-auto" : "h-[340px] w-auto"} title="تدقيق" />
        </div>
        <Rise t={t} at={1.4}>
          <p style={{ fontSize: 48, color: C.creamMuted, fontWeight: 500 }}>كيف يشتغل تدقيق؟</p>
        </Rise>
      </div>

      {/* The problem (real figures) */}
      <div style={layer(sProblem)}>
        <Rise t={t} at={4.3}>
          <Eyebrow color={C.goldText}>مطعم واحد · شهر واحد</Eyebrow>
        </Rise>
        <div style={{ display: "grid", gridTemplateColumns: tall ? "1fr" : "1fr 1fr", gap: 40 }}>
          {[
            { at: 5, value: REAL.commission, label: "عمولة" },
            { at: 6.2, value: REAL.discounts, label: "خصومات مموّلة منك" },
          ].map((item) => (
            <Rise key={item.label} t={t} at={item.at}>
              <div style={{ fontSize: tall ? 130 : 140, fontWeight: 800, fontFamily: DISPLAY_FONT, color: C.red, lineHeight: 1.1 }}>
                <Counter t={t} at={item.at} value={item.value} suffix="ر.س" />
              </div>
              <p style={{ fontSize: 40, fontWeight: 600 }}>{item.label}</p>
            </Rise>
          ))}
        </div>
        <Rise t={t} at={11.8}>{H("مين راجع هالأرقام؟")}</Rise>
      </div>

      {/* Upload */}
      {split(
        sUpload,
        <>
          <Rise t={t} at={15.2}>
            <Eyebrow color={C.goldText}>١ · ارفع ملفات الشهر</Eyebrow>
            {H("ملف الطلبات + فاتورة المنصة")}
          </Rise>
          <Rise t={t} at={18.4}>
            <div style={{ display: "flex", gap: 18 }}>
              {(["hungerstation", "keeta", "jahez"] as const).map((key) => (
                <span key={key} style={{ width: 92, height: 92, display: "block" }}>
                  <PlatformIcon platform={key} className="size-full rounded-full" />
                </span>
              ))}
            </div>
          </Rise>
        </>,
        (() => {
          const drop = span(t, 19.6, 1.2);
          const progress = clamp((t - 21.2) / 2.6);
          return (
            <Panel style={{ width: tall ? 860 : 700, display: "flex", flexDirection: "column", gap: 26 }}>
              <div style={{ border: `3px dashed ${drop > 0.95 ? C.gold : C.border}`, borderRadius: 24, height: 300, position: "relative", display: "grid", placeItems: "center" }}>
                {[
                  { icon: FileSpreadsheet, name: "orders-september.xlsx", x: -140, delay: 0 },
                  { icon: FileText, name: "invoice-september.pdf", x: 140, delay: 0.35 },
                ].map((file) => {
                  const p = span(t, 19.6 + file.delay, 1);
                  return (
                    <div
                      key={file.name}
                      dir="ltr"
                      style={{
                        position: "absolute",
                        left: `calc(50% + ${file.x}px - 120px)`,
                        top: 70,
                        width: 240,
                        opacity: p,
                        transform: `translateY(${(1 - p) * -160}px)`,
                        background: "white",
                        border: `2px solid ${C.border}`,
                        borderRadius: 18,
                        padding: "20px 16px",
                        textAlign: "center",
                      }}
                    >
                      <file.icon style={{ width: 64, height: 64, color: C.goldText, margin: "0 auto 10px" }} />
                      <p style={{ fontSize: 19, fontWeight: 700 }}>{file.name}</p>
                    </div>
                  );
                })}
              </div>
              <div>
                <p style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>{progress < 1 ? "يعيد حساب كل طلب…" : "✓ اكتمل التحليل"}</p>
                <div style={{ height: 16, borderRadius: 999, background: C.border, overflow: "hidden" }}>
                  <div style={{ width: `${progress * 100}%`, height: "100%", background: progress < 1 ? C.gold : C.green }} />
                </div>
              </div>
            </Panel>
          );
        })(),
      )}

      {/* Recalculate every line */}
      {split(
        sRecalc,
        <Rise t={t} at={25.2}>
          <Eyebrow color={C.goldText}>٢ · إعادة حساب كل بند</Eyebrow>
          {H("حسابنا مقابل فاتورة المنصة")}
        </Rise>,
        <Panel style={{ width: tall ? 860 : 760, padding: 0, overflow: "hidden" }}>
          {[
            { at: 27, label: "العمولة", ok: true },
            { at: 28.4, label: "رسوم الدفع", ok: true },
            { at: 29.8, label: "الحملات", ok: false, diff: 1_240 },
            { at: 31.2, label: "التعويضات", ok: false, diff: 860 },
          ].map((row, index) => {
            const p = span(t, row.at, 0.5);
            return (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "30px 40px",
                  borderTop: index ? `2px solid ${C.border}` : undefined,
                  opacity: 0.3 + 0.7 * p,
                  background: !row.ok && p > 0.5 ? `color-mix(in oklch, ${C.red} 8%, transparent)` : undefined,
                }}
              >
                <span style={{ fontSize: 38, fontWeight: 700 }}>{row.label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 32, fontWeight: 700, color: row.ok ? C.green : C.red, opacity: p }}>
                  {row.ok ? <Check style={{ width: 44, height: 44 }} /> : <X style={{ width: 44, height: 44 }} />}
                  {row.ok ? "مطابق" : (
                    <>
                      فرق <bdi dir="ltr">{nf(row.diff ?? 0)}</bdi> ر.س
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </Panel>,
      )}

      {/* Exception with an owner and a status */}
      {split(
        sException,
        <Rise t={t} at={35.2}>
          <Eyebrow color={C.goldText}>٣ · كل فرق يصير استثناء</Eyebrow>
          {H("له مسؤول وحالة، لين يتقفّل")}
        </Rise>,
        (() => {
          const statuses = ["مفتوح", "قيد المراجعة", "مُغلق"];
          const stage = t < 38.8 ? 0 : t < 41 ? 1 : 2;
          return (
            <Panel style={{ width: tall ? 860 : 720, display: "flex", flexDirection: "column", gap: 24, opacity: span(t, 36, 0.6) }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <p style={{ fontSize: 36, fontWeight: 800 }}>فرع العليا · الحملات</p>
                <p style={{ fontSize: 40, fontWeight: 800, color: C.red }}>
                  <bdi dir="ltr">1,240</bdi> ر.س
                </p>
              </div>
              <p style={{ fontSize: 28, color: C.goldText, fontWeight: 600 }}>المسؤول: مدير الحسابات</p>
              <div style={{ display: "flex", gap: 14 }}>
                {statuses.map((label, index) => (
                  <span
                    key={label}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      borderRadius: 999,
                      padding: "14px 0",
                      fontSize: 28,
                      fontWeight: 700,
                      background: index === stage ? (index === 2 ? C.green : C.ink) : "transparent",
                      color: index === stage ? C.cream : C.creamMuted,
                      border: `2px solid ${index === stage ? "transparent" : C.border}`,
                    }}
                  >
                    {index === 2 && stage === 2 ? "✓ " : ""}
                    {label}
                  </span>
                ))}
              </div>
            </Panel>
          );
        })(),
      )}

      {/* The biggest leak: compensation */}
      <div style={{ ...layer(sLeak), alignItems: "center", textAlign: "center" }}>
        <Rise t={t} at={44.3}>
          <Eyebrow color={C.goldText}>أكبر تسريب</Eyebrow>
          {H("التعويضات")}
        </Rise>
        <Rise t={t} at={46.6}>
          <Panel style={{ display: "flex", alignItems: "center", gap: 40, padding: "30px 44px" }}>
            <span style={{ fontSize: 34, fontWeight: 700 }}>
              تعويض عميل · طلب <bdi dir="ltr">#{ORDER}</bdi>
            </span>
            <span style={{ fontSize: 44, fontWeight: 800, color: C.red }}>
              <bdi dir="ltr">−86.00</bdi> ر.س
            </span>
          </Panel>
        </Rise>
        <Rise t={t} at={49}>
          <p style={{ fontSize: 46, fontWeight: 800, color: C.red }}>والدليل؟ ما عندك.</p>
        </Rise>
      </div>

      {/* Telegram setup */}
      {split(
        sSetup,
        <>
          <Rise t={t} at={52.3}>
            <Eyebrow color={TG}>Telegram · إعداد مرة واحدة</Eyebrow>
            {H("بوت تدقيق في قروب كل فرع")}
          </Rise>
          <Step n={1} t={t} at={54.5}>
            أضف البوت لقروب الفرع
          </Step>
          <Step n={2} t={t} at={58}>
            اربطه بكود من تدقيق
          </Step>
        </>,
        <Phone tall={tall} title="فرع العليا">
          <Pop t={t} at={55}>
            <SystemNote>المدير أضاف «بوت تدقيق»</SystemNote>
          </Pop>
          <Pop t={t} at={58.6}>
            <Bubble from="me">
              <bdi dir="ltr" style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700 }}>/connect 4821</bdi>
            </Bubble>
          </Pop>
          <Pop t={t} at={60.4}>
            <Bubble from="them" bot>
              ✓ تم ربط القروب بفرع العليا
            </Bubble>
          </Pop>
        </Phone>,
      )}

      {/* Cashier sends evidence; Tadqeeq reads the order number */}
      {split(
        sCashier,
        <>
          <Rise t={t} at={64.3}>
            <Eyebrow color={TG}>الكاشير · قبل ما يطلع الطلب</Eyebrow>
            {H("صوّر وأرسل في القروب")}
          </Rise>
          <Step n={1} t={t} at={65.5}>
            رقم الطلب في التعليق
          </Step>
          <Step n={2} t={t} at={72}>
            أو تقرأه AI من الفاتورة
          </Step>
        </>,
        <Phone tall={tall} title="فرع العليا">
          {t < 72.4 ? (
            <>
              <Pop t={t} at={65.8}>
                <Bubble from="me">
                  <VideoThumb />
                  <p dir="ltr" style={{ fontWeight: 800, marginTop: 8, textAlign: "start" }}>
                    {ORDER}
                  </p>
                </Bubble>
              </Pop>
              <Pop t={t} at={68.4}>
                <Bubble from="them" bot>
                  ✓ حُفظ الدليل للطلب <bdi dir="ltr">{ORDER}</bdi>
                </Bubble>
              </Pop>
            </>
          ) : (
            <>
              <Pop t={t} at={72.4}>
                <Bubble from="me">
                  <Receipt t={t} scanAt={73.4} />
                </Bubble>
              </Pop>
              <Pop t={t} at={75.6}>
                <Bubble from="them" bot>
                  ✓ قرأت رقم الطلب من الفاتورة: <bdi dir="ltr">{ORDER_FROM_RECEIPT}</bdi>
                </Bubble>
              </Pop>
            </>
          )}
        </Phone>,
      )}

      {/* Compensation Center: search, evidence, review request */}
      {split(
        sCenter,
        <>
          <Rise t={t} at={78.3}>
            <Eyebrow color={C.goldText}>مركز التعويضات</Eyebrow>
            {H("من الخصم إلى طلب المراجعة")}
          </Rise>
          <Step n={1} t={t} at={79.5}>
            ابحث برقم الطلب
          </Step>
          <Step n={2} t={t} at={82.6}>
            الدليل يطلع لك
          </Step>
          <Step n={3} t={t} at={87.4}>
            طلب مراجعة بالعربي والإنجليزي
          </Step>
          <Rise t={t} at={92.4} distance={16}>
            <p style={{ fontSize: 28, color: C.green, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
              <ShieldCheck style={{ width: 34, height: 34 }} /> الصور والفيديوهات تبقى في تليجرام، تدقيق ما ينسخها
            </p>
          </Rise>
        </>,
        <Panel style={{ width: tall ? 900 : 800, display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, border: `2px solid ${t > 79.5 ? C.gold : C.border}`, borderRadius: 18, padding: "16px 22px", fontSize: 30 }}>
            <Search style={{ width: 32, height: 32, color: C.goldText }} />
            <bdi dir="ltr" style={{ fontWeight: 700 }}>
              <Typed t={t} start={79.8} duration={1.2} text={ORDER} />
            </bdi>
          </div>
          <div style={{ display: "flex", gap: 22, alignItems: "center", opacity: span(t, 82.6, 0.5), transform: `translateY(${(1 - span(t, 82.6, 0.5)) * 20}px)` }}>
            <div style={{ transform: "scale(0.7)", transformOrigin: "right center", width: 231, height: 154 }}>
              <VideoThumb />
            </div>
            <div style={{ fontSize: 26, lineHeight: 1.6 }}>
              <p style={{ fontWeight: 800, fontSize: 30 }}>
                طلب <bdi dir="ltr">#{ORDER}</bdi> · فرع العليا
              </p>
              <p style={{ color: C.goldText }}>فيديو تجهيز · ١٣:٤٢ · من قروب Telegram</p>
              <p style={{ color: C.red, fontWeight: 700 }}>
                خصم تعويض <bdi dir="ltr">86.00</bdi> ر.س
              </p>
            </div>
          </div>
          <div style={{ background: C.ink, color: C.cream, borderRadius: 22, padding: "22px 28px", fontSize: 24, lineHeight: 1.7, minHeight: tall ? 300 : 250, opacity: span(t, 87.2, 0.4) }}>
            <p style={{ color: C.gold, fontWeight: 800, marginBottom: 6 }}>طلب مراجعة جاهز</p>
            <p>
              <Typed t={t} start={87.8} duration={2.6} text={`نأمل مراجعة خصم التعويض على الطلب ${ORDER}؛ الفيديو المرفق يوضح تجهيز الطلب كاملاً قبل تسليمه للمندوب.`} />
            </p>
            <p dir="ltr" style={{ textAlign: "left", color: C.creamMuted, marginTop: 8 }}>
              <Typed t={t} start={90.6} duration={2} text={`Please review the compensation on order ${ORDER}; the attached video shows it was complete at handover.`} />
            </p>
          </div>
        </Panel>,
      )}

      {/* Illustrative result */}
      <div style={layer(sResult)}>
        <Rise t={t} at={96.3}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Eyebrow color={C.goldText}>
              النتيجة · شهر واحد · <bdi dir="ltr">{EXAMPLE.branches}</bdi> فرعاً
            </Eyebrow>
            <span style={{ border: `2px solid ${C.goldText}`, color: C.goldText, borderRadius: 999, padding: "4px 18px", fontSize: 24, fontWeight: 700 }}>مثال توضيحي</span>
          </div>
        </Rise>
        <div style={{ display: "grid", gridTemplateColumns: tall ? "1fr" : "repeat(3, 1fr)", gap: tall ? 30 : 32 }}>
          {[
            { at: 97.4, value: EXAMPLE.deducted, suffix: "ر.س", label: `خصومات تعويض · ${EXAMPLE.cases} حالة`, color: C.red, dark: false },
            { at: 99.6, value: EXAMPLE.withEvidence, suffix: "حالة", label: "لها دليل من Telegram وطلب مراجعة", color: C.ink, dark: false },
            { at: 102, value: EXAMPLE.recovered, suffix: "ر.س", label: "رجعت بالدليل", color: C.gold, dark: true },
          ].map((card) => (
            <Rise key={card.label} t={t} at={card.at}>
              <div style={{ background: card.dark ? C.ink : C.card, color: card.dark ? C.cream : C.ink, border: `2px solid ${card.dark ? C.ink : C.border}`, borderRadius: 32, padding: tall ? "30px 40px" : 40 }}>
                <p style={{ fontSize: tall ? 96 : 92, fontWeight: 800, fontFamily: DISPLAY_FONT, color: card.color, lineHeight: 1.15 }}>
                  <Counter t={t} at={card.at} value={card.value} suffix={card.suffix} />
                </p>
                <p style={{ fontSize: 30, fontWeight: 600 }}>{card.label}</p>
              </div>
            </Rise>
          ))}
        </div>
        <Rise t={t} at={104.4}>
          <div style={{ height: 30, borderRadius: 999, background: `color-mix(in oklch, ${C.red} 22%, transparent)`, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(EXAMPLE.recovered / EXAMPLE.deducted) * 100 * easeBar(t, 104.6)}%`, background: C.gold, borderRadius: 999 }} />
          </div>
          <p style={{ fontSize: 30, fontWeight: 700, marginTop: 12 }}>
            <bdi dir="ltr">{Math.round((EXAMPLE.recovered / EXAMPLE.deducted) * 100)}%</bdi> من خصومات التعويض رجعت للمطعم
          </p>
        </Rise>
      </div>

      {/* Ads (real figures) */}
      <div style={layer(sAds)}>
        <Rise t={t} at={110.3}>
          <Eyebrow color={C.goldText}>عائد الإعلانات الحقيقي</Eyebrow>
        </Rise>
        <div style={{ display: "grid", gridTemplateColumns: tall ? "1fr" : "1fr 1fr", gap: 32 }}>
          <Rise t={t} at={111}>
            <Panel style={{ padding: 44 }}>
              <p style={{ fontSize: 32, color: C.goldText, fontWeight: 600 }}>المنصة تقول</p>
              <p style={{ fontSize: 96, fontWeight: 800, fontFamily: DISPLAY_FONT }}>
                <bdi dir="ltr">{REAL.platformRoas}×</bdi>
              </p>
              <p style={{ fontSize: 30 }}>
                على <bdi dir="ltr">{nf(REAL.adSpend)}</bdi> ر.س إنفاق
              </p>
            </Panel>
          </Rise>
          <Rise t={t} at={113.4}>
            <div style={{ background: C.ink, color: C.cream, borderRadius: 32, padding: 44 }}>
              <p style={{ fontSize: 32, color: C.gold, fontWeight: 600 }}>الربح بعد العمولة والخصومات والإعلان</p>
              <p style={{ fontSize: 96, fontWeight: 800, fontFamily: DISPLAY_FONT }}>
                <Counter t={t} at={113.4} value={REAL.adProfit} suffix="ر.س" />
              </p>
            </div>
          </Rise>
        </div>
        <Rise t={t} at={116.6} distance={20}>
          <span style={{ display: "inline-block", border: `3px solid ${C.red}`, color: C.red, borderRadius: 999, padding: "14px 32px", fontSize: 34, fontWeight: 700 }}>
            حملتان تخسران · أوقفهما
          </span>
        </Rise>
      </div>

      {/* Smart Watch + smart columns */}
      <div style={layer(sWatch)}>
        <Rise t={t} at={122.3}>
          <Eyebrow color={C.goldText}>المراقب الذكي</Eyebrow>
          {H("ينبّهك لأي رسوم غير معتادة")}
        </Rise>
        <Rise t={t} at={124}>
          <Panel style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, background: `color-mix(in oklch, ${C.red} 7%, ${C.card})` }}>
            <span style={{ fontSize: 36, fontWeight: 700 }}>عمولة طلبات الاستلام</span>
            <span style={{ fontSize: 34, fontWeight: 800, color: C.red }}>
              <bdi dir="ltr">21.4%</bdi> <span style={{ fontSize: 26, fontWeight: 600 }}>مقابل المعتاد 16.2%</span>
            </span>
          </Panel>
        </Rise>
        {(() => {
          const swap = span(t, 129.4, 0.6);
          const done = span(t, 130.4, 0.4);
          return (
            <Rise t={t} at={128}>
              <p style={{ fontSize: 34, fontWeight: 700, marginBottom: 18 }}>المنصة غيّرت اسم عمود؟ تدقيق يطابقه.</p>
              <div dir="ltr" style={{ display: "flex", alignItems: "center", gap: 24, fontSize: tall ? 34 : 40, fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace', justifyContent: "flex-end" }}>
                <span style={{ border: `3px solid ${C.border}`, borderRadius: 18, padding: "12px 24px", textDecoration: swap > 0.5 ? "line-through" : undefined, color: swap > 0.5 ? C.creamMuted : C.ink }}>
                  Commission
                </span>
                <span style={{ color: C.gold, opacity: swap }}>→</span>
                <span style={{ border: `3px solid ${C.gold}`, borderRadius: 18, padding: "12px 24px", opacity: swap }}>Commission Amount</span>
                <span style={{ color: C.green, opacity: done, fontSize: 52 }}>✓</span>
              </div>
            </Rise>
          );
        })()}
      </div>

      {/* AI and trust */}
      <div style={layer(sAi)}>
        <Rise t={t} at={134.3}>
          <Eyebrow color={C.goldText}>Tadqeeq AI</Eyebrow>
          {H("اسأل عن أي رقم")}
        </Rise>
        <Rise t={t} at={135.6} distance={20}>
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <span style={{ background: C.ink, color: C.cream, borderRadius: "32px 32px 32px 8px", padding: "22px 36px", fontSize: 34, fontWeight: 600 }}>
              ليش زادت العمولة في فرع العليا؟
            </span>
          </div>
        </Rise>
        <div style={{ display: "flex", justifyContent: "flex-end", opacity: t > 137 ? 1 : 0 }}>
          <span style={{ background: C.card, border: `2px solid ${C.border}`, borderRadius: "32px 32px 8px 32px", padding: "22px 36px", fontSize: 32, lineHeight: 1.7, maxWidth: tall ? "100%" : "78%", minHeight: 110 }}>
            <Typed t={t} start={137.2} duration={2.4} text="لأن طلبات الاستلام زادت هذا الشهر، وعمولتها 21.4% مقابل 16.2% للتوصيل." />
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: tall ? "column" : "row", gap: 20 }}>
          {[
            { at: 140.6, text: "كل رقم من محرك محاسبي ثابت، والذكاء الاصطناعي يشرح بس" },
            { at: 142, text: "بيانات كل شركة منفصلة تماماً" },
          ].map((chip) => (
            <Rise key={chip.text} t={t} at={chip.at} distance={16}>
              <p style={{ fontSize: 28, color: C.green, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                <ShieldCheck style={{ width: 34, height: 34, flexShrink: 0 }} /> {chip.text}
              </p>
            </Rise>
          ))}
        </div>
      </div>

      {/* Close */}
      <div style={{ ...layer(sClose), alignItems: "center", textAlign: "center", color: C.cream }}>
        <Rise t={t} at={146.4}>
          <LogoWordmark className="h-[170px] w-auto" title="تدقيق" />
        </Rise>
        <Rise t={t} at={147.2}>
          <p style={{ fontSize: headline * 0.95, fontWeight: 800, fontFamily: DISPLAY_FONT, lineHeight: 1.4 }}>لا تدفع فاتورة المنصة قبل ما تتأكد منها.</p>
        </Rise>
        <Rise t={t} at={148.2}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28 }}>
            <span style={{ background: C.gold, color: C.ink, borderRadius: 999, padding: "18px 48px", fontSize: 40, fontWeight: 800 }}>ابدأ مجاناً</span>
            <span style={{ display: "flex", gap: 14 }}>
              {(["hungerstation", "keeta", "jahez"] as const).map((key) => (
                <PlatformIcon key={key} platform={key} className="size-[76px] rounded-full" />
              ))}
            </span>
          </div>
        </Rise>
      </div>

      {/* Captions (the voice-over script) */}
      {caption && sClose === 0 ? (
        <div style={{ position: "absolute", insetInline: tall ? 60 : 200, bottom: tall ? 120 : 44, display: "flex", justifyContent: "center", opacity: captionOpacity }}>
          <p
            style={{
              background: onInk ? "oklch(0.965 0.013 87 / 0.12)" : "oklch(0.22 0.027 218 / 0.9)",
              color: C.cream,
              borderRadius: 20,
              padding: tall ? "18px 30px" : "14px 34px",
              fontSize: tall ? 38 : 34,
              fontWeight: 600,
              lineHeight: 1.55,
              textAlign: "center",
            }}
          >
            {caption[2]}
          </p>
        </div>
      ) : null}

      {/* Data note */}
      <p style={{ position: "absolute", top: tall ? 60 : 36, insetInlineEnd: tall ? 80 : 140, fontSize: 20, opacity: (sProblem + sAds + sWatch) * 0.6, color: C.ink }}>
        أرقام حقيقية من بيانات مطعم في أغسطس 2026، بدون أسماء
      </p>
    </div>
  );
}

function easeBar(t: number, at: number) {
  return span(t, at, 1.6);
}
