import { ArcElement, Chart, Plugin } from 'chart.js';

export interface PieLabelOptions {
  format: (value: number) => string;
  textColor: string;
  mutedColor: string;
  lineColor: string;
  /** Optional text in the middle of a doughnut, e.g. the total. */
  center?: { label: string; value: string };
}

/** Horizontal room reserved on each side of the pie for labels. Pass to `layout.padding`. */
export const PIE_LABEL_PADDING = { left: 96, right: 96, top: 24, bottom: 24 };

const LINE_HEIGHT = 30; // two text lines per label
const ELBOW = 14; // how far past the slice edge the line bends
const TAIL = 12; // horizontal run after the bend

interface Label {
  x0: number;
  y0: number;
  elbowX: number;
  elbowY: number;
  y: number;
  right: boolean;
  name: string;
  amount: string;
  color: string;
}

/** Spreads labels on one side so they don't overlap, keeping them inside the chart. */
function spread(labels: Label[], top: number, bottom: number) {
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    labels[i].y = Math.max(labels[i].y, labels[i - 1].y + LINE_HEIGHT);
  }
  const overflow = labels.length ? labels[labels.length - 1].y - bottom : 0;
  if (overflow > 0) {
    labels[labels.length - 1].y -= overflow;
    for (let i = labels.length - 2; i >= 0; i--) {
      labels[i].y = Math.min(labels[i].y, labels[i + 1].y - LINE_HEIGHT);
    }
  }
  for (const l of labels) l.y = Math.max(l.y, top);
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth) text = text.slice(0, -1);
  return text + '…';
}

/**
 * Draws a thin line from the middle of each slice out to a label with the slice's name and amount.
 * Configure via `options.plugins.pieLabels` (PieLabelOptions).
 */
export const pieLabelsPlugin: Plugin<'pie' | 'doughnut'> = {
  id: 'pieLabels',
  afterDatasetsDraw(chart: Chart, _args, opts: PieLabelOptions) {
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0]?.data as number[] | undefined;
    if (!values?.length) return;

    const { ctx, chartArea } = chart;
    const names = (chart.data.labels ?? []) as string[];
    const colors = chart.data.datasets[0].backgroundColor as string[];
    const labels: Label[] = [];
    let cx = 0;
    let radius = 0;

    meta.data.forEach((el, i) => {
      if (!values[i] || !chart.getDataVisibility(i)) return;
      const arc = el as ArcElement;
      // Current (possibly mid-animation) geometry, so labels follow the slices as they animate in.
      const { x, y, startAngle, endAngle, innerRadius, outerRadius } = arc;
      cx = x;
      radius = Math.max(radius, outerRadius);
      const angle = (startAngle + endAngle) / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const mid = (innerRadius + outerRadius) / 2;
      const elbowY = y + sin * (outerRadius + ELBOW);
      labels.push({
        x0: x + cos * mid,
        y0: y + sin * mid,
        elbowX: x + cos * (outerRadius + ELBOW),
        elbowY,
        y: elbowY,
        right: cos >= 0,
        name: names[i] ?? '',
        amount: opts.format(values[i]),
        color: colors?.[i] ?? opts.lineColor,
      });
    });

    const top = chartArea.top - PIE_LABEL_PADDING.top + LINE_HEIGHT / 2;
    const bottom = chartArea.bottom + PIE_LABEL_PADDING.bottom - LINE_HEIGHT / 2;
    spread(labels.filter((l) => l.right), top, bottom);
    spread(labels.filter((l) => !l.right), top, bottom);

    ctx.save();
    if (opts.center && labels.length) {
      const inner = (meta.data[0] as ArcElement).innerRadius;
      const cy = (meta.data[0] as ArcElement).y;
      const valueSize = Math.max(11, Math.min(20, inner / 3.2));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `11px ${Chart.defaults.font.family}`;
      ctx.fillStyle = opts.mutedColor;
      ctx.fillText(opts.center.label, cx, cy - valueSize * 0.65);
      ctx.font = `700 ${valueSize}px ${Chart.defaults.font.family}`;
      ctx.fillStyle = opts.textColor;
      ctx.fillText(truncate(ctx, opts.center.value, inner * 1.8), cx, cy + valueSize * 0.45);
    }
    for (const l of labels) {
      const lineEndX = l.right ? cx + radius + ELBOW + TAIL : cx - radius - ELBOW - TAIL;
      const textX = l.right ? lineEndX + 4 : lineEndX - 4;
      const maxWidth = (l.right ? chart.width - textX : textX) - 2;

      ctx.strokeStyle = opts.lineColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(l.x0, l.y0);
      ctx.lineTo(l.elbowX, l.y);
      ctx.lineTo(lineEndX, l.y);
      ctx.stroke();

      ctx.fillStyle = opts.textColor;
      ctx.beginPath();
      ctx.arc(l.x0, l.y0, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = l.right ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `11px ${Chart.defaults.font.family}`;
      ctx.fillStyle = opts.mutedColor;
      ctx.fillText(truncate(ctx, l.name, maxWidth), textX, l.y - 7);
      ctx.font = `600 12px ${Chart.defaults.font.family}`;
      ctx.fillStyle = opts.textColor;
      ctx.fillText(truncate(ctx, l.amount, maxWidth), textX, l.y + 8);
    }
    ctx.restore();
  },
};
