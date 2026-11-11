# Charts — Bklit UI

The files in this folder come from [Bklit UI](https://github.com/bklit/bklit-ui), installed from its shadcn registry (`@bklit/*` items: area-chart, line-chart, ring-chart, gauge-chart, sparkline, heatmap-chart, patterns, y-axis, legend and their dependencies). They are kept as upstream ships them, apart from small changes in `tooltip/`: the date pill and tooltip panel use the app's theme tokens instead of `dark:` classes, and `ChartTooltip` uses caller-supplied `dateLabels` for its title (so dates are localised).

App-level charts are composed in `src/components/app-charts.tsx`; theme tokens (`--chart-*`, `--legend-*`) live at the end of `src/app/globals.css`. `patterns/LICENSE-visx-pattern` covers the pattern helpers derived from visx.

## License

```
MIT License

Copyright (c) 2026 uixmat

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
