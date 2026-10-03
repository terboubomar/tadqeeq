import type { CSSProperties, ReactNode } from "react";

import { LogoLockup, LogoWordmark } from "@/components/brand/Logo";
import { PlatformIcon } from "@/components/brand/PlatformLogo";

/**
 * The 30-second Tadqeeq brand film, drawn as a pure function of time so every frame can be
 * rendered exactly (for the MP4) or played live. All figures are real, from one restaurant's
 * August 2026 HungerStation exports, shown without brand or branch names.
 */

export const FILM_DURATION = 30;
export type FilmFormat = "wide" | "tall";
export const FILM_SIZE: Record<FilmFormat, { width: number; height: number }> = {
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 },
};

const DATA = {
  branches: 26,
  orders: 32_246,
  sales: 2_187_371,
  commission: 367_483,
  commissionPct: 16.8,
  discounts: 260_780,
  pickupCommission: 21.4,
  deliveryCommission: 16.2,
  adSpend: 50_237,
  platformRoas: 7.15,
  adProfit: 155_131,
  budgetShifts: 7,
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x: number) => {
  const v = clamp(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
/** 0→1 over [start, start+duration]. */
const span = (t: number, start: number, duration: number) => easeOut((t - start) / duration);
/** Visibility of a scene with fade in/out. */
const scene = (t: number, start: number, end: number, fade = 0.45) => clamp(Math.min((t - start) / fade, (end - t) / fade));

const nf = (value: number) => Math.round(value).toLocaleString("en-US");

function Rise({ t, at, children, style, distance = 40 }: { t: number; at: number; children: ReactNode; style?: CSSProperties; distance?: number }) {
  const p = span(t, at, 0.7);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * distance}px)`, ...style }}>{children}</div>;
}

function Counter({ t, at, value, duration = 1.4, suffix }: { t: number; at: number; value: number; duration?: number; suffix?: string }) {
  const p = easeInOut((t - at) / duration);
  return (
    <span dir="ltr" style={{ fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}>
      {nf(value * p)}
      {suffix ? <span style={{ fontSize: "0.45em", fontWeight: 600, marginInlineStart: "0.25em" }}>{suffix}</span> : null}
    </span>
  );
}

const C = {
  ink: "oklch(0.22 0.027 218)",
  ink2: "oklch(0.29 0.029 218)",
  cream: "oklch(0.965 0.013 87)",
  creamMuted: "oklch(0.78 0.018 210)",
  gold: "oklch(0.66 0.13 70)",
  goldText: "oklch(0.49 0.10 66)",
  red: "oklch(0.52 0.16 31)",
  green: "oklch(0.55 0.12 155)",
  card: "oklch(0.995 0.004 87)",
  border: "oklch(0.88 0.015 85)",
};

function Eyebrow({ children, color = C.gold }: { children: ReactNode; color?: string }) {
  return <p style={{ color, fontSize: 30, fontWeight: 700, letterSpacing: 0 }}>{children}</p>;
}

export function BrandFilm({ t, format = "wide" }: { t: number; format?: FilmFormat }) {
  const { width, height } = FILM_SIZE[format];
  const tall = format === "tall";
  const headline = tall ? 84 : 96;
  const big = tall ? 150 : 170;

  // Background: ink for the opening and closing, cream in between.
  const creamIn = span(t, 3.2, 0.6) * (1 - span(t, 26.3, 0.6));

  const s1 = scene(t, -1, 3.6);
  const s2 = scene(t, 3.6, 8.2);
  const s3 = scene(t, 8.2, 12.8);
  const s4 = scene(t, 12.8, 17.8);
  const s5 = scene(t, 17.8, 23.6);
  const s6 = scene(t, 23.6, 26.6);
  const s7 = scene(t, 26.6, 31);

  const layer = (opacity: number): CSSProperties => ({
    position: "absolute",
    inset: 0,
    opacity,
    display: opacity > 0 ? "flex" : "none",
    flexDirection: "column",
    justifyContent: "center",
    padding: tall ? "160px 90px" : "90px 150px",
    gap: tall ? 48 : 40,
  });

  return (
    <div
      dir="rtl"
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        background: C.cream,
        color: C.ink,
        fontFamily: '"IBM Plex Sans Arabic", system-ui, sans-serif',
        transition: "none",
      }}
    >
      {/* Ink backdrop for the opening and closing, crossfading to cream in between */}
      <div style={{ position: "absolute", inset: 0, background: C.ink, opacity: 1 - creamIn }} />

      {/* Gold progress line */}
      <div style={{ position: "absolute", insetInlineStart: 0, bottom: 0, height: 8, width: `${(t / FILM_DURATION) * 100}%`, background: C.gold }} />

      {/* 1 — Logo */}
      <div style={{ ...layer(s1), alignItems: "center", textAlign: "center", color: C.cream }}>
        <div style={{ transform: `scale(${0.85 + 0.15 * span(t, 0.2, 1.2)})`, opacity: span(t, 0.2, 1), color: C.cream }}>
          <LogoLockup className={tall ? "h-[300px] w-auto" : "h-[340px] w-auto"} title="تدقيق" />
        </div>
        <Rise t={t} at={1.4}>
          <p style={{ fontSize: tall ? 44 : 48, color: C.creamMuted, fontWeight: 500 }}>تدقيق فواتير التوصيل للمطاعم</p>
        </Rise>
      </div>

      {/* 2 — One month, one restaurant */}
      <div style={layer(s2)}>
        <Rise t={t} at={3.7}>
          <Eyebrow color={C.goldText}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
              <PlatformIcon platform="hungerstation" className="size-[52px] rounded-full" />
              مطعم واحد · شهر أغسطس
            </span>
          </Eyebrow>
        </Rise>
        <div style={{ display: "grid", gridTemplateColumns: tall ? "1fr" : "repeat(3, 1fr)", gap: tall ? 56 : 40 }}>
          {[
            { at: 4.2, value: DATA.branches, label: "فرعاً" },
            { at: 4.7, value: DATA.orders, label: "طلب مكتمل" },
            { at: 5.2, value: DATA.sales, label: "ر.س مبيعات" },
          ].map((item) => (
            <Rise key={item.label} t={t} at={item.at}>
              <div style={{ fontSize: tall ? 130 : 120, fontWeight: 800, fontFamily: '"Noto Kufi Arabic", sans-serif', lineHeight: 1.1 }}>
                <Counter t={t} at={item.at} value={item.value} />
              </div>
              <p style={{ fontSize: 38, color: C.goldText, fontWeight: 600 }}>{item.label}</p>
            </Rise>
          ))}
        </div>
      </div>

      {/* 3 — What the platform took */}
      <div style={layer(s3)}>
        <Rise t={t} at={8.3}>
          <Eyebrow color={C.goldText}>المنصة خصمت هذا الشهر</Eyebrow>
        </Rise>
        <Rise t={t} at={8.6}>
          <div style={{ fontSize: big, fontWeight: 800, fontFamily: '"Noto Kufi Arabic", sans-serif', color: C.red, lineHeight: 1.1 }}>
            <Counter t={t} at={8.6} value={DATA.commission} suffix="ر.س" />
          </div>
          <p style={{ fontSize: 40, fontWeight: 600 }}>
            عمولة · <bdi dir="ltr">{DATA.commissionPct}%</bdi> من المبيعات
          </p>
        </Rise>
        <Rise t={t} at={9.8}>
          <p style={{ fontSize: 40, fontWeight: 600 }}>
            + <bdi dir="ltr">{nf(DATA.discounts)}</bdi> ر.س خصومات مموّلة منك
          </p>
        </Rise>
        <Rise t={t} at={10.9}>
          <p style={{ fontSize: headline, fontWeight: 800, fontFamily: '"Noto Kufi Arabic", sans-serif' }}>هل كل ريال صحيح؟</p>
        </Rise>
      </div>

      {/* 4 — Smart watch */}
      <div style={layer(s4)}>
        <Rise t={t} at={12.9}>
          <Eyebrow color={C.goldText}>جديد · المراقب الذكي</Eyebrow>
          <p style={{ fontSize: headline * (tall ? 0.78 : 0.68), fontWeight: 800, fontFamily: '"Noto Kufi Arabic", sans-serif', lineHeight: 1.35 }}>
            يقارن كل فرع بتاريخه، وينبّهك لما هو غير معتاد.
          </p>
        </Rise>
        <div style={{ background: C.card, border: `2px solid ${C.border}`, borderRadius: 32, overflow: "hidden" }}>
          {[
            { at: 13.9, label: "عمولة طلبات الاستلام", now: `${DATA.pickupCommission}%`, usual: `${DATA.deliveryCommission}%`, alert: true },
            { at: 14.5, label: "رسوم الدفع", now: "2.2%", usual: "ضمن المعتاد", alert: false },
            { at: 15.1, label: "طلبات عليها عرض توصيل", now: "536", usual: "ضمن المعتاد", alert: false },
          ].map((row, index) => {
            const p = span(t, row.at, 0.6);
            const pulse = row.alert ? 0.5 + 0.5 * Math.sin(Math.max(0, t - 15.5) * 5) : 0;
            return (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 24,
                  padding: tall ? "34px 40px" : "30px 44px",
                  borderTop: index ? `2px solid ${C.border}` : undefined,
                  opacity: p,
                  transform: `translateX(${(1 - p) * -60}px)`,
                  background: row.alert ? `color-mix(in oklch, ${C.red} ${6 + pulse * 6}%, transparent)` : undefined,
                }}
              >
                <span style={{ fontSize: 38, fontWeight: 700 }}>{row.label}</span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 18, whiteSpace: "nowrap" }}>
                  <bdi dir="ltr" style={{ fontSize: 44, fontWeight: 800, color: row.alert ? C.red : C.ink }}>
                    {row.now}
                  </bdi>
                  <span style={{ fontSize: 28, color: row.alert ? C.red : C.green, fontWeight: 600 }}>
                    {row.alert ? (
                      <>
                        مقابل <bdi dir="ltr">{row.usual}</bdi> للتوصيل
                      </>
                    ) : (
                      `✓ ${row.usual}`
                    )}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5 — Real ad return */}
      <div style={layer(s5)}>
        <Rise t={t} at={17.9}>
          <Eyebrow color={C.goldText}>عائد الإعلانات الحقيقي</Eyebrow>
        </Rise>
        <div style={{ display: "grid", gridTemplateColumns: tall ? "1fr" : "1fr 1fr", gap: 32 }}>
          <Rise t={t} at={18.2}>
            <div style={{ background: C.card, border: `2px solid ${C.border}`, borderRadius: 32, padding: 44 }}>
              <p style={{ fontSize: 32, color: C.goldText, fontWeight: 600 }}>إنفاق إعلاني</p>
              <p style={{ fontSize: 96, fontWeight: 800, fontFamily: '"Noto Kufi Arabic", sans-serif' }}>
                <Counter t={t} at={18.2} value={DATA.adSpend} suffix="ر.س" />
              </p>
              <p style={{ fontSize: 32 }}>
                المنصة تقول: يرجع <bdi dir="ltr" style={{ fontWeight: 800 }}>{DATA.platformRoas}</bdi> لكل ريال
              </p>
            </div>
          </Rise>
          <Rise t={t} at={19.6}>
            <div style={{ background: C.ink, color: C.cream, borderRadius: 32, padding: 44 }}>
              <p style={{ fontSize: 32, color: C.gold, fontWeight: 600 }}>الربح بعد العمولة والخصومات والإعلان</p>
              <p style={{ fontSize: 96, fontWeight: 800, fontFamily: '"Noto Kufi Arabic", sans-serif' }}>
                <Counter t={t} at={19.6} value={DATA.adProfit} suffix="ر.س" />
              </p>
              <p style={{ fontSize: 28, color: C.creamMuted }}>قبل تكلفة الطعام</p>
            </div>
          </Rise>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          {[
            { at: 21.2, text: "حملتان تخسران · أوقفهما", color: C.red },
            { at: 21.7, text: `${DATA.budgetShifts} فرص لنقل الميزانية لحملات أقوى`, color: C.goldText },
          ].map((chip) => (
            <Rise key={chip.text} t={t} at={chip.at} distance={20}>
              <span style={{ display: "inline-block", border: `3px solid ${chip.color}`, color: chip.color, borderRadius: 999, padding: "14px 32px", fontSize: 34, fontWeight: 700 }}>
                {chip.text}
              </span>
            </Rise>
          ))}
        </div>
      </div>

      {/* 6 — Smart columns */}
      <div style={{ ...layer(s6), alignItems: "center", textAlign: "center" }}>
        <Rise t={t} at={23.7}>
          <Eyebrow color={C.goldText}>جديد · قراءة ذكية للملفات</Eyebrow>
          <p style={{ fontSize: headline * (tall ? 0.78 : 0.68), fontWeight: 800, fontFamily: '"Noto Kufi Arabic", sans-serif', lineHeight: 1.35 }}>
            المنصة غيّرت اسم عمود؟ نطابقه بدل أن نتوقف.
          </p>
        </Rise>
        {(() => {
          const swap = span(t, 24.6, 0.6);
          const done = span(t, 25.4, 0.4);
          return (
            <div dir="ltr" style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 44, fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace' }}>
              <span style={{ border: `3px solid ${C.border}`, borderRadius: 18, padding: "14px 28px", textDecoration: swap > 0.5 ? "line-through" : undefined, color: swap > 0.5 ? C.creamMuted : C.ink }}>
                Commission
              </span>
              <span style={{ color: C.gold, opacity: swap }}>→</span>
              <span style={{ border: `3px solid ${C.gold}`, borderRadius: 18, padding: "14px 28px", opacity: swap, transform: `scale(${0.9 + 0.1 * swap})` }}>
                Commission Amount
              </span>
              <span style={{ color: C.green, opacity: done, transform: `scale(${0.6 + 0.4 * done})`, fontSize: 56 }}>✓</span>
            </div>
          );
        })()}
      </div>

      {/* 7 — Close */}
      <div style={{ ...layer(s7), alignItems: "center", textAlign: "center", color: C.cream }}>
        <Rise t={t} at={26.7}>
          <LogoWordmark className="h-[170px] w-auto" title="تدقيق" />
        </Rise>
        <Rise t={t} at={27.3}>
          <p style={{ fontSize: headline * 0.75, fontWeight: 800, fontFamily: '"Noto Kufi Arabic", sans-serif', lineHeight: 1.4 }}>
            لا تدفع فاتورة المنصة قبل ما تتأكد منها.
          </p>
        </Rise>
        <Rise t={t} at={27.9}>
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

      {/* Data note */}
      <p
        style={{
          position: "absolute",
          bottom: 30,
          insetInlineEnd: tall ? 90 : 150,
          fontSize: 20,
          opacity: s2 + s3 + s4 + s5 > 0 ? 0.6 : 0,
          color: C.ink,
        }}
      >
        أرقام حقيقية من بيانات مطعم في أغسطس 2026، بدون أسماء
      </p>
    </div>
  );
}
