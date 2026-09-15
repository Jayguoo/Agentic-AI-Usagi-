export const PHASES = ['listen', 'sniff', 'dash', 'bonk', 'deliver']

export const PHASE_META = {
  listen: {
    label: 'Listen',
    verb: 'Listening with both ears',
    agent: 'Usagi',
  },
  sniff: {
    label: 'Sniff',
    verb: 'Sniffing for useful signals',
    agent: 'Usagi',
  },
  dash: {
    label: 'Dash',
    verb: 'Dashing through local tools',
    agent: 'Usagi',
  },
  bonk: {
    label: 'Bonk',
    verb: 'Bonking a bad assumption',
    agent: 'Usagi',
  },
  deliver: {
    label: 'Deliver',
    verb: 'Task bundle delivered',
    agent: 'Usagi',
  },
}

const NODE_BLUEPRINTS = {
  listen: [
    ['task', 'Your request', 'task', 'Task intake', 0.98, null],
    ['place', 'Downloads', 'folder', 'Location resolver', 0.95, 'task'],
    ['rule', 'Keep originals safe', 'guardrail', 'Safety check', 0.92, 'task'],
    ['finish', 'Surface urgent work', 'goal', 'Outcome parser', 0.88, 'task'],
  ],
  sniff: [
    ['scent-1', 'Recent documents', 'signal', 'Local index', 0.91, 'place'],
    ['scent-2', 'Duplicate clusters', 'signal', 'Hash scan', 0.86, 'place'],
    ['scent-3', 'Urgent PDF', 'signal', 'Document reader', 0.78, 'finish'],
    ['scent-4', 'Protected items', 'guardrail', 'Permission scan', 0.94, 'rule'],
  ],
  dash: [
    ['hop-1', 'Group by project', 'action', 'Folder tool', 0.88, 'scent-1'],
    ['hop-2', 'Tag likely duplicates', 'action', 'Metadata tool', 0.83, 'scent-2'],
    ['hop-3', 'Pin urgent document', 'action', 'Desktop pin', 0.9, 'scent-3'],
    ['hop-4', 'Stage safe archive', 'action', 'File planner', 0.79, 'scent-4'],
  ],
  bonk: [
    ['bonk-1', 'Protected file collision', 'collision', 'Permission check', 0.98, 'hop-4'],
    ['reroute', 'Skip and explain', 'correction', 'Plan rewrite', 0.97, 'bonk-1'],
    ['verify', 'Originals untouched', 'guardrail', 'Integrity pass', 0.99, 'reroute'],
  ],
  deliver: [
    ['drop-1', 'Projects grouped', 'delivery', 'Desktop delivery', 0.95, 'hop-1'],
    ['drop-2', 'Duplicates tagged', 'delivery', 'Desktop delivery', 0.93, 'hop-2'],
    ['drop-3', 'Urgent work pinned', 'delivery', 'Desktop delivery', 0.96, 'hop-3'],
    ['drop-4', 'Protected file skipped', 'delivery', 'Desktop delivery', 0.99, 'verify'],
  ],
}

const EVENT_BLUEPRINTS = {
  listen: ['heard', 'Usagi caught the task. Both ears are locked on.'],
  sniff: ['scan', 'Local folders sniffed. Four useful scent trails found.'],
  dash: ['tools', 'Folder, metadata, and desktop tools launched together.'],
  bonk: ['bonk', 'Bonk. An archive rule touched a protected file, so Usagi rerouted safely.'],
  deliver: ['delivered', 'Everything useful landed on the desk. Originals stayed untouched.'],
}

function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function positionNode(prompt, id, index) {
  const seed = hashString(`${prompt}:${id}`)
  const lane = index % 4
  const depth = Math.floor(index / 4)
  const angle = ((seed % 1000) / 1000) * Math.PI * 1.35 - Math.PI * 0.7
  const radius = 2.2 + lane * 0.5 + depth * 0.22
  return [
    1.15 + Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.7,
    ((seed >>> 12) % 1000) / 330 - 1.5,
  ]
}

function nodesForPhase(prompt, phase, offset) {
  return NODE_BLUEPRINTS[phase].map((blueprint, index) => {
    const [id, label, kind, tool, confidence, parent] = blueprint
    return {
      id,
      label,
      kind,
      agent: 'Usagi',
      tool,
      confidence,
      parent,
      position: positionNode(prompt, id, offset + index),
    }
  })
}

function eventForPhase(phase, index) {
  const [type, text] = EVENT_BLUEPRINTS[phase]
  return { id: `${phase}-${index}`, phase, type, text }
}

export function createSimulation(prompt) {
  const cleanPrompt = prompt.trim()
  if (!cleanPrompt) throw new Error('Give Usagi a desktop task.')

  return {
    prompt: cleanPrompt,
    phase: 'listen',
    progress: 0,
    nodes: nodesForPhase(cleanPrompt, 'listen', 0),
    events: [eventForPhase('listen', 0)],
  }
}

export function advanceSimulation(simulation) {
  if (simulation.phase === 'deliver') return simulation

  const currentIndex = PHASES.indexOf(simulation.phase)
  const nextIndex = currentIndex + 1
  const nextPhase = PHASES[nextIndex]
  return {
    ...simulation,
    phase: nextPhase,
    progress: nextIndex / (PHASES.length - 1),
    nodes: [
      ...simulation.nodes,
      ...nodesForPhase(simulation.prompt, nextPhase, simulation.nodes.length),
    ],
    events: [...simulation.events, eventForPhase(nextPhase, simulation.events.length)],
  }
}

export function replayToPhase(simulation, targetPhase) {
  let replay = simulation
  while (replay.phase !== targetPhase && replay.phase !== 'deliver') {
    replay = advanceSimulation(replay)
  }
  return replay
}
