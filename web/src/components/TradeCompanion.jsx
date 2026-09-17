import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import PerformanceGraph, { chartUrl, tradeReviewText } from "./PerformanceGraph";

const TABS = ["Overview", "Automations", "Portfolio", "Review"];

function money(value, currency = "USD", sign = false) {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: amount !== 0 && Math.abs(amount) < 0.01 ? 6 : 2,
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

function PlanApproval({ plan, onDecidePlan }) {
  const state = plan.approved
    ? { label: "APPROVED", className: "is-approved" }
    : plan.approvalDecision === "reject"
      ? { label: "REJECTED", className: "is-rejected" }
      : { label: "NOT APPROVED", className: "" };
  return (
    <div className="plan-approval">
      <div>
        <b className={state.className}>{state.label}</b>
        {plan.approvalBlockedReason && <small>Blocked: {plan.approvalBlockedReason}</small>}
      </div>
      <div className="plan-approval-actions">
        <button type="button" onClick={() => onDecidePlan(plan.symbol, plan.side, "approve")} disabled={plan.approved}>
          Approve
        </button>
        <button type="button" onClick={() => onDecidePlan(plan.symbol, plan.side, "reject")} disabled={plan.approvalDecision === "reject"}>
          Reject
        </button>
        <button type="button" onClick={() => onDecidePlan(plan.symbol, plan.side, "clear")} disabled={!plan.approvalDecision}>
          Clear
        </button>
      </div>
    </div>
  );
}

function PlanCard({ plan, featured = false, onDecidePlan }) {
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
      {onDecidePlan && <PlanApproval plan={plan} onDecidePlan={onDecidePlan} />}
    </article>
  );
}

