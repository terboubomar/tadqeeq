/* eslint-disable @typescript-eslint/no-explicit-any -- template data comes in as a loose record, like the other templates */
import * as React from 'react'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import type { ReportDigest } from '../report-schedules'
import { PLATFORM_COST_DEFINITION_AR } from '../reporting-metrics'

interface Props {
  workspaceName?: string
  scheduleName?: string
  timing?: string
  digest?: ReportDigest
  reportsUrl?: string
  manageUrl?: string
}

/** Scheduled report: the latest month's figures against the month before, per platform, and a link to Tadqeeq. */
const ReportSummaryEmail = ({ workspaceName, scheduleName, timing, digest, reportsUrl, manageUrl }: Props) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>{`ملخص ${digest?.monthLabel ?? ''} · ${workspaceName ?? ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>{workspaceName} · {scheduleName}</Text>
        <Heading style={h1}>ملخص {digest?.monthLabel}</Heading>
        {digest?.newPeriodLabel ? <Text style={note}>فترة جديدة رُفعت: {digest.newPeriodLabel}</Text> : null}
        <Text style={muted}>
          {digest?.periodCount ?? 0} فترة تدقيق في الشهر
          {digest?.previousMonthLabel ? ` · التغير مقارنة بـ ${digest.previousMonthLabel}` : ''}
        </Text>

        <Section style={card}>
          {(digest?.figures ?? []).map((figure) => (
            <table key={figure.label} role="presentation" width="100%" style={rowTable}>
              <tbody>
                <tr>
                  <td style={label}>{figure.label}</td>
                  <td style={value}>
                    <span dir="ltr">{figure.value}</span>
                    {figure.change ? (
                      <span style={{ ...chip, ...(figure.good === null ? chipFlat : figure.good ? chipGood : chipBad) }} dir="rtl">
                        {/* The signed number stays left-to-right; a unit word (نقطة) follows it in Arabic order. */}
                        <span dir="ltr">{figure.change.split(' ')[0]}</span>
                        {figure.change.includes(' ') ? ` ${figure.change.split(' ').slice(1).join(' ')}` : null}
                      </span>
                    ) : null}
                  </td>
                </tr>
              </tbody>
            </table>
          ))}
        </Section>

        {digest && digest.platforms.length > 1 ? (
          <Section style={{ margin: '20px 0 0' }}>
            <Text style={h2}>حسب المنصة</Text>
            <table role="presentation" width="100%" style={platformTable}>
              <thead>
                <tr>
                  <th style={th}>المنصة</th>
                  <th style={th}>المبيعات</th>
                  <th style={th}>تكلفة المنصة</th>
                  <th style={th}>العمولة</th>
                </tr>
              </thead>
              <tbody>
                {digest.platforms.map((p) => (
                  <tr key={p.name}>
                    <td style={td}>{p.name}</td>
                    <td style={td}><span dir="ltr">{p.sales}</span></td>
                    <td style={td}><span dir="ltr">{p.costPct}</span></td>
                    <td style={td}><span dir="ltr">{p.commissionPct}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        ) : null}

        <Section style={{ margin: '24px 0 8px' }}>
          <Button href={reportsUrl} style={button}>فتح التقارير في تدقيق</Button>
        </Section>
        <Text style={small}>{PLATFORM_COST_DEFINITION_AR}</Text>
        <Text style={small}>التفاصيل وملفات Excel متاحة بعد تسجيل الدخول.</Text>
        <Hr style={hr} />
        <Text style={footer}>
          وصلك هذا البريد لأن عنوانك في جدولة «{scheduleName}» ({timing}).{' '}
          {manageUrl ? <>يمكن لمالك الحساب أو مديره تعديلها أو إيقافها من <a href={manageUrl} style={link}>جدولة التقارير</a>.</> : null}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ReportSummaryEmail,
  subject: (d: Record<string, any>) => `ملخص ${d['digest']?.monthLabel ?? 'التقارير'} · ${d['workspaceName'] ?? 'تدقيق'}`,
  displayName: 'ملخص التقارير المجدول',
  previewData: {
    workspaceName: 'مطاعم المذاق',
    scheduleName: 'التقرير الشهري',
    timing: 'شهرياً في اليوم 3',
    reportsUrl: 'https://tadqeeq.app/trends',
    manageUrl: 'https://tadqeeq.app/report-schedules',
    digest: {
      monthLabel: 'سبتمبر 2026',
      previousMonthLabel: 'أغسطس 2026',
      periodCount: 2,
      newPeriodLabel: null,
      figures: [
        { label: 'المبيعات', value: '412,300.00 ر.س', change: '+6.2%', good: true },
        { label: 'الطلبات', value: '5,820', change: '+3.1%', good: true },
        { label: 'تكلفة المنصة', value: '27.4%', change: '+0.8 نقطة', good: false },
        { label: 'نسبة العمولة', value: '18.2%', change: '−0.3 نقطة', good: true },
      ],
      platforms: [
        { name: 'هنقرستيشن', sales: '301,000.00 ر.س', costPct: '28.1%', commissionPct: '19.0%' },
        { name: 'كيتا', sales: '111,300.00 ر.س', costPct: '25.5%', commissionPct: '16.0%' },
      ],
    },
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#f6f4ef', fontFamily: "'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif" }
const container = { padding: '24px 24px 28px', textAlign: 'right' as const, maxWidth: '560px', backgroundColor: '#ffffff' }
const eyebrow = { fontSize: '12px', color: '#8a8478', margin: '0 0 6px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0f2027', margin: '0 0 6px' }
const h2 = { fontSize: '14px', fontWeight: 'bold' as const, color: '#0f2027', margin: '0 0 8px' }
const muted = { fontSize: '13px', color: '#6b6559', margin: '0 0 16px' }
const note = { fontSize: '13px', color: '#7a4f0f', backgroundColor: '#fbf1dd', padding: '8px 12px', borderRadius: '8px', margin: '0 0 10px' }
const card = { border: '1px solid #e7e1d4', borderRadius: '12px', padding: '4px 14px' }
const rowTable = { borderBottom: '1px solid #efe9de' }
const label = { fontSize: '13px', color: '#6b6559', padding: '10px 0' }
const value = { fontSize: '15px', fontWeight: 'bold' as const, color: '#0f2027', padding: '10px 0', textAlign: 'left' as const }
const chip = { display: 'inline-block', marginRight: '8px', fontSize: '11px', fontWeight: 'bold' as const, padding: '2px 8px', borderRadius: '999px' }
const chipGood = { backgroundColor: '#e3f1e7', color: '#1d6b3a' }
const chipBad = { backgroundColor: '#fbe4e1', color: '#a3281b' }
const chipFlat = { backgroundColor: '#efe9de', color: '#6b6559' }
const platformTable = { borderCollapse: 'collapse' as const, fontSize: '13px' }
const th = { textAlign: 'right' as const, color: '#8a8478', fontWeight: 'normal' as const, padding: '6px 4px', borderBottom: '1px solid #e7e1d4' }
const td = { textAlign: 'right' as const, color: '#0f2027', padding: '8px 4px', borderBottom: '1px solid #efe9de' }
const button = { backgroundColor: '#0f2027', color: '#ffffff', fontSize: '14px', fontWeight: 'bold' as const, padding: '12px 20px', borderRadius: '10px', textDecoration: 'none' }
const small = { fontSize: '12px', color: '#8a8478', margin: '0' }
const hr = { borderColor: '#efe9de', margin: '20px 0 12px' }
const footer = { fontSize: '11.5px', color: '#9a948a', lineHeight: '1.7', margin: '0' }
const link = { color: '#7a4f0f' }
