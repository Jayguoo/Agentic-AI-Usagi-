import { describe, expect, it } from 'vitest'
import {
  PHASES,
  advanceSimulation,
  createSimulation,
  replayToPhase,
} from './simulation.js'

describe('Usagi desktop task loop', () => {
  it('uses the five approved hop phases', () => {
    expect(PHASES).toEqual(['listen', 'sniff', 'dash', 'bonk', 'deliver'])
  })

  it('rejects an empty desktop task', () => {
    expect(() => createSimulation('   ')).toThrow('Give Usagi a desktop task.')
  })

  it('starts by listening and creates tangible task objects', () => {
    const simulation = createSimulation('Sort my Downloads folder.')

    expect(simulation.phase).toBe('listen')
    expect(simulation.prompt).toBe('Sort my Downloads folder.')
    expect(simulation.nodes).toHaveLength(4)
    expect(simulation.events[0].type).toBe('heard')
  })

  it('bonks a bad assumption before delivering the task', () => {
    let simulation = createSimulation('Sort my Downloads folder.')

    for (let index = 0; index < 8 && simulation.phase !== 'deliver'; index += 1) {
      simulation = advanceSimulation(simulation)
    }

    expect(simulation.phase).toBe('deliver')
    expect(simulation.events.some((event) => event.type === 'bonk')).toBe(true)
    expect(simulation.nodes.some((node) => node.kind === 'delivery')).toBe(true)
    expect(simulation.progress).toBe(1)
  })

  it('keeps a delivered task stable', () => {
    const delivered = replayToPhase(createSimulation('Sort my Downloads folder.'), 'deliver')
    expect(advanceSimulation(delivered)).toEqual(delivered)
  })
})
