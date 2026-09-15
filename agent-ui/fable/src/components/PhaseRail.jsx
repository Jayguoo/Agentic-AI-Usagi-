import { PHASES, PHASE_META } from '../simulation.js'

export default function PhaseRail({ phase, onSelect }) {
  const currentIndex = PHASES.indexOf(phase)

  return (
    <nav className="phase-trail" aria-label="Usagi task phases">
      {PHASES.map((item, index) => (
        <button
          type="button"
          key={item}
          className={index === currentIndex ? 'is-current' : index < currentIndex ? 'is-past' : ''}
          onClick={() => onSelect(item)}
          aria-current={index === currentIndex ? 'step' : undefined}
        >
          <i aria-hidden="true" />
          <span>{PHASE_META[item].label}</span>
        </button>
      ))}
    </nav>
  )
}
