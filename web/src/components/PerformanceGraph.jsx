import { useMemo, useState } from "react";

const WIDTH = 760;
const HEIGHT = 248;
const PLOT = { left: 64, right: 24, top: 24, bottom: 42 };

function formatMoney(value, signed = false) {
  const amount = Number(value || 0);
  const result = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
  if (!signed || amount === 0) return amount < 0 ? `-${result}` : result;
  return `${amount > 0 ? "+" : "-"}${result}`;
}

function formatDate(value) {
  if (!value) return "Starting balance";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded trade";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function buildSeries(journal, currentEquity) {
  const trades = (journal || [])
    .filter((trade) => Number.isFinite(Number(trade?.pnl)))
    .map((trade) => ({ ...trade, pnl: Number(trade.pnl) }))
    .sort((a, b) => new Date(a.exitedAt || 0) - new Date(b.exitedAt || 0));
  const finalEquity = Number(currentEquity || 0);
  const realizedPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  let equity = finalEquity - realizedPnl;
  let peak = equity;
  const points = [{ equity, drawdown: 0, pnl: 0, symbol: "START", time: null }];

  trades.forEach((trade) => {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    points.push({
      equity,
      drawdown: peak > 0 ? (equity - peak) / peak : 0,
      pnl: trade.pnl,
      symbol: trade.symbol || "TRADE",
      time: trade.exitedAt,
    });
  });

  return { points, trades, realizedPnl };
}

function linePath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

export default function PerformanceGraph({ journal, currentEquity, riskLocked }) {
  const [mode, setMode] = useState("equity");
  const [inspectedIndex, setInspectedIndex] = useState(null);
  const series = useMemo(() => buildSeries(journal, currentEquity), [journal, currentEquity]);
  const activeIndex = Math.min(inspectedIndex ?? series.points.length - 1, series.points.length - 1);
  const values = series.points.map((point) => mode === "equity" ? point.equity : point.drawdown);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = mode === "equity" ? Math.max((rawMax - rawMin) * 0.18, Math.abs(rawMax) * 0.0015, 1) : Math.max((rawMax - rawMin) * 0.2, 0.005);
  const min = mode === "equity" ? rawMin - padding : rawMin - padding;
  const max = mode === "equity" ? rawMax + padding : Math.max(0, rawMax);
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const plotted = series.points.map((point, index) => ({
    ...point,
    x: PLOT.left + (series.points.length === 1 ? plotWidth : (index / (series.points.length - 1)) * plotWidth),
    y: PLOT.top + ((max - (mode === "equity" ? point.equity : point.drawdown)) / (max - min || 1)) * plotHeight,
  }));
  const active = plotted[Math.min(activeIndex, plotted.length - 1)] || plotted[0];
  const path = linePath(plotted);
  const area = `${path} L${plotted.at(-1).x.toFixed(2)} ${(HEIGHT - PLOT.bottom).toFixed(2)} L${plotted[0].x.toFixed(2)} ${(HEIGHT - PLOT.bottom).toFixed(2)} Z`;
  const winners = series.trades.filter((trade) => trade.pnl > 0).length;
  const worstDrawdown = Math.min(...series.points.map((point) => point.drawdown));
  const chartLabel = `Closed-trade ${mode} performance graph`;
  const tickValues = [max, (max + min) / 2, min];

  function inspect(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const pointerX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const nearest = plotted.reduce((best, point, index) => (
      Math.abs(point.x - pointerX) < Math.abs(plotted[best].x - pointerX) ? index : best
    ), 0);
    setInspectedIndex(nearest);
  }

  return (
    <section className="performance-trace">
      <header className="performance-trace-header">
        <div>
          <span>CLOSED-TRADE TELEMETRY</span>
          <h2>Performance trace</h2>
          <p><strong>{series.trades.length} closed trade{series.trades.length === 1 ? "" : "s"}</strong> · reconstructed from the journal</p>
        </div>
        <div className="performance-mode" role="group" aria-label="Performance graph view">
          <button type="button" className={mode === "equity" ? "is-active" : ""} aria-pressed={mode === "equity"} onClick={() => setMode("equity")}>Equity</button>
          <button type="button" className={mode === "drawdown" ? "is-active" : ""} aria-pressed={mode === "drawdown"} onClick={() => setMode("drawdown")}>Drawdown</button>
        </div>
      </header>

      <div className="performance-chart-shell">
        {!series.trades.length && (
          <div className="performance-empty-note">
            <strong>Waiting for closed-trade history</strong>
            <span>The current account value stays visible until the journal records a completed trade.</span>
          </div>
        )}
        <svg
          className={`performance-chart is-${mode}`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={chartLabel}
          onMouseMove={inspect}
          onMouseLeave={() => setInspectedIndex(null)}
        >
          <title>{chartLabel}</title>
          <defs>
            <linearGradient id={`performance-fill-${mode}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {tickValues.map((tick, index) => {
            const y = PLOT.top + (index / 2) * plotHeight;
            return (
              <g className="performance-grid-line" key={`${mode}-${index}`}>
                <line x1={PLOT.left} x2={WIDTH - PLOT.right} y1={y} y2={y} />
                <text x={PLOT.left - 10} y={y + 4}>{mode === "equity" ? formatMoney(tick) : `${(tick * 100).toFixed(1)}%`}</text>
              </g>
            );
          })}
          <path className="performance-area" d={area} fill={`url(#performance-fill-${mode})`} />
          <path className="performance-line" d={path} />
          {plotted.map((point, index) => <circle className="performance-point" key={`${point.time}-${index}`} cx={point.x} cy={point.y} r={index === activeIndex ? 5 : 2.5} />)}
          <g className="performance-crosshair">
            <line x1={active.x} x2={active.x} y1={PLOT.top} y2={HEIGHT - PLOT.bottom} />
            <circle cx={active.x} cy={active.y} r="7" />
          </g>
          <text className="performance-axis-date" x={PLOT.left} y={HEIGHT - 12}>START</text>
          <text className="performance-axis-date" x={WIDTH - PLOT.right} y={HEIGHT - 12} textAnchor="end">LATEST</text>
        </svg>

        <div className="performance-readout" style={{ left: `${Math.max(12, Math.min(88, (active.x / WIDTH) * 100))}%`, top: `${Math.max(20, (active.y / HEIGHT) * 100)}%` }}>
          <span>{active.symbol} · {formatDate(active.time)}</span>
          <strong>{mode === "equity" ? formatMoney(active.equity) : `${(active.drawdown * 100).toFixed(2)}%`}</strong>
          <small>{active.symbol === "START" ? "Journal baseline" : `${formatMoney(active.pnl, true)} realized`}</small>
        </div>
      </div>

      <footer className="performance-summary">
        <div><span>REALIZED P&amp;L</span><strong className={series.realizedPnl >= 0 ? "is-positive" : "is-negative"}>{formatMoney(series.realizedPnl, true)}</strong></div>
        <div><span>HIT RATE</span><strong>{series.trades.length ? `${Math.round((winners / series.trades.length) * 100)}%` : "—"}</strong></div>
        <div><span>Worst drawdown</span><strong>{(worstDrawdown * 100).toFixed(2)}%</strong></div>
        <div><span>RISK STATE</span><strong className={riskLocked ? "is-negative" : ""}>{riskLocked ? "LOCKED" : "CLEAR"}</strong></div>
      </footer>
    </section>
  );
}
