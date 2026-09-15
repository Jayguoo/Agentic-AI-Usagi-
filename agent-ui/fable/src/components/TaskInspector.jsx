import {
  ArrowRight,
  CheckCircle,
  Ear,
  FolderOpen,
  Lightning,
  MagnifyingGlass,
  Package,
  Warning,
} from '@phosphor-icons/react'

const ICONS = {
  'task-intake': Ear,
  'desktop-scan': MagnifyingGlass,
  'tool-runner': Lightning,
  bonk: Warning,
  delivery: Package,
}

export default function TaskInspector({ tool, inspector, phase, busy }) {
  const Icon = ICONS[tool.kind] || FolderOpen

  return (
    <aside className="task-inspector" aria-label="Task inspector">
      <header className="inspector-header">
        <div className="inspector-icon"><Icon size={19} weight="fill" /></div>
        <div>
          <strong>{tool.kicker}</strong>
          <span>Local tool</span>
        </div>
        <small>{phase}</small>
      </header>

      <section className="inspector-tool-view">
        {busy ? (
          <div className="inspector-loading" aria-label="Usagi is hopping into action">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <>
            <h2>{tool.title}</h2>
            {tool.before && (
              <div className="inspector-rewrite">
                <span>{tool.before}</span>
                <ArrowRight size={16} weight="bold" />
                <strong>{tool.after}</strong>
              </div>
            )}
            <div className="inspector-checks">
              {tool.lines.map((line) => (
                <div key={line}>
                  <CheckCircle size={16} weight="fill" />
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="inspector-object" aria-live="polite">
        <div>
          <span>{inspector.agent}</span>
          {inspector.confidence && <strong>{inspector.confidence}</strong>}
        </div>
        <h3>{inspector.title}</h3>
        <p>{inspector.body}</p>
        <small>{inspector.tool}</small>
      </section>
    </aside>
  )
}
