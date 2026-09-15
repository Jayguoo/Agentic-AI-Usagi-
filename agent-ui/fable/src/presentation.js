import { PHASES, PHASE_META } from './simulation.js'

export const DESKTOP_IDENTITY = {
  product: 'USAGI',
  category: 'Desktop agent',
  minimumWidth: 1180,
  minimumHeight: 720,
}

const TOOL_WINDOWS = {
  listen: {
    kind: 'task-intake',
    kicker: 'Task intake',
    title: 'Both ears are listening',
    lines: ['Resolve the target folder', 'Protect original files', 'Define a useful finish'],
  },
  sniff: {
    kind: 'desktop-scan',
    kicker: 'Local desktop scan',
    title: 'Useful scent trail',
    lines: ['Recent documents', 'Duplicate clusters', 'One urgent PDF', 'Protected items'],
  },
  dash: {
    kind: 'tool-runner',
    kicker: 'Parallel tools',
    title: 'Three hops in flight',
    lines: ['Group files by project', 'Tag likely duplicates', 'Pin urgent work'],
  },
  bonk: {
    kind: 'bonk',
    kicker: 'Self-correction',
    title: 'Bonk. Wrong target.',
    before: 'Archive every old item.',
    after: 'Skip protected items and explain why.',
    lines: ['Collision detected', 'Unsafe action canceled', 'Plan rerouted'],
  },
  deliver: {
    kind: 'delivery',
    kicker: 'Desktop delivery',
    title: 'Task bundle landed',
    lines: ['Projects grouped', 'Duplicates tagged', 'Urgent work pinned', 'Originals untouched'],
  },
}

export function getPhaseTelemetry(simulation) {
  const phaseIndex = PHASES.indexOf(simulation.phase)
  const nextPhase = PHASES[phaseIndex + 1]
  const meta = PHASE_META[simulation.phase]
  return {
    agent: meta.agent,
    stateLabel: meta.verb,
    phaseLabel: meta.label,
    nextLabel: nextPhase ? PHASE_META[nextPhase].label : 'Run again',
    nodeCount: simulation.nodes.length,
    eventCount: simulation.events.length,
  }
}

export function getToolView(simulation) {
  return TOOL_WINDOWS[simulation.phase]
}

export function getSelectedNodeCopy(node) {
  if (!node) {
    return {
      title: 'Pick a task object',
      body: 'Hover over the desk orbit, then select an object to inspect what Usagi is doing with it.',
      confidence: null,
      agent: 'Task orbit',
      tool: 'Waiting for a selection',
    }
  }

  return {
    title: node.label,
    body: `Usagi created this ${node.kind} while using ${node.tool.toLowerCase()}.`,
    confidence: `${Math.round(Math.min(1, Math.max(0, node.confidence)) * 100)}%`,
    agent: node.agent,
    tool: node.tool,
  }
}
