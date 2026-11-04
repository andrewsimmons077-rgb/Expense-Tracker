import { Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';

Chart.register(...registerables);

/** Thin Chart.js wrapper: re-renders whenever the config input changes. */
@Component({
  selector: 'app-chart',
  template: '<div class="chart-box"><canvas #canvas></canvas></div>',
  styles: `
    :host { display: block; }
    .chart-box { position: relative; height: var(--chart-height, 280px); }
  `,
})
export class ChartComponent implements OnDestroy {
  readonly config = input.required<ChartConfiguration<ChartType>>();
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;
  private chartType?: ChartType;

  constructor() {
    effect(() => {
      const config = this.config();
      const canvas = this.canvas().nativeElement;
      const options = { responsive: true, maintainAspectRatio: false, ...config.options };
      if (this.chart && this.chartType === config.type) {
        this.chart.data = config.data;
        this.chart.options = options;
        this.chart.update();
      } else {
        this.chart?.destroy();
        this.chartType = config.type;
        this.chart = new Chart(canvas, { ...config, options });
      }
    });
  }

  ngOnDestroy() {
    this.chart?.destroy();
  }
}
