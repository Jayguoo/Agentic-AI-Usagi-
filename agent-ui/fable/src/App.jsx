import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Pause,
  Play,
  Rabbit,
  SpeakerHigh,
  SpeakerSlash,
} from '@phosphor-icons/react'
import FlatUsagi from './components/FlatUsagi.jsx'
import PhaseRail from './components/PhaseRail.jsx'
import TaskInspector from './components/TaskInspector.jsx'
import { useAgentAudio } from './hooks/useAgentAudio.js'
import {
  advanceSimulation,
  createSimulation,
  replayToPhase,
} from './simulation.js'
import {
  getPhaseTelemetry,
  getSelectedNodeCopy,
  getToolView,
} from './presentation.js'

const DEFAULT_TASK = 'Sort my Downloads folder and surface anything urgent.'

export default function App() {
  const [simulation, setSimulation] = useState(() => createSimulation(DEFAULT_TASK))
  const [input, setInput] = useState(DEFAULT_TASK)
  const [selectedNode, setSelectedNode] = useState(null)
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const launchTimer = useRef(null)
  const audio = useAgentAudio(simulation.phase)

  const telemetry = useMemo(() => getPhaseTelemetry(simulation), [simulation])
  const tool = useMemo(() => getToolView(simulation), [simulation])
  const inspector = useMemo(() => getSelectedNodeCopy(selectedNode), [selectedNode])
  const currentEvent = simulation.events.at(-1)
  const recentNodes = simulation.nodes.slice(-5).reverse()

  useEffect(() => {
    if (paused || busy || simulation.phase === 'deliver') return undefined
    const timer = window.setTimeout(() => {
      setSimulation((current) => advanceSimulation(current))
    }, 3100)
    return () => window.clearTimeout(timer)
  }, [busy, paused, simulation.phase])

  useEffect(() => () => window.clearTimeout(launchTimer.current), [])

  const launch = (task) => {
    const cleanTask = task.trim()
    if (!cleanTask) {
      setError('Give Usagi a desktop task.')
      return
    }

    setError('')
    setBusy(true)
    setSelectedNode(null)
    setPaused(false)
    audio.playLaunch()
    window.clearTimeout(launchTimer.current)
    launchTimer.current = window.setTimeout(() => {
      setSimulation(createSimulation(cleanTask))
      setBusy(false)
    }, 650)
  }

  const selectPhase = (targetPhase) => {
    setSimulation(replayToPhase(createSimulation(simulation.prompt), targetPhase))
    setPaused(true)
    setSelectedNode(null)
  }

  const taskState = simulation.phase === 'deliver'
    ? 'Task delivered'
    : paused
      ? 'Task paused'
      : 'Usagi is active'

  return (
    <main className={`desktop-shell phase-${simulation.phase}`} role="application" aria-label="USAGI desktop agent">
      <header className="app-bar">
        <div className="app-brand">
          <Rabbit size={21} weight="fill" />
          <div>
            <strong>USAGI</strong>
            <span>Desktop agent</span>
          </div>
        </div>

        <div className="app-status">
          <i aria-hidden="true" />
          <span className="status-copy">{telemetry.stateLabel}</span>
        </div>

        <div className="app-actions">
          <span>LOCAL SESSION</span>
          <button
            type="button"
            className="icon-action tooltip"
            data-tooltip={paused ? 'Resume task' : 'Pause task'}
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? 'Resume task' : 'Pause task'}
          >
            {paused ? <Play size={17} weight="fill" /> : <Pause size={17} weight="fill" />}
          </button>
          <button
            type="button"
            className="icon-action tooltip"
            data-tooltip={audio.muted ? 'Enable sound' : 'Mute sound'}
            onClick={audio.toggleMuted}
            aria-label={audio.muted ? 'Enable sound' : 'Mute sound'}
          >
            {audio.muted ? <SpeakerSlash size={18} /> : <SpeakerHigh size={18} weight="fill" />}
          </button>
        </div>
      </header>

      <section className="quiet-task-canvas">
        <section className="task-workspace">
          <header className="task-heading">
            <div>
              <span>ACTIVE TASK</span>
              <h1>{simulation.prompt}</h1>
            </div>
            <div className="task-mode">
              <span>{telemetry.phaseLabel}</span>
              <small>{telemetry.nodeCount} objects</small>
            </div>
          </header>

          <div className="work-body">
            <button
              type="button"
              className="mascot-button"
              onClick={audio.playSelect}
              aria-label="Encourage Usagi"
            >
              <FlatUsagi phase={simulation.phase} busy={busy} />
            </button>

            <section className="run-summary" aria-label="Current agent activity">
              <div className="current-event">
                <span>{currentEvent.type}</span>
                <h2>{telemetry.stateLabel}</h2>
                <p>{currentEvent.text}</p>
              </div>

              <div className="object-list">
                <header>
                  <span>TASK OBJECTS</span>
                  <small>Select to inspect</small>
                </header>
                {recentNodes.map((node) => (
                  <button
                    type="button"
                    key={node.id}
                    className={selectedNode?.id === node.id ? 'is-selected' : ''}
                    onClick={() => {
                      setSelectedNode(node)
                      audio.playSelect()
                    }}
                  >
                    <span>{node.kind}</span>
                    <strong>{node.label}</strong>
                    <small>{Math.round(node.confidence * 100)}%</small>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <PhaseRail phase={simulation.phase} onSelect={selectPhase} />
        </section>

        <TaskInspector tool={tool} inspector={inspector} phase={telemetry.phaseLabel} busy={busy} />

        <form
          className={`command-row ${error ? 'has-error' : ''}`}
          onSubmit={(event) => {
            event.preventDefault()
            launch(input)
          }}
        >
          <label htmlFor="desktop-task">Desktop task</label>
          <div>
            <Rabbit size={19} weight="fill" aria-hidden="true" />
            <input
              id="desktop-task"
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                if (error) setError('')
              }}
              placeholder="Give Usagi something useful to do"
              autoComplete="off"
            />
            <button type="submit" disabled={busy}>{busy ? 'Hopping' : 'Hop to it'}</button>
          </div>
          <footer>
            <span>{error || `${telemetry.nodeCount} task objects`}</span>
            <span>{taskState}</span>
          </footer>
        </form>
      </section>

      <div className="sr-only" aria-live="assertive">
        {busy ? 'Usagi is hopping into action.' : `Usagi is ${telemetry.stateLabel.toLowerCase()}.`}
      </div>
    </main>
  )
}
