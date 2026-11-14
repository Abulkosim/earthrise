// Written with AI assistance (Claude); see the README.
// "Replay a real landing": missions that flew, what happened, and what the model says.
import './Replays.css'

export interface Replay {
  id: string
  siteId: string
  title: string
  landingUtc: string
  endUtc: string
  terrain: '20 m LOLA' | '240 m LOLA' | 'smooth sphere'
  happened: string
  model: string
  numbers: {
    sunElevationAtLandingDeg: number
    sunFractionAtLanding: number
    modelSunsetUtc: string | null
    modelSunriseUtc?: string
    earthElevationAboveTerrainAtLandingDeg: number
    earthClearShare: number
    eclipse?: { startUtc: string; maxUtc: string; endUtc: string }
  }
  sources: string[]
  /** changes to the default lander that this replay needs, e.g. SLIM's fixed west-facing array */
  mission?: { panelFixed?: boolean; panelAz?: number; panelTilt?: number }
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function Replays({ replays, onReplay, activeId }: { replays: Replay[]; onReplay(r: Replay): void; activeId?: string }) {
  return (
    <section className="replays" aria-label="Replay a real landing">
      <h2>Replay a real landing</h2>
      <ul className="replay-list">
        {replays.map((r) => {
          const active = r.id === activeId
          return (
            <li key={r.id} className={active ? 'on' : undefined}>
              <button type="button" className="text" aria-expanded={active} onClick={() => onReplay(r)}>{r.title}</button>
              {active && (
                <div className="replay-body">
                  <h3>What happened</h3>
                  <p>{r.happened}</p>
                  <h3>What the model says</h3>
                  <p>{r.model}</p>
                  <p className="replay-terrain">Terrain: {r.terrain}. Sources:</p>
                  <ul className="replay-sources">
                    {r.sources.map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer">{host(u)}</a></li>)}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
