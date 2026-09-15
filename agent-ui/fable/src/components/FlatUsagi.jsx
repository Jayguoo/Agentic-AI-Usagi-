import usagiPng from '../assets/usagi.png'

export default function FlatUsagi({ phase, busy }) {
  return (
    <img
      className={`flat-usagi usagi-${phase} ${busy ? 'is-busy' : ''}`}
      src={usagiPng}
      alt={`Usagi in ${phase} mode`}
      draggable="false"
    />
  )
}
