import { useMemo, useState } from "react";
import PerformanceGraph from "./PerformanceGraph";

const TABS = ["Overview", "Plans", "Portfolio", "Review"];

function money(value, currency = "USD", sign = false) {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));
  if (!sign || amount === 0) return amount < 0 ? `-${formatted}` : formatted;
  return `${amount > 0 ? "+" : "-"}${formatted}`;
}

function percent(value, digits = 1, signed = false) {
  const amount = Number(value || 0) * 100;
  return `${signed && amount > 0 ? "+" : ""}${amount.toFixed(digits)}%`;
}

function shortTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function freshnessAge(minutes) {
  if (minutes == null) return "Missing";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function planRange(plan) {
  const values = [plan.stop, plan.entry, plan.target].filter((value) => Number(value) > 0).map(Number);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const marker = (value) => `${Math.max(3, Math.min(97, ((Number(value) - min) / spread) * 100))}%`;
  return { stop: marker(plan.stop), entry: marker(plan.entry), target: marker(plan.target) };
}

function EmptyState({ children }) {
  return <div className="trade-empty">{children}</div>;
}

function PlanCard({ plan, featured = false }) {
  const range = planRange(plan);
  return (
    <article className={`trade-plan-card ${featured ? "is-featured" : ""}`}>
      <header>
        <div>
          <span>{plan.side || "WATCH"} / {plan.approved ? "APPROVED" : "REVIEW"}</span>
          <h3>{plan.symbol || "Unknown"}</h3>
        </div>
        <strong>{plan.riskReward ? `${Number(plan.riskReward).toFixed(1)}R` : "—"}</strong>
      </header>
      <p>{plan.thesis}</p>
      {range ? (
        <div className="risk-map" aria-label={`${plan.symbol} trade levels`}>
          <div className="risk-map-line" />
          {plan.stop && <i className="risk-stop" style={{ left: range.stop }}><span>STOP</span><b>{money(plan.stop)}</b></i>}
          {plan.entry && <i className="risk-entry" style={{ left: range.entry }}><span>ENTRY</span><b>{money(plan.entry)}</b></i>}
          {plan.target && <i className="risk-target" style={{ left: range.target }}><span>TARGET</span><b>{money(plan.target)}</b></i>}
        </div>
      ) : (
        <div className="plan-level-missing">Price levels are incomplete</div>
      )}
      <div className="plan-facts">
        <span><small>MAX LOSS</small><strong>{plan.maxLoss ? money(plan.maxLoss) : "—"}</strong></span>
        <span><small>SCORE</small><strong>{plan.score ? Number(plan.score).toFixed(1) : "—"}</strong></span>
        <span><small>NEWS</small><strong>{plan.newsCount || 0}</strong></span>
        <span><small>FILINGS</small><strong>{plan.filingCount || 0}</strong></span>
      </div>
      {(plan.headline || plan.failureConditions?.length > 0) && (
        <footer>
          {plan.failureConditions?.[0] || plan.headline}
        </footer>
      )}
    </article>
  );
}

function Overview({ snapshot }) {
  const leadPlan = snapshot.plans?.[0];
  return (
    <div className="trade-overview-grid">
      <PerformanceGraph journal={snapshot.journal} currentEquity={snapshot.account.equity} riskLocked={snapshot.risk.locked} />
      <section className="attention-board">
        <header className="trade-section-heading">
          <span>USAGI'S ATTENTION QUEUE</span>
          <strong>{snapshot.alerts?.length || 0}</strong>
        </header>
        <div className="attention-list">
          {snapshot.alerts?.length ? snapshot.alerts.map((alert, index) => (
            <article className={`attention-item is-${alert.severity}`} key={`${alert.title}-${index}`}>
              <i />
              <div><strong>{alert.title}</strong><p>{alert.detail}</p></div>
            </article>
          )) : <EmptyState>No risk or data alerts in the current snapshot.</EmptyState>}
        </div>
      </section>

      <section className="market-posture">
        <header className="trade-section-heading">
          <span>MARKET POSTURE</span>
          <strong>{snapshot.market.regime}</strong>
        </header>
        <div className="regime-score">
          <div><span style={{ width: `${Math.max(4, snapshot.market.score * 100)}%` }} /></div>
          <small>Regime confidence {percent(snapshot.market.score)}</small>
        </div>
        <div className="benchmark-list">
          {snapshot.market.benchmarks?.length ? snapshot.market.benchmarks.map((row) => {
            const baseline = Math.max(row.latest, row.sma50, row.sma200, 1);
            return (
              <div className="benchmark-row" key={row.symbol}>
                <strong>{row.symbol}</strong>
                <div className="benchmark-bars" aria-label={`${row.symbol} trend comparison`}>
                  <i style={{ width: `${(row.sma200 / baseline) * 100}%` }}><span>200D</span></i>
                  <i style={{ width: `${(row.sma50 / baseline) * 100}%` }}><span>50D</span></i>
                  <i className="is-latest" style={{ width: `${(row.latest / baseline) * 100}%` }}><span>NOW</span></i>
                </div>
                <small>{money(row.latest)}</small>
              </div>
            );
          }) : <EmptyState>No benchmark series is available.</EmptyState>}
        </div>
      </section>

      <section className="lead-plan">
        <header className="trade-section-heading">
          <span>NEXT PLAN TO REVIEW</span>
          <strong>{snapshot.plans?.length || 0} total</strong>
        </header>
        {leadPlan ? <PlanCard plan={leadPlan} featured /> : <EmptyState>No trade plan has been published by OpenTrade.</EmptyState>}
      </section>

      <section className="readiness-strip">
        <div><span>OBJECTIVE PASS</span><strong>{snapshot.performance.objective.passed}/{snapshot.performance.objective.candidates}</strong></div>
        <div><span>POSITION SIZE</span><strong>{percent(snapshot.market.sizeMultiplier, 0)}</strong></div>
        <div><span>PROTECTION</span><strong>{snapshot.risk.unprotected === 0 ? "Complete" : `${snapshot.risk.unprotected} missing`}</strong></div>
        <div><span>PAPER CHECK</span><strong>{snapshot.performance.paper.ok ? "Passed" : "Review"}</strong></div>
      </section>
    </div>
  );
}

function Plans({ snapshot }) {
  return (
    <section className="trade-panel-page">
      <header className="panel-page-heading">
        <div><span>WATCHLIST + VALIDATION</span><h2>Trade plans</h2></div>
        <p>Plans are observations only. Approval and execution remain outside Usagi.</p>
      </header>
      <div className="trade-plan-grid">
        {snapshot.plans?.length ? snapshot.plans.map((plan) => <PlanCard key={`${plan.symbol}-${plan.side}`} plan={plan} />) : <EmptyState>No plan candidates are available.</EmptyState>}
      </div>
    </section>
  );
}

function Portfolio({ snapshot }) {
  return (
    <div className="portfolio-grid">
      <section className="portfolio-table-card">
        <header className="panel-page-heading compact"><div><span>LIVE SNAPSHOT</span><h2>Open positions</h2></div></header>
        {snapshot.positions?.length ? (
          <div className="trade-table" role="table" aria-label="Open positions">
            <div className="trade-table-head" role="row"><span>SYMBOL</span><span>ENTRY / NOW</span><span>VALUE</span><span>P&amp;L</span><span>STOP</span></div>
            {snapshot.positions.map((position) => (
              <div className="trade-table-row" role="row" key={position.symbol}>
                <span><strong>{position.symbol}</strong><small>{position.side} · {position.quantity}</small></span>
                <span><strong>{money(position.currentPrice)}</strong><small>{money(position.entryPrice)} entry</small></span>
                <span><strong>{money(position.marketValue)}</strong></span>
                <span className={position.unrealizedPnl >= 0 ? "is-positive" : "is-negative"}><strong>{money(position.unrealizedPnl, "USD", true)}</strong><small>{percent(position.unrealizedPct, 2, true)}</small></span>
                <span><b className={position.protected ? "protection-ok" : "protection-bad"}>{position.protected ? "Protected" : "Missing"}</b></span>
              </div>
            ))}
          </div>
        ) : <EmptyState>No open positions in the latest portfolio snapshot.</EmptyState>}
      </section>

      <section className="portfolio-table-card">
        <header className="panel-page-heading compact"><div><span>BROKER LIFECYCLE</span><h2>Open orders</h2></div></header>
        {snapshot.orders?.length ? (
          <div className="trade-table orders" role="table" aria-label="Open orders">
            <div className="trade-table-head" role="row"><span>SYMBOL</span><span>SIDE</span><span>TYPE</span><span>LEVEL</span><span>STATUS</span></div>
            {snapshot.orders.map((order) => (
              <div className="trade-table-row" role="row" key={order.id || `${order.symbol}-${order.type}`}>
                <span><strong>{order.symbol}</strong><small>{order.quantity} shares</small></span>
                <span><strong>{order.side}</strong></span>
                <span><strong>{order.type}</strong></span>
                <span><strong>{order.stopPrice ? money(order.stopPrice) : order.limitPrice ? money(order.limitPrice) : "Market"}</strong></span>
                <span><b className="order-status">{order.status}</b></span>
              </div>
            ))}
          </div>
        ) : <EmptyState>No open orders in the latest portfolio snapshot.</EmptyState>}
      </section>

      <section className="account-risk-card">
        <header className="trade-section-heading"><span>ACCOUNT + RISK ENVELOPE</span><strong>{snapshot.account.status}</strong></header>
        <div className="account-risk-grid">
          <div><span>EQUITY</span><strong>{money(snapshot.account.equity, snapshot.account.currency)}</strong></div>
          <div><span>CASH</span><strong>{money(snapshot.account.cash, snapshot.account.currency)}</strong></div>
          <div><span>BUYING POWER</span><strong>{money(snapshot.account.buyingPower, snapshot.account.currency)}</strong></div>
          <div><span>DRAWDOWN</span><strong>{percent(snapshot.risk.drawdown)}</strong></div>
          <div><span>RISK STATE</span><strong>{snapshot.risk.locked ? "Locked" : "Clear"}</strong></div>
          <div><span>OPEN EXPOSURE</span><strong>{money(snapshot.positions.reduce((sum, row) => sum + Math.abs(row.marketValue || 0), 0))}</strong></div>
        </div>
      </section>
    </div>
  );
}

function Review({ snapshot }) {
  return (
    <div className="review-grid">
      <section className="decision-trail">
        <header className="panel-page-heading compact"><div><span>AGENT AUDIT</span><h2>Decision trail</h2></div></header>
        <div className="decision-list">
          {snapshot.decisions?.length ? snapshot.decisions.map((decision, index) => (
            <article key={`${decision.time}-${index}`}>
              <i className={decision.ok ? "is-ok" : "is-blocked"} />
              <time>{shortTime(decision.time)}</time>
              <div><strong>{decision.action}</strong><p>{decision.detail}</p><small>{decision.mode}</small></div>
            </article>
          )) : <EmptyState>No recent decisions were recorded.</EmptyState>}
        </div>
      </section>

      <section className="journal-card">
        <header className="panel-page-heading compact"><div><span>FEEDBACK LOOP</span><h2>Trade journal</h2></div></header>
        <div className="journal-list">
          {snapshot.journal?.length ? snapshot.journal.map((trade, index) => (
            <article key={`${trade.symbol}-${trade.exitedAt}-${index}`}>
              <div><strong>{trade.symbol}</strong><small>{trade.strategy || trade.side}</small></div>
              <div><strong className={trade.pnl >= 0 ? "is-positive" : "is-negative"}>{money(trade.pnl, "USD", true)}</strong><small>{percent(trade.returnPct, 2, true)}</small></div>
              <span>{String(trade.outcome).replaceAll("_", " ")}</span>
            </article>
          )) : <EmptyState>No journal entries are available.</EmptyState>}
        </div>
      </section>

      <section className="validation-card">
        <header className="panel-page-heading compact"><div><span>RESEARCH REALITY CHECK</span><h2>Walk-forward validation</h2></div></header>
        <div className="validation-list">
          {snapshot.performance.walkForward?.length ? snapshot.performance.walkForward.map((row) => (
            <article key={row.symbol}>
              <strong>{row.symbol}</strong>
              <div><span>RETURN</span><b>{percent(row.returnPct, 2, true)}</b></div>
              <div><span>MAX DD</span><b>{percent(row.maxDrawdown, 2)}</b></div>
              <div><span>STRESS</span><b>{percent(row.stressDrawdown, 2)}</b></div>
              <small>{row.windows} window{row.windows === 1 ? "" : "s"}</small>
            </article>
          )) : <EmptyState>No walk-forward summary is available.</EmptyState>}
        </div>
      </section>

      <section className="freshness-card">
        <header className="panel-page-heading compact"><div><span>DATA PROVENANCE</span><h2>Snapshot freshness</h2></div></header>
        <div className="freshness-list">
          {snapshot.freshness.files?.map((file) => (
            <div key={file.label}><span>{file.label}</span><strong>{file.ageMinutes == null ? "Missing" : `${freshnessAge(file.ageMinutes)} ago`}</strong></div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function TradeCompanion({ snapshot, loading, error, onRefresh, onOpenProject, onAskUsagi, asset }) {
  const [tab, setTab] = useState("Overview");
  const companionRead = useMemo(() => {
    if (error) return "I couldn't read the latest OpenTrade snapshot. Your trading files were not changed.";
    if (!snapshot?.connected) return "OpenTrade is not connected. I will stay safely in observation mode.";
    if (snapshot.risk.locked) return "The drawdown lock is the priority. I can explain the evidence, but I cannot release it or place a trade.";
    if (snapshot.alerts?.length) return `${snapshot.alerts.length} item${snapshot.alerts.length === 1 ? "" : "s"} need review before the next setup.`;
    return "The latest snapshot has no critical alerts. I am still watching freshness and protection.";
  }, [error, snapshot]);

  return (
    <section className="trade-companion" aria-label="Read-only Trade Companion">
      <header className="trade-companion-header">
        <div>
          <span>OPENTRADE / COMPANION MODE</span>
          <h1>Trade Companion</h1>
          <p>Usagi reads the desk, surfaces risk, and explains the plan. It cannot trade.</p>
        </div>
        <div className="trade-header-actions">
          <span className="read-only-pill">READ ONLY</span>
          <button type="button" onClick={onOpenProject}>Open OpenTrade</button>
          <button type="button" className="trade-refresh" onClick={onRefresh} disabled={loading} aria-label="Refresh trade data">{loading ? "Reading…" : "Refresh"}</button>
        </div>
      </header>

      {loading && !snapshot ? (
        <div className="trade-loading"><span /><span /><span /><strong>Usagi is reading the trading desk…</strong></div>
      ) : error || !snapshot ? (
        <div className="trade-error"><img src={asset} alt="Usagi companion" /><div><span>READ ERROR</span><h2>OpenTrade snapshot unavailable</h2><p>{error || "No snapshot was returned."}</p><button type="button" onClick={onRefresh}>Try again</button></div></div>
      ) : (
        <div className="trade-companion-body">
          <aside className="trade-usagi" aria-label="Usagi trading companion">
            <div className={`trade-usagi-art ${snapshot.risk.locked ? "is-alert" : ""}`}>
              <span>USAGI'S READ</span>
              <img src={asset} alt="Usagi trading companion" draggable="false" />
            </div>
            <div className="companion-note"><i /> <p>{companionRead}</p></div>
            <div className="companion-status">
              <div><span>MARKET</span><strong>{snapshot.market.isOpen ? "Open" : "Closed"}</strong></div>
              <div><span>RISK</span><strong>{snapshot.risk.locked ? "Locked" : "Clear"}</strong></div>
              <div><span>SYNC</span><strong>{freshnessAge(snapshot.freshness.ageMinutes)}</strong></div>
            </div>
            <button type="button" className="ask-trade-button" onClick={() => onAskUsagi("Explain today's OpenTrade readiness, highest-priority risk, and the next plan I should review. Do not execute or modify anything.")}>Ask Usagi to explain</button>
            <small>OpenTrade remains the execution boundary.</small>
          </aside>

          <section className="trade-desk">
            <div className="trade-metric-tape">
              <div><span>ACCOUNT EQUITY</span><strong>{money(snapshot.account.equity, snapshot.account.currency)}</strong><small>{snapshot.account.status}</small></div>
              <div><span>BUYING POWER</span><strong>{money(snapshot.account.buyingPower, snapshot.account.currency)}</strong><small>Paper account</small></div>
              <div><span>MARKET REGIME</span><strong>{snapshot.market.regime}</strong><small>{percent(snapshot.market.score)} confidence</small></div>
              <div className={snapshot.risk.locked ? "is-danger" : ""}><span>RISK ENVELOPE</span><strong>{snapshot.risk.locked ? "LOCKED" : "CLEAR"}</strong><small>{snapshot.risk.locked ? String(snapshot.risk.reason).replaceAll("_", " ") : "No lock detected"}</small></div>
              <div><span>OPEN EXPOSURE</span><strong>{snapshot.positions.length} / {snapshot.orders.length}</strong><small>positions / orders</small></div>
            </div>

            <nav className="trade-tabs" aria-label="Trade companion sections">
              {TABS.map((item) => <button type="button" key={item} className={tab === item ? "is-active" : ""} aria-current={tab === item ? "page" : undefined} onClick={() => setTab(item)}>{item}</button>)}
            </nav>

            <div className="trade-panel">
              {tab === "Overview" && <Overview snapshot={snapshot} />}
              {tab === "Plans" && <Plans snapshot={snapshot} />}
              {tab === "Portfolio" && <Portfolio snapshot={snapshot} />}
              {tab === "Review" && <Review snapshot={snapshot} />}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
