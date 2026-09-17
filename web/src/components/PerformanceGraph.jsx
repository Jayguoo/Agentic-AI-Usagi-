import { useEffect, useMemo, useRef, useState } from "react";

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

export const TRADINGVIEW_WIDGET_SRC = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

function TradingViewLiveChart({ symbol, theme }) {
  const container = useRef(null);

  // TradingView's embed script reads its JSON config from the script body and injects the chart iframe.
  // The component is keyed by symbol, so each symbol gets a fresh container instead of a stale iframe.
  useEffect(() => {
    const node = container.current;
    if (!node || node.querySelector("script")) return;
    const script = document.createElement("script");
    script.src = TRADINGVIEW_WIDGET_SRC;
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "5",
      timezone: "America/New_York",
      theme: theme === "dark" ? "dark" : "light",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      calendar: false,
      withdateranges: true,
      save_image: false,
      support_host: "https://www.tradingview.com",
    });
    node.appendChild(script);
  }, [symbol, theme]);

  return (
    <div className="tradingview-widget-container" ref={container} aria-label={`${symbol} live TradingView chart`}>
      <div className="tradingview-widget-container__widget" />
      <div className="tradingview-widget-copyright">
        <a href={`https://www.tradingview.com/symbols/${encodeURIComponent(symbol)}/`} rel="noopener nofollow" target="_blank">
          <span className="blue-text">{symbol} chart</span>
        </a>
        <span className="trademark"> by TradingView</span>
      </div>
    </div>
  );
}

export function chartUrl(chart) {
  return `/api/trades/chart?symbol=${encodeURIComponent(chart.symbol)}&v=${encodeURIComponent(chart.capturedAt || "")}`;
}

export function tradeReviewText(trade) {
  const { review } = trade;
  if (!review) return null;
  const result = trade.pnl > 0 ? "made money" : "lost";
  if (review.status === "done") return { label: trade.pnl > 0 ? "WHY IT MADE MONEY" : "WHY IT LOST", text: review.explanation };
  if (review.status === "error") return { label: "TRADE RESEARCH FAILED", text: `${review.error} Usagi will retry automatically.` };
  return { label: "RESEARCHING", text: `Usagi is researching why this trade ${result}.` };
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
  const points = [{ equity, drawdown: 0, pnl: 0, symbol: "START", time: null, reason: null }];

  trades.forEach((trade) => {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    points.push({
      equity,
      drawdown: peak > 0 ? (equity - peak) / peak : 0,
      pnl: trade.pnl,
      symbol: trade.symbol || "TRADE",
      time: trade.exitedAt,
      reason: tradeReviewText(trade),
    });
  });

  return { points, trades, realizedPnl };
}

function svgPointerX(svg, clientX) {
  // The chart keeps its aspect ratio, so the drawing can sit inset inside the element.
  // Ask the SVG itself where the pointer lands; fall back to the same letterbox maths.
  const matrix = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
  if (matrix && typeof DOMPoint === "function") {
    return new DOMPoint(clientX, 0).matrixTransform(matrix.inverse()).x;
  }
  const rect = svg.getBoundingClientRect();
  if (!rect.width) return null;
  const height = rect.height || (rect.width * HEIGHT) / WIDTH;
  const scale = Math.min(rect.width / WIDTH, height / HEIGHT);
  return (clientX - rect.left - (rect.width - WIDTH * scale) / 2) / scale;
}

