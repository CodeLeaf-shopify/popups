import type { ReactNode } from "react";

import type { AnalyticsSeriesPoint, AnalyticsVariant } from "../popup/stats.server";

const WIDTH = 640;
const HEIGHT = 200;
const PAD = { left: 44, right: 12, top: 12, bottom: 28 };

const VIEWS = "#1f5199";
const CLICKS = "#2c6ecb";
const SUBMITS = "#0b7a3b";
const DISMISSALS = "#b98900";
const LABEL = "currentColor";

type Point = { x: number; y: number };

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

function plot(values: number[], max: number): Point[] {
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  return values.map((value, index) => ({
    x: PAD.left + (values.length === 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth),
    y: PAD.top + innerHeight - (value / max) * innerHeight,
  }));
}

function linePath(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function areaPath(points: Point[]): string {
  if (points.length === 0) return "";
  const baseline = HEIGHT - PAD.bottom;
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L${last.x.toFixed(1)} ${baseline} L${first.x.toFixed(1)} ${baseline} Z`;
}

function labelIndexes(length: number): number[] {
  if (length <= 1) return [0];
  const count = Math.min(5, length);
  const indexes = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    indexes.add(Math.round((index * (length - 1)) / (count - 1)));
  }
  return [...indexes];
}

function ChartFrame({
  label,
  max,
  days,
  xPoints,
  children,
}: {
  label: string;
  max: number;
  days: string[];
  xPoints: Point[];
  children: ReactNode;
}) {
  const baseline = HEIGHT - PAD.bottom;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="200" preserveAspectRatio="xMidYMid meet">
      <line x1={PAD.left} y1={PAD.top} x2={WIDTH - PAD.right} y2={PAD.top} stroke={LABEL} strokeOpacity="0.2" strokeWidth="1" />
      <line x1={PAD.left} y1={baseline} x2={WIDTH - PAD.right} y2={baseline} stroke={LABEL} strokeOpacity="0.2" strokeWidth="1" />
      <text x={PAD.left - 8} y={PAD.top + 4} textAnchor="end" fontSize="11" fill={LABEL} fillOpacity="0.7">
        {max.toLocaleString("en-US")}
      </text>
      <text x={PAD.left - 8} y={baseline} textAnchor="end" fontSize="11" fill={LABEL} fillOpacity="0.7">
        0
      </text>
      {labelIndexes(days.length).map((index) => (
          <text key={days[index]} x={xPoints[index]?.x ?? PAD.left} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fill={LABEL} fillOpacity="0.7">
          {formatDay(days[index] ?? "")}
        </text>
      ))}
      {children}
    </svg>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <svg width="12" height="12" aria-hidden="true">
        <rect width="12" height="12" rx="2" fill={color} />
      </svg>
      <s-text color="subdued">{label}</s-text>
    </s-stack>
  );
}

function viewsLabel(series: AnalyticsSeriesPoint[]): string {
  const peak = series.reduce<(typeof series)[number] | undefined>((best, point) => {
    if (!best || point.views > best.views) return point;
    return best;
  }, undefined);
  if (!peak || peak.views === 0) return "No views in this period.";
  return `Daily views. Highest is ${countLabel(peak.views, "view", "views")} on ${formatDay(peak.day)}.`;
}

function outcomesLabel(series: AnalyticsSeriesPoint[]): string {
  const metrics = [
    { key: "clicks" as const, singular: "click", plural: "clicks" },
    { key: "submits" as const, singular: "submit", plural: "submits" },
    { key: "dismissals" as const, singular: "dismissal", plural: "dismissals" },
  ];
  let best = { value: 0, day: series[0]?.day ?? "", singular: "click", plural: "clicks" };
  for (const point of series) {
    for (const metric of metrics) {
      if (point[metric.key] > best.value) {
        best = { value: point[metric.key], day: point.day, singular: metric.singular, plural: metric.plural };
      }
    }
  }
  if (best.value === 0) return "No clicks, submits, or dismissals in this period.";
  return `Daily clicks, submits, and dismissals. Highest is ${countLabel(best.value, best.singular, best.plural)} on ${formatDay(best.day)}.`;
}

export function TrafficChart({ series }: { series: AnalyticsSeriesPoint[] }) {
  const values = series.map((point) => point.views);
  const peak = values.reduce((highest, value) => Math.max(highest, value), 0);
  const points = plot(values, Math.max(1, peak));
  return (
    <s-stack direction="block" gap="small-200">
      <ChartFrame label={viewsLabel(series)} max={peak} days={series.map((point) => point.day)} xPoints={points}>
        <path d={areaPath(points)} fill={VIEWS} fillOpacity="0.12" />
        <path d={linePath(points)} fill="none" stroke={VIEWS} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </ChartFrame>
      <Legend color={VIEWS} label="Views" />
    </s-stack>
  );
}

export function OutcomesChart({ series }: { series: AnalyticsSeriesPoint[] }) {
  const peak = series.reduce(
    (highest, point) => Math.max(highest, point.clicks, point.submits, point.dismissals),
    0,
  );
  const scale = Math.max(1, peak);
  const clicks = plot(series.map((point) => point.clicks), scale);
  const submits = plot(series.map((point) => point.submits), scale);
  const dismissals = plot(series.map((point) => point.dismissals), scale);
  return (
    <s-stack direction="block" gap="small-200">
      <ChartFrame label={outcomesLabel(series)} max={peak} days={series.map((point) => point.day)} xPoints={clicks}>
        <path d={linePath(clicks)} fill="none" stroke={CLICKS} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={linePath(submits)} fill="none" stroke={SUBMITS} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={linePath(dismissals)} fill="none" stroke={DISMISSALS} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </ChartFrame>
      <s-stack direction="inline" gap="base">
        <Legend color={CLICKS} label="Clicks" />
        <Legend color={SUBMITS} label="Submits" />
        <Legend color={DISMISSALS} label="Dismissals" />
      </s-stack>
    </s-stack>
  );
}

function ratePhrase(value: number | null): string {
  if (value == null) return "no submit rate";
  return `${(value * 100).toFixed(1)}%`;
}

export function SubmitRateBars({ a, b }: { a: AnalyticsVariant; b: AnalyticsVariant }) {
  const width = 248;
  const span = (value: number | null) => width * (value == null || value <= 0 ? 0 : Math.min(1, value));
  return (
    <svg
      role="img"
      aria-label={`Variant A submit rate ${ratePhrase(a.submitRate)}. Variant B submit rate ${ratePhrase(b.submitRate)}.`}
      viewBox="0 0 280 40"
      width="280"
      height="40"
    >
      <text x="0" y="12" fontSize="11" fill={LABEL}>
        A
      </text>
      <rect x="16" y="3" width={width} height="10" rx="2" fill={LABEL} fillOpacity="0.15" />
      <rect x="16" y="3" width={span(a.submitRate)} height="10" rx="2" fill={VIEWS} />
      <text x="0" y="32" fontSize="11" fill={LABEL}>
        B
      </text>
      <rect x="16" y="23" width={width} height="10" rx="2" fill={LABEL} fillOpacity="0.15" />
      <rect x="16" y="23" width={span(b.submitRate)} height="10" rx="2" fill={SUBMITS} />
    </svg>
  );
}
