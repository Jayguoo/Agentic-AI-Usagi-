import { describe, expect, it } from 'vitest'
import { createSimulation, replayToPhase } from './simulation.js'
import {
  DESKTOP_IDENTITY,
  getPhaseTelemetry,
  getSelectedNodeCopy,
  getToolView,
} from './presentation.js'

describe('Usagi desktop identity', () => {
  it('defines the approved desktop-only identity', () => {
    expect(DESKTOP_IDENTITY).toEqual({
      product: 'USAGI',
      category: 'Desktop agent',
      minimumWidth: 1180,
      minimumHeight: 720,
    })
  })
})

describe('getPhaseTelemetry', () => {
  it('describes Usagi sniffing the desktop for useful signals', () => {
    const state = replayToPhase(createSimulation('Sort my Downloads folder.'), 'sniff')

    expect(getPhaseTelemetry(state)).toMatchObject({
      agent: 'Usagi',
      nextLabel: 'Dash',
      stateLabel: 'Sniffing for useful signals',
    })
  })

  it('turns the delivered state into a run-again action', () => {
    const state = replayToPhase(createSimulation('Sort my Downloads folder.'), 'deliver')
    expect(getPhaseTelemetry(state).nextLabel).toBe('Run again')
  })
})

describe('getToolView', () => {
  it('shows a local desktop scan instead of a browser window', () => {
    const state = replayToPhase(createSimulation('Sort my Downloads folder.'), 'sniff')

    expect(getToolView(state)).toMatchObject({
      kind: 'desktop-scan',
      title: 'Useful scent trail',
    })
    expect(getToolView(state).url).toBeUndefined()
  })

  it('shows the bonk correction during review', () => {
    const state = replayToPhase(createSimulation('Sort my Downloads folder.'), 'bonk')
    expect(getToolView(state).kind).toBe('bonk')
  })
})

describe('getSelectedNodeCopy', () => {
  it('invites the user to inspect a task object', () => {
    expect(getSelectedNodeCopy(null).title).toBe('Pick a task object')
  })

  it('formats confidence as a bounded whole percentage', () => {
    const node = createSimulation('Sort my Downloads folder.').nodes[0]
    expect(getSelectedNodeCopy(node).confidence).toBe('98%')
  })
})