function formatScaled(value, spread, percent = false) {
  // Show just enough decimals to tell the visible levels apart once zoomed in.
  const size = percent ? spread * 100 : spread;
  const digits = size >= 10 ? (percent ? 1 : 0) : size >= 1 ? 2 : size >= 0.01 ? 3 : 5;
  if (percent) return `${(value * 100).toFixed(digits)}%`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function linePath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

export default function PerformanceGraph({ journal, currentEquity, riskLocked, watchSymbols = [], theme = "light" }) {
  const [source, setSource] = useState("usagi");
  const [chartSymbol, setChartSymbol] = useState(null);
  const [mode, setMode] = useState("equity");
  const [inspectedIndex, setInspectedIndex] = useState(null);
  const [view, setView] = useState(null);
  const chartRef = useRef(null);
  const dragRef = useRef(null);
  const series = useMemo(() => buildSeries(journal, currentEquity), [journal, currentEquity]);

  // The view is a window over the journal: `span` intervals starting at point `start`.
  const fullSpan = Math.max(1, series.points.length - 1);
  const span = Math.max(1, Math.min(view?.span ?? fullSpan, fullSpan));
  const start = Math.max(0, Math.min(view?.start ?? 0, fullSpan - span));
  const zoomed = span < fullSpan;
  const points = series.points.slice(start, start + span + 1);

  const activeIndex = Math.min(inspectedIndex ?? points.length - 1, points.length - 1);
  const values = points.map((point) => mode === "equity" ? point.equity : point.drawdown);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Pad from the visible spread so zooming into small moves still shows their shape;
  // a flat window falls back to a tiny padding just to keep the line off the axis.
  const spread = rawMax - rawMin;
  const padding = mode === "equity"
    ? (spread > 0 ? spread * 0.18 : Math.max(Math.abs(rawMax) * 0.0005, 0.01))
    : (spread > 0 ? spread * 0.2 : 0.0005);
  const min = mode === "equity" ? rawMin - padding : rawMin - padding;
  const max = mode === "equity" ? rawMax + padding : Math.max(0, rawMax);
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const plotted = points.map((point, index) => ({
    ...point,
    x: PLOT.left + (points.length === 1 ? plotWidth : (index / (points.length - 1)) * plotWidth),
    y: PLOT.top + ((max - (mode === "equity" ? point.equity : point.drawdown)) / (max - min || 1)) * plotHeight,
  }));
  const active = plotted[Math.min(activeIndex, plotted.length - 1)] || plotted[0];
  const path = linePath(plotted);
  const area = `${path} L${plotted.at(-1).x.toFixed(2)} ${(HEIGHT - PLOT.bottom).toFixed(2)} L${plotted[0].x.toFixed(2)} ${(HEIGHT - PLOT.bottom).toFixed(2)} Z`;
  const winners = series.trades.filter((trade) => trade.pnl > 0).length;
  const worstDrawdown = Math.min(...series.points.map((point) => point.drawdown));
  const chartLabel = `Closed-trade ${mode} performance graph`;
  const tickValues = [max, (max + min) / 2, min];
  const latestSymbol = series.trades.at(-1)?.symbol;
  const symbolChoices = [...new Set([...watchSymbols, ...series.trades.map((trade) => trade.symbol)])]
    .filter((symbol) => symbol && symbol !== "TRADE");
  const liveSymbol = chartSymbol || latestSymbol || symbolChoices[0] || "SPY";

  function clampStart(value, nextSpan = span) {
    return Math.max(0, Math.min(fullSpan - nextSpan, Math.round(value)));
  }

  function zoomBy(factor, anchor) {
    const nextSpan = Math.max(1, Math.min(fullSpan, Math.round(span * factor)));
    const focus = Number.isFinite(anchor) ? anchor : start + span / 2;
    const ratio = (focus - start) / span;
    setView({ span: nextSpan, start: clampStart(focus - ratio * nextSpan, nextSpan) });
    setInspectedIndex(null);
  }

  function fit() {
    setView(null);
    setInspectedIndex(null);
  }

  // Wheel needs a non-passive listener so zooming does not scroll the panel behind it.
  useEffect(() => {
    const svg = chartRef.current;
    if (!svg) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const pointerX = svgPointerX(svg, event.clientX);
      const anchor = pointerX === null ? undefined : start + ((pointerX - PLOT.left) / plotWidth) * span;
      zoomBy(event.deltaY < 0 ? 0.75 : 1.35, anchor);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });

  function inspect(event) {
    const svg = event.currentTarget;
    const pointerX = svgPointerX(svg, event.clientX);
    if (pointerX === null) return;
    const drag = dragRef.current;
    if (drag) {
      const from = svgPointerX(svg, drag.clientX);
      if (from !== null) setView({ span, start: clampStart(drag.start + ((from - pointerX) / plotWidth) * span) });
      return;
    }
    const nearest = plotted.reduce((best, point, index) => (
      Math.abs(point.x - pointerX) < Math.abs(plotted[best].x - pointerX) ? index : best
    ), 0);
    setInspectedIndex(nearest);
  }

  return (
    <section className="performance-trace">
      <header className="performance-trace-header">
        {source === "usagi" ? (
          <div>
            <span>CLOSED-TRADE TELEMETRY</span>
            <h2>Performance trace</h2>
            <p>
              <strong>{series.trades.length} closed trade{series.trades.length === 1 ? "" : "s"}</strong>
              {zoomed ? ` · showing trades ${Math.max(1, start)}–${start + span} · drag to pan` : " · reconstructed from the journal"}
            </p>
          </div>
        ) : (
          <div>
            <span>TRADINGVIEW · LIVE</span>
            <h2>TradingView chart</h2>
            <p><strong>{liveSymbol}</strong> · 5m · zoom, scroll, and change timeframe or indicators inside the chart</p>
          </div>
        )}
        <div className="performance-controls">
          {source === "usagi" && (
            <>
              <div className="performance-mode" role="group" aria-label="Zoom performance graph">
                <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1.7)} disabled={!zoomed}>−</button>
                <button type="button" aria-label="Zoom in" onClick={() => zoomBy(0.6)} disabled={span <= 1}>+</button>
                <button type="button" onClick={fit} disabled={!zoomed}>Fit</button>
              </div>
              <div className="performance-mode" role="group" aria-label="Performance graph view">
                <button type="button" className={mode === "equity" ? "is-active" : ""} aria-pressed={mode === "equity"} onClick={() => setMode("equity")}>Equity</button>
                <button type="button" className={mode === "drawdown" ? "is-active" : ""} aria-pressed={mode === "drawdown"} onClick={() => setMode("drawdown")}>Drawdown</button>
              </div>
            </>
          )}
          {source === "tradingview" && symbolChoices.length > 1 && (
            <div className="performance-mode" role="group" aria-label="TradingView symbol">
              {symbolChoices.map((symbol) => (
                <button
                  type="button"
                  key={symbol}
                  className={symbol === liveSymbol ? "is-active" : ""}
                  aria-pressed={symbol === liveSymbol}
                  onClick={() => setChartSymbol(symbol)}
                >
                  {symbol}
                </button>
              ))}
            </div>
          )}
          <div className="performance-mode" role="group" aria-label="Graph source">
            <button type="button" className={source === "usagi" ? "is-active" : ""} aria-pressed={source === "usagi"} onClick={() => setSource("usagi")}>My graph</button>
            <button type="button" className={source === "tradingview" ? "is-active" : ""} aria-pressed={source === "tradingview"} onClick={() => setSource("tradingview")}>TradingView</button>
          </div>
        </div>
      </header>

      {source === "tradingview" ? (
        <div className="performance-chart-shell is-tradingview">
          <TradingViewLiveChart key={`${liveSymbol}-${theme}`} symbol={liveSymbol} theme={theme} />
        </div>
      ) : (
      <div className="performance-chart-shell">
        {!series.trades.length && (
          <div className="performance-empty-note">
            <strong>Waiting for closed-trade history</strong>
            <span>The current account value stays visible until the journal records a completed trade.</span>
          </div>
        )}
        <svg
          ref={chartRef}
          className={`performance-chart is-${mode} ${zoomed ? "is-zoomed" : ""}`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={chartLabel}
          onMouseMove={inspect}
          onMouseDown={(event) => { if (zoomed) dragRef.current = { clientX: event.clientX, start }; }}
          onMouseUp={() => { dragRef.current = null; }}
          onMouseLeave={() => { dragRef.current = null; setInspectedIndex(null); }}
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
                <text x={PLOT.left - 10} y={y + 4}>{formatScaled(tick, max - min, mode !== "equity")}</text>
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

        <div
          className={`performance-readout ${active.reason && active.y < HEIGHT / 2 ? "is-below" : ""}`}
          style={{ left: `${Math.max(12, Math.min(88, (active.x / WIDTH) * 100))}%`, top: `${Math.max(20, (active.y / HEIGHT) * 100)}%` }}
        >
          <span>{active.symbol} · {formatDate(active.time)}</span>
          <strong>{formatScaled(mode === "equity" ? active.equity : active.drawdown, max - min, mode !== "equity")}</strong>
          <small>{active.symbol === "START" ? "Journal baseline" : `${formatMoney(active.pnl, true)} realized`}</small>
          {active.reason && (
            <em className={`performance-reason is-${active.pnl > 0 ? "profit" : "loss"}`}>
              <b>{active.reason.label}</b>
              <span>{active.reason.text}</span>
            </em>
          )}
        </div>
      </div>
      )}

      <footer className="performance-summary">
        <div><span>REALIZED P&amp;L</span><strong className={series.realizedPnl >= 0 ? "is-positive" : "is-negative"}>{formatMoney(series.realizedPnl, true)}</strong></div>
        <div><span>HIT RATE</span><strong>{series.trades.length ? `${Math.round((winners / series.trades.length) * 100)}%` : "—"}</strong></div>
        <div><span>Worst drawdown</span><strong>{(worstDrawdown * 100).toFixed(2)}%</strong></div>
        <div><span>RISK STATE</span><strong className={riskLocked ? "is-negative" : ""}>{riskLocked ? "LOCKED" : "CLEAR"}</strong></div>
      </footer>
    </section>
  );
}
