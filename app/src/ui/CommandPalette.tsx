// Written with AI assistance (Claude); see the README.
// "Find a site": a command palette over the known sites, grouped by kind. Two numbers typed as
// "-89.45 222.69" or "-89.45, 222.69" offer to go to that latitude and east longitude.
import { MapPin, Navigation } from 'lucide-react'
import { memo, useEffect, useMemo, useState } from 'react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { Site } from '../model/types'
import { fmtLat, fmtLon } from '../state'

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  sites: Site[]
  groups: [Site['kind'], string][]
  onSite(s: Site): void
  /** latitude and east longitude as typed, in degrees */
  onCoords(lat: number, lon: number): void
}

/** "-89.45 222.69", "-89.45, 222.69", "-89.45;222.69": latitude then east longitude. */
export function parseCoords(text: string): { lat: number; lon: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*°?\s*(?:[,;]\s*|\s+)(-?\d+(?:\.\d+)?)\s*°?$/)
  if (!m) return null
  const lat = Number(m[1]), lon = Number(m[2])
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 ? { lat, lon } : null
}

/** Memoised: pass stable handlers. */
export const CommandPalette = memo(function CommandPalette(p: Props) {
  const [query, setQuery] = useState('')
  const { open, onOpenChange } = p
  // Command K or Control K opens and closes it from anywhere
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); onOpenChange(!open) }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, onOpenChange])
  useEffect(() => { if (!open) setQuery('') }, [open])
  const coords = useMemo(() => parseCoords(query), [query])
  const pick = (run: () => void) => { onOpenChange(false); run() }
  return (
    <CommandDialog
      open={open} onOpenChange={onOpenChange} title="Find a site" description="Search the known sites, or type a latitude and an east longitude."
      showCloseButton={false} className="palette top-[14%] translate-y-0 sm:max-w-[620px]"
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder="A site name, an agency, or coordinates such as -89.45 222.69" />
      <CommandList className="max-h-[min(460px,60vh)]">
        {!coords && <CommandEmpty className="px-4 py-8 text-center text-sm text-dust-2">No site by that name. Two numbers go to a latitude and an east longitude.</CommandEmpty>}
        {coords && (
          <CommandGroup heading="Coordinates" forceMount>
            <CommandItem forceMount value={`coordinates ${query}`} onSelect={() => pick(() => p.onCoords(coords.lat, coords.lon))}>
              <Navigation aria-hidden="true" />
              <span>Go to <span className="font-medium tabular-nums">{fmtLat(Math.max(coords.lat, -89.9999))} {fmtLon(coords.lon)}</span></span>
            </CommandItem>
          </CommandGroup>
        )}
        {p.groups.map(([kind, label]) => (
          <CommandGroup key={kind} heading={label}>
            {p.sites.filter((s) => s.kind === kind).map((s) => (
              <CommandItem key={s.id} value={`${s.name} ${s.agency ?? ''} ${s.id}`} onSelect={() => pick(() => p.onSite(s))}>
                <MapPin aria-hidden="true" />
                <span className="place min-w-0 flex-1 truncate text-[15.5px] text-dust-1">{s.name}</span>
                {s.agency && <span className="max-w-[40%] flex-none truncate text-xs text-dust-2">{s.agency}</span>}
                <span className="narrow w-[132px] flex-none text-right text-xs text-dust-3 tabular-nums max-sm:hidden">{fmtLat(s.lat)} {fmtLon(s.lon)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
})
