type HintBarProps = {
  live: boolean
}

export function HintBar({ live }: HintBarProps) {
  return (
    <footer className="hint-bar">
      <div className="hint">
        j/k select · a allow · d deny · r this project · g this PC · enter details
        {live ? ' · LIVE' : ' · MOCK'}
      </div>
    </footer>
  )
}
