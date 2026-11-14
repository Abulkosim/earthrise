// The mission brief, written as sentences with the numbers editable in place, and the map layer picker.
// Written with AI assistance (Claude); see the README.
import { useEffect, useState } from 'react'
import { LANDING_MAX_MS, LANDING_MIN_MS, LAYERS, toInputDate, type Brief as BriefT, type LayerId } from '../state'

function Num(p: { value: number; onChange(v: number): void; min?: number; max?: number; step?: number; unit?: string; label: string; width?: number }) {
  // keep the text while typing; commit valid numbers as they come
  const [text, setText] = useState(String(p.value))
  useEffect(() => { setText((t) => (Number(t) === p.value ? t : String(p.value))) }, [p.value])
  return (
    <span className="num">
      <input
        type="number" inputMode="decimal" aria-label={p.label} value={text} min={p.min} max={p.max} step={p.step ?? 1}
        style={{ width: `${p.width ?? Math.max(2, text.length) + 2.2}ch` }}
        onChange={(e) => {
          setText(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(v)) p.onChange(Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v)))
        }}
        onBlur={() => setText(String(p.value))}
      />
      {p.unit && <span className="unit">{p.unit}</span>}
    </span>
  )
}

export function Brief(p: { brief: BriefT; epochMs: number; onChange(b: BriefT): void }) {
  const b = p.brief, m = b.mission, n = b.needs
  const setM = (k: keyof typeof m, v: number | boolean) => p.onChange({ ...b, mission: { ...m, [k]: v } })
  const setN = (k: keyof typeof n, v: number | boolean) => p.onChange({ ...b, needs: { ...n, [k]: v } })
  return (
    <section className="brief" aria-label="Mission brief">
      <h2>Mission brief</h2>
      <p>
        Land on{' '}
        <input
          type="date" aria-label="Landing date (UTC)" className="date" value={toInputDate(p.epochMs + b.landing * 3600e3)}
          min={toInputDate(LANDING_MIN_MS)} max={toInputDate(LANDING_MAX_MS)}
          onChange={(e) => {
            const ms = Date.parse(e.target.value + 'T00:00:00Z')
            // min and max do not stop typed values: a year being typed arrives as 0002, 0020, ...
            if (Number.isFinite(ms) && ms >= LANDING_MIN_MS && ms <= LANDING_MAX_MS) p.onChange({ ...b, landing: (ms - p.epochMs) / 3600e3 })
          }}
        />{' '}
        and work for <Num label="Length of stay in days" value={b.stayDays} min={1} max={60} unit="days" onChange={(v) => p.onChange({ ...b, stayDays: Math.round(v) })} />.
      </p>
      <p>
        The solar array{' '}
        <select className="pick" aria-label="How the solar array is mounted" value={m.panelFixed ? 'fixed' : 'track'} onChange={(e) => setM('panelFixed', e.target.value === 'fixed')}>
          <option value="track">turns to follow the Sun</option>
          <option value="fixed">is fixed to the lander</option>
        </select>
        {m.panelFixed && (<>, facing <Num label="Azimuth the array faces, degrees from north" value={m.panelAz} min={0} max={359} step={5} unit="°" onChange={(v) => setM('panelAz', v)} /> from north
          and tilted <Num label="Tilt of the array from flat, degrees" value={m.panelTilt} min={0} max={180} step={5} unit="°" onChange={(v) => setM('panelTilt', v)} /> from flat</>)}. It
        gives <Num label="Array power in full Sun, watts" value={m.arrayW} min={0} max={20000} step={10} unit="W" onChange={(v) => setM('arrayW', v)} /> in
        full Sun and stands <Num label="Height of array and antenna above ground, metres" value={m.mast} min={0} max={30} step={0.5} unit="m" onChange={(v) => setM('mast', v)} /> above
        the ground. The lander draws <Num label="Load while lit, watts" value={m.loadLitW} min={0} max={20000} step={10} unit="W" onChange={(v) => setM('loadLitW', v)} /> when
        lit and <Num label="Load in the dark, watts" value={m.loadDarkW} min={0} max={20000} step={5} unit="W" onChange={(v) => setM('loadDarkW', v)} /> to
        stay warm in the dark, from a <Num label="Battery capacity, watt-hours" value={m.batteryWh} min={0} max={200000} step={100} unit="Wh"
          onChange={(v) => p.onChange({ ...b, mission: { ...m, batteryWh: v, startWh: v } })} /> battery.
      </p>
      <p>
        Radio contact needs the Earth <Num label="Clearance of the Earth above the terrain, degrees" value={m.earthMargin} min={0} max={10} step={0.5} unit="°" onChange={(v) => setM('earthMargin', v)} /> clear
        of the terrain{' '}
        <label className="check"><input type="checkbox" checked={m.needDsn} onChange={(e) => setM('needDsn', e.target.checked)} /> and a Deep Space Network station that can see the Moon</label>.
      </p>
      <p>
        It needs sunlight at least <Num label="Minimum share of sunlight, percent" value={Math.round(n.minLit * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => setN('minLit', v / 100)} /> of
        the time, no dark stretch longer than <Num label="Longest allowed dark stretch, hours" value={n.maxDarkH} min={0} max={1500} step={6} unit="h" onChange={(v) => setN('maxDarkH', v)} />,
        contact at least <Num label="Minimum share of contact, percent" value={Math.round(n.minComm * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => setN('minComm', v / 100)} /> of
        the time{' '}
        <label className="check"><input type="checkbox" checked={n.powerLasts} onChange={(e) => setN('powerLasts', e.target.checked)} /> and a battery that never runs empty</label>.
      </p>
      <p>
        <label className="check"><input type="checkbox" checked={n.psrKm > 0} onChange={(e) => setN('psrKm', e.target.checked ? 2 : 0)} /> The science team wants ground that never sees the Sun, where ice can last,</label>{' '}
        within <Num label="Largest distance to permanent shadow, kilometres" value={n.psrKm > 0 ? n.psrKm : 2} min={0.1} max={50} step={0.5} unit="km" onChange={(v) => setN('psrKm', v)} /> of
        the landing point.
      </p>
    </section>
  )
}

export function LayerPicker(p: { layer: LayerId; brief: BriefT; onChange(l: LayerId): void }) {
  const cur = LAYERS.find((l) => l.id === p.layer)!
  const legend = cur.legend?.(p.brief)
  return (
    <section className="layers" aria-label="What the map shows">
      <h2>The map shows</h2>
      <div role="radiogroup" aria-label="Map layer">
        {LAYERS.map((l) => (
          <label key={l.id} className={`layer hue-${l.hue}${l.id === p.layer ? ' on' : ''}`}>
            <input type="radio" name="layer" checked={l.id === p.layer} onChange={() => p.onChange(l.id)} />
            <span className="swatch" aria-hidden="true" />
            {l.label}
          </label>
        ))}
      </div>
      <p className="explain">{cur.explain}</p>
      {legend && (
        <p className={`legend hue-${cur.hue}`}>
          <span>{legend[0]}</span><span className="bar" aria-hidden="true" /><span>{legend[1]}</span>
        </p>
      )}
    </section>
  )
}