function Overview({ snapshot, onDecidePlan, theme }) {
  const leadPlan = snapshot.plans?.[0];
  return (
    <div className="trade-overview-grid">
      <PerformanceGraph
        journal={snapshot.journal}
        currentEquity={snapshot.account.equity}
        riskLocked={snapshot.risk.locked}
        watchSymbols={(snapshot.research?.symbols || []).map((row) => row.symbol)}
        theme={theme}
      />
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
        {leadPlan ? <PlanCard plan={leadPlan} featured onDecidePlan={onDecidePlan} /> : <EmptyState>No trade plan has been published by OpenTrade.</EmptyState>}
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

function TradingViewCharts({ tradingview }) {
  const charts = tradingview?.charts || [];
  const available = charts.filter((chart) => chart.available);
  return (
    <section className="research-card tradingview-card" aria-label="TradingView charts">
      <header className="trade-section-heading">
        <span>TRADINGVIEW CHARTS{tradingview?.timeframe ? ` · ${tradingview.timeframe}M` : ""}</span>
        <strong>{tradingview?.generatedAt ? shortTime(tradingview.generatedAt) : "Not run"}</strong>
      </header>
      {tradingview?.problem && <p className="tradingview-problem">{tradingview.problem}</p>}
      {available.length > 0 && (
        <div className="tradingview-grid">
          {available.map((chart) => (
            <figure key={chart.symbol}>
              <img src={chartUrl(chart)} alt={`${chart.symbol} TradingView chart`} loading="lazy" />
              <figcaption><strong>{chart.symbol}</strong><small>Captured {shortTime(chart.capturedAt)}</small></figcaption>
            </figure>
          ))}
        </div>
      )}
      {!available.length && !tradingview?.problem && <EmptyState>No TradingView charts have been captured yet.</EmptyState>}
      <small className="tradingview-note">Human review only. OpenTrade never trades from these charts.</small>
    </section>
  );
}

const RUN_STATUS = {
  completed: "Completed",
  warning: "Completed with warnings",
  failed: "Some steps failed",
  running: "Running now",
  unknown: "No result recorded",
};

function RoutineCard({ routine }) {
  const run = routine.lastRun;
  const status = routine.managedBy ? "Managed in session" : run ? RUN_STATUS[run.status] || run.status : "No run recorded";
  return (
    <article className={`routine-card is-${run?.status || "missing"}`}>
      <header>
        <div>
          <span>{routine.managedBy ? "CHECKED DURING THE TRADING SESSION" : routine.scheduledAt ? `RUNS ${routine.scheduledAt} ON WEEKDAYS` : "NO SEPARATE SCHEDULE"}</span>
          <h3>{routine.label}</h3>
        </div>
        <b className={`routine-status is-${run?.status || "missing"}`}>{status}</b>
      </header>
      <p>{routine.managedBy
        ? `Risk checks run inside ${routine.managedBy}.${routine.managedRun ? ` Latest session: ${shortTime(routine.managedRun.startedAt)}; ${routine.managedRun.riskChecks} checks recorded.` : " No session checks recorded yet."}`
        : run ? `Last run ${shortTime(run.startedAt)}${routine.ageMinutes != null ? ` · ${freshnessAge(routine.ageMinutes)} ago` : ""}` : "No run was found in the available scheduler log."}</p>
      <ul className="routine-steps" aria-label={`${routine.label} steps`}>
        {routine.steps.map((step) => <li key={step}>{step}</li>)}
      </ul>
      {!routine.managedBy && run?.failures?.length > 0 && (
        <div className="routine-failures">
          <span>FAILED IN THIS RUN</span>
          <ul>{run.failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>
        </div>
      )}
      {!routine.managedBy && run?.warnings?.length > 0 && (
        <div className="routine-warnings">
          <span>SKIPPED OR BLOCKED IN THIS RUN</span>
          <ul>{run.warnings.map((warning) => <li key={warning}>{warning}{routine.resolvedWarnings?.includes(warning) ? " (resolved after this run)" : ""}</li>)}</ul>
        </div>
      )}
      {run?.artifacts?.length > 0 && (
        <footer>Wrote {run.artifacts.join(", ")}</footer>
      )}
    </article>
  );
}

function Automations({ snapshot }) {
  const automations = snapshot.automations || { routines: [], recentRuns: [] };
  const research = snapshot.research || {};
  const leaders = research.leaderWatch || {};
  return (
    <section className="trade-panel-page">
      <header className="panel-page-heading">
        <div><span>AUTOMATION RUNS + RESEARCH</span><h2>Automations</h2></div>
        <p>What OpenTrade ran on its own, whether it went through, and what the pre-market research found.</p>
      </header>

      {automations.notifications && (
        <p role="status">Windows notifications: {automations.notifications.ok ? "last delivery accepted" : "delivery failed"}
          {automations.notifications.generated_at ? ` · ${shortTime(automations.notifications.generated_at)}` : ""}
          {automations.notifications.error ? ` · ${automations.notifications.error}` : ""}</p>
      )}

      <div className="routine-grid">
        {automations.routines?.length
          ? automations.routines.map((routine) => <RoutineCard key={routine.name} routine={routine} />)
          : <EmptyState>No scheduled routines were found in OpenTrade.</EmptyState>}
      </div>

      <section className="research-card">
        <header className="trade-section-heading">
          <span>PRE-MARKET RESEARCH</span>
          <strong>{research.generatedAt ? shortTime(research.generatedAt) : "Not available"}</strong>
        </header>
        {research.generatedAt ? (
          <div className="research-body">
            <div className="research-regime">
              <div><span>MARKET READ</span><strong>{research.regime?.state}</strong><small>{percent(research.regime?.score)} confidence</small></div>
              <ul>
                {[...(research.regime?.notes || []), ...(research.regime?.macroNotes || [])].map((note) => <li key={note}>{note}</li>)}
              </ul>
            </div>

            <div className="research-providers" aria-label="Research providers">
              {research.providers?.map((provider) => (
                <span key={provider.provider} className={`provider-chip is-${provider.state}`}>
                  <b>{provider.provider}</b>
                  <small>{provider.detail || provider.state}</small>
                </span>
              ))}
            </div>

            {research.riskFlags?.length > 0 && (
              <div className="research-flags">
                <span>RISK FLAGS</span>
                <ul>{research.riskFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
              </div>
            )}

            <div className="research-symbols">
              {research.symbols?.length ? research.symbols.map((symbol) => (
                <article key={symbol.symbol}>
                  <header><strong>{symbol.symbol}</strong><small>{symbol.newsCount} news · {symbol.filingCount} filings</small></header>
                  {symbol.headlines.length ? (
                    <ul>
                      {symbol.headlines.map((headline) => (
                        <li key={headline.title}>
                          {headline.url
                            ? <a href={headline.url} target="_blank" rel="noreferrer">{headline.title}</a>
                            : headline.title}
                          <i>{headline.source}</i>
                        </li>
                      ))}
                    </ul>
                  ) : <p>No headlines were collected.</p>}
                </article>
              )) : <EmptyState>Research collected no symbol context.</EmptyState>}
            </div>

            {leaders.symbols?.length > 0 && (
              <div className="research-leaders">
                <span>LEADER WATCH · {leaders.person || "Disclosures"}{leaders.researchOnly ? " · RESEARCH ONLY" : ""}</span>
                <ul>
                  {leaders.symbols.map((symbol) => (
                    <li key={symbol.symbol}>
                      <strong>{symbol.symbol}</strong> {symbol.actions.join(", ")} · signal {symbol.score.toFixed(2)}
                      {symbol.headlines[0] && (symbol.headlines[0].url
                        ? <a href={symbol.headlines[0].url} target="_blank" rel="noreferrer">{symbol.headlines[0].title}</a>
                        : <span>{symbol.headlines[0].title}</span>)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : <EmptyState>OpenTrade has not published a market research snapshot.</EmptyState>}
      </section>

      <TradingViewCharts tradingview={snapshot.tradingview} />

      <section className="run-history">
        <header className="trade-section-heading"><span>RECENT AUTOMATION RUNS</span><strong>{automations.recentRuns?.length || 0}</strong></header>
        <div className="run-history-list">
          {automations.recentRuns?.length ? automations.recentRuns.map((run, index) => (
            <div className={`run-row is-${run.status}`} key={`${run.name}-${run.startedAt}-${index}`}>
              <i />
              <time>{shortTime(run.startedAt)}</time>
              <strong>{run.name}</strong>
              <span>{RUN_STATUS[run.status] || run.status}</span>
              <small>{run.failures?.[0] || run.warnings?.[0] || (run.artifacts?.length ? `wrote ${run.artifacts.length} file${run.artifacts.length === 1 ? "" : "s"}` : "")}</small>
            </div>
          )) : <EmptyState>No scheduler runs were recorded yet.</EmptyState>}
        </div>
      </section>
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

function AuditDetail({ decision, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const title = decision.title || decision.action;
  return (
    <div className="audit-detail-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="audit-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title">
        <header>
          <div>
            <span>AGENT AUDIT / {decision.mode || "DECISION"}</span>
            <h2 id="audit-detail-title">{title}</h2>
          </div>
          <button type="button" aria-label="Close audit details" onClick={onClose} autoFocus>×</button>
        </header>
        <div className={`audit-detail-outcome ${decision.ok ? "is-ok" : "is-blocked"}`}>
          <i />
          <div><span>{decision.ok ? "COMPLETED" : "NO ACTION TAKEN"}</span><time>{shortTime(decision.time)}</time></div>
        </div>
        <section className="audit-detail-reason">
          <span>SPECIFIC REASON</span>
          <p>{decision.detail}</p>
        </section>
        <p className="audit-detail-explanation">{decision.explanation || "OpenTrade did not record a longer explanation for this decision."}</p>
        <dl className="audit-evidence">
          {(decision.evidence || []).map((item, index) => (
            <div key={`${item.label}-${index}`}><dt>{item.label}</dt><dd>{item.value}</dd></div>
          ))}
        </dl>
        <footer>
          <small>{decision.basis || "Reported from OpenTrade's decision log."}</small>
          <span>Recorded action: {decision.action}</span>
        </footer>
      </section>
    </div>
  );
}

function price(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value || 0));
}

function heldTime(start, end) {
  const seconds = Math.round((new Date(end) - new Date(start)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function TradeReviewPreview({ trade }) {
  const { label, text } = tradeReviewText(trade);
  return (
    <span className={`trade-review is-${trade.review.status} ${trade.pnl > 0 ? "is-profit" : "is-loss"}`}>
      <b>{label}{trade.review.sentiment && <i className={`sentiment-stance is-${trade.review.sentiment.stance}`}>Public: {trade.review.sentiment.stance}</i>}</b>
      <em>{text}</em>
    </span>
  );
}

function TradeDetail({ trade, chart, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const { review } = trade;
  const held = heldTime(trade.enteredAt, trade.exitedAt);
  const facts = [
    trade.enteredAt && { label: "Entry", value: `${shortTime(trade.enteredAt)}${trade.entryPrice ? ` · ${price(trade.entryPrice)}` : ""}` },
    trade.exitedAt && { label: "Exit", value: `${shortTime(trade.exitedAt)}${trade.exitPrice ? ` · ${price(trade.exitPrice)}` : ""}` },
    held && { label: "Held", value: held },
    trade.quantity > 0 && { label: "Quantity", value: `${trade.quantity} shares` },
    trade.entryPrice > 0 && { label: "Price move", value: `${price(trade.exitPrice - trade.entryPrice)} per share` },
    trade.feesAllocated !== undefined && { label: "Fees", value: trade.feesAllocated ? "Included in P&L" : "Not allocated; P&L is before fees" },
    ...(trade.evidence || []),
  ].filter(Boolean);

  return createPortal(
    <div className="audit-detail-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="audit-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="trade-detail-title">
        <header>
          <div>
            <span>TRADE JOURNAL / {trade.strategy || "CLOSED TRADE"}</span>
            <h2 id="trade-detail-title">{trade.symbol} {trade.side} trade</h2>
          </div>
          <button type="button" aria-label="Close trade details" onClick={onClose} autoFocus>×</button>
        </header>
        <div className={`audit-detail-outcome ${trade.pnl >= 0 ? "is-ok" : "is-blocked"}`}>
          <i />
          <div><span>{String(trade.outcome).replaceAll("_", " ")} · {money(trade.pnl, "USD", true)} · {percent(trade.returnPct, 3, true)}</span><time>{shortTime(trade.exitedAt)}</time></div>
        </div>
        {review && (
          <section className={`audit-detail-reason trade-review-reason is-${review.status} ${trade.pnl > 0 ? "is-profit" : "is-loss"}`} aria-label={trade.pnl > 0 ? "Why this trade made money" : "Why this trade lost"}>
            <span>{tradeReviewText(trade).label} · USAGI RESEARCH</span>
            <p>{tradeReviewText(trade).text}</p>
          </section>
        )}
        {review?.sentiment && (
          <section className="trade-sentiment" aria-label="Public sentiment">
            <span>PUBLIC SENTIMENT <i className={`sentiment-stance is-${review.sentiment.stance}`}>{review.sentiment.stance}</i></span>
            <p>{review.sentiment.summary}</p>
          </section>
        )}
        {review?.psychology && (
          <section className="trade-sentiment trade-psychology" aria-label="Trade psychology">
            <span>PSYCHOLOGY</span>
            <p><strong>Market mood:</strong> {review.psychology.market}</p>
            <p><strong>Decision behavior:</strong> {review.psychology.decision}</p>
            {review.psychology.biases?.length > 0 && (
              <ul aria-label="Behavioral biases">
                {review.psychology.biases.map((bias) => <li key={bias}>{bias}</li>)}
              </ul>
            )}
          </section>
        )}
        {review?.status === "done" && !review.psychology && (
          <p className="audit-detail-explanation">Sentiment and psychology research is queued for this trade.</p>
        )}
        {review?.lesson && <p className="audit-detail-explanation"><strong>Next time:</strong> {review.lesson}</p>}
        {review?.sources?.length > 0 && (
          <section className="trade-detail-list">
            <span>SOURCES</span>
            <ul>
              {review.sources.map((source) => (
                <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a></li>
              ))}
            </ul>
          </section>
        )}
        {review?.status === "done" && !review.sources?.length && (
          <p className="audit-detail-explanation">No web source covered this trade's window, so the explanation rests on the trade and order evidence.</p>
        )}
        {review?.queries?.length > 0 && (
          <section className="trade-detail-list">
            <span>SEARCHED</span>
            <ul>{review.queries.map((query) => <li key={query}>{query}</li>)}</ul>
          </section>
        )}
        {review?.warnings?.length > 0 && (
          <section className="trade-detail-list">
            <span>RESEARCH WARNINGS</span>
            <ul>{review.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </section>
        )}
        {chart && (
          <section className="trade-detail-list trade-chart">
            <span>TRADINGVIEW CHART</span>
            <img src={chartUrl(chart)} alt={`${trade.symbol} TradingView chart`} />
            <small>Latest capture, {shortTime(chart.capturedAt)}. It shows the chart at that time, not when this trade happened.</small>
          </section>
        )}
        <dl className="audit-evidence">
          {facts.map((item, index) => (
            <div key={`${item.label}-${index}`}><dt>{item.label}</dt><dd>{item.value}</dd></div>
          ))}
        </dl>
        {trade.notes?.length > 0 && (
          <section className="trade-detail-list">
            <span>OPENTRADE NOTES</span>
            <ul>{trade.notes.map((note) => <li key={note}>{note}</li>)}</ul>
          </section>
        )}
        <footer>
          <small>Reconstructed from OpenTrade's broker fills and decision log.</small>
          <span>{review?.reviewedAt ? `Researched ${shortTime(review.reviewedAt)}` : "Read only"}</span>
        </footer>
      </section>
    </div>,
    document.body
  );
}

function Review({ snapshot }) {
  const [selectedDecision, setSelectedDecision] = useState(null);
  const [selectedTradeId, setSelectedTradeId] = useState(null);
  const selectedTrade = snapshot.journal?.find((trade, index) => (trade.id || `${trade.symbol}-${trade.exitedAt}-${index}`) === selectedTradeId);
  return (
    <div className="review-grid">
      <section className="decision-trail">
        <header className="panel-page-heading compact"><div><span>AGENT AUDIT</span><h2>Decision trail</h2></div></header>
        <div className="decision-list">
          {snapshot.decisions?.length ? snapshot.decisions.map((decision, index) => (
            <article key={`${decision.time}-${index}`}>
              <button type="button" className="audit-decision-button" aria-label={`Open details: ${decision.title || decision.action}`} onClick={() => setSelectedDecision(decision)}>
                <i className={decision.ok ? "is-ok" : "is-blocked"} />
                <time>{shortTime(decision.time)}</time>
                <div><strong>{decision.title || decision.action}</strong><p>{decision.detail}</p><small>{decision.mode} · Click for full reason</small></div>
              </button>
            </article>
          )) : <EmptyState>No recent decisions were recorded.</EmptyState>}
        </div>
      </section>

      <section className="journal-card">
        <header className="panel-page-heading compact"><div><span>FEEDBACK LOOP</span><h2>Trade journal</h2></div></header>
        <div className="journal-list">
          {snapshot.journal?.length ? snapshot.journal.map((trade, index) => {
            const key = trade.id || `${trade.symbol}-${trade.exitedAt}-${index}`;
            return (
              <article key={key}>
                <button type="button" className="journal-trade-button" aria-label={`Open trade details: ${trade.symbol} ${trade.outcome} ${money(trade.pnl, "USD", true)}`} onClick={() => setSelectedTradeId(key)}>
                  <div><strong>{trade.symbol}</strong><small>{trade.strategy || trade.side}</small></div>
                  <div><strong className={trade.pnl >= 0 ? "is-positive" : "is-negative"}>{money(trade.pnl, "USD", true)}</strong><small>{percent(trade.returnPct, 2, true)}</small></div>
                  <span>{String(trade.outcome).replaceAll("_", " ")}</span>
                  {trade.entryPrice > 0 && (
                    <small className="journal-fill">{trade.side} · {shortTime(trade.enteredAt)} → {shortTime(trade.exitedAt)} · {money(trade.entryPrice)} → {money(trade.exitPrice)} · Click for details</small>
                  )}
                  {trade.review && <TradeReviewPreview trade={trade} />}
                </button>
              </article>
            );
          }) : <EmptyState>No journal entries are available.</EmptyState>}
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
      {selectedDecision && <AuditDetail decision={selectedDecision} onClose={() => setSelectedDecision(null)} />}
      {selectedTrade && (
        <TradeDetail
          trade={selectedTrade}
          chart={snapshot.tradingview?.charts?.find((chart) => chart.symbol === selectedTrade.symbol && chart.available)}
          onClose={() => setSelectedTradeId(null)}
        />
      )}
    </div>
  );
}

export default function TradeCompanion({ snapshot, loading, error, onRefresh, onOpenProject, onAskUsagi, onChangeMode, onChangeAccount, onDecidePlan, asset, theme = "light" }) {
  const [tab, setTab] = useState("Overview");
  const [confirmingWrite, setConfirmingWrite] = useState(false);
  const readOnly = snapshot?.readOnly !== false;
  const accounts = snapshot?.accounts || [];
  const decidePlan = !readOnly && onDecidePlan ? onDecidePlan : null;
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
          {accounts.length > 1 && (
            <label className="account-picker">
              <span>ACCOUNT</span>
              <select
                value={snapshot.accountId || "primary"}
                onChange={(event) => onChangeAccount(event.target.value)}
                aria-label="Trading account"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.label}</option>
                ))}
              </select>
            </label>
          )}
          {confirmingWrite ? (
            <span className="write-confirm" role="group" aria-label="Confirm plan approvals">
              <b>Allow plan approvals?</b>
              <button type="button" onClick={() => { setConfirmingWrite(false); onChangeMode(false); }}>Enable</button>
              <button type="button" onClick={() => setConfirmingWrite(false)}>Cancel</button>
            </span>
          ) : (
            <button
              type="button"
              className={`read-only-pill ${readOnly ? "" : "is-write"}`}
              aria-pressed={!readOnly}
              onClick={() => (readOnly ? setConfirmingWrite(true) : onChangeMode(true))}
              disabled={!onChangeMode || (readOnly && snapshot?.paperOnly === false)}
              title={snapshot?.paperOnly === false ? "OpenTrade is not on the paper endpoint" : undefined}
            >
              {readOnly ? "READ ONLY" : "PLAN APPROVALS ON"}
            </button>
          )}
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
            {snapshot.account?.label && (
            <div className="companion-account">
              <span>ACCOUNT</span>
              <strong>{snapshot.account.label}</strong>
              <small>{snapshot.paperOnly === false ? "Live endpoint" : "Paper"}</small>
            </div>
          )}
          {snapshot.accounts?.find((account) => account.id === snapshot.accountId)?.sharedWithPrimary?.length > 0 && (
            <p className="companion-shared">
              Shares the primary account's {snapshot.accounts.find((account) => account.id === snapshot.accountId).sharedWithPrimary.join(", ")} file
              {snapshot.accounts.find((account) => account.id === snapshot.accountId).sharedWithPrimary.length === 1 ? "" : "s"}.
            </p>
          )}
          <div className="companion-status">
              <div><span>MARKET</span><strong>{snapshot.market.isOpen ? "Open" : "Closed"}</strong></div>
              <div><span>RISK</span><strong>{snapshot.risk.locked ? "Locked" : "Clear"}</strong></div>
              <div><span>SYNC</span><strong>{freshnessAge(snapshot.freshness.ageMinutes)}</strong></div>
            </div>
            <button type="button" className="ask-trade-button" onClick={() => onAskUsagi("Explain today's OpenTrade readiness, highest-priority risk, and the next plan I should review. Do not execute or modify anything.")}>Ask Usagi to explain</button>
            <small>{readOnly ? "OpenTrade remains the execution boundary." : "Approvals only. OpenTrade still places every order."}</small>
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
              {tab === "Overview" && <Overview snapshot={snapshot} onDecidePlan={decidePlan} theme={theme} />}
              {tab === "Automations" && <Automations snapshot={snapshot} />}
              {tab === "Portfolio" && <Portfolio snapshot={snapshot} />}
              {tab === "Review" && <Review snapshot={snapshot} />}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
