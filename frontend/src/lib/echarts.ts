// Custom ECharts build — only import what we actually use.
// See: https://echarts.apache.org/en/tutorial.html#Use%20ECharts%20with%20bundler%20and%20NPM
import * as echarts from "echarts/core";

// Chart types
import { LineChart } from "echarts/charts";

// Components
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
} from "echarts/components";

// Renderer — use canvas (smaller than SVG renderer)
import { CanvasRenderer } from "echarts/renderers";

// Register everything once
echarts.use([
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer,
]);

export * from "echarts/core";
export { graphic } from "echarts/core";
