// Written with AI assistance (Claude); see the README.
// The header: three floating groups and no bar. Left the wordmark, centre whatever is passed as
// children (the layer dock), right the demonstrations, the site finder and three small actions.
import { CircleHelp, Link2, Play, Search, ShieldCheck } from 'lucide-react'
import { memo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useReportInset } from './chrome'

export interface Demo { title: string; explain: string; run(): void }
/** What is running, so the Stop button can show how far it is: `at` moves from where it started to `end`, or by `span`. */
export interface Run { kind: 'play' | 'slip'; at: number; end?: number; span?: number }

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-white/10 bg-white/6 px-1.5 py-px font-sans text-[11px] leading-4 font-medium text-dust-2">{children}</kbd>
}

/** A 16 px ring that fills as the demonstration runs. */
function ProgressRing({ run }: { run: Run }) {
  // where this run started; read once, when the ring appears
  const start = useRef(run.at)
  const end = run.end ?? start.current + (run.span ?? 0)
  const f = end > start.current ? Math.min(1, Math.max(0, (run.at - start.current) / (end - start.current))) : 0
  const r = 6.5, c = 2 * Math.PI * r
  return (
    <svg className="size-4 -rotate-90" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)} />
    </svg>
  )
}

interface ActionsProps {
  demos: Demo[]
  /** set while time plays or the landing slips */
  run: Run | null
  onStop(): void
  onFind(): void
  onCopy(): void
  onIntro(): void
  validationHref: string
}

const Wordmark = memo(function Wordmark() {
  return (
    <div className="glass flex h-[46px] min-w-0 items-center gap-3.5 rounded-full pr-5 pl-[18px]">
      <h1 className="place text-2xl leading-none text-dust-1">Earthrise</h1>
      <p className="tag text-[12.5px] leading-tight text-dust-2">Every landing site at the Moon’s south pole, every hour, on one map.</p>
    </div>
  )
})

const Actions = memo(function Actions(p: ActionsProps) {
  return (
    <nav className="glass flex h-[46px] items-center gap-1 rounded-full p-[5px]" aria-label="Demonstrations and tools">
      {p.run ? (
        <Button type="button" size="sm" className="h-9 rounded-full px-3.5" onClick={p.onStop}>
          <ProgressRing key={p.run.kind} run={p.run} />Stop
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" className="h-9 rounded-full px-3.5"><Play className="size-3.5 fill-current" aria-hidden="true" />Show me</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={10} className="w-[340px] p-1.5">
            {p.demos.map((d) => (
              <DropdownMenuItem key={d.title} className="items-start gap-3 rounded-xl px-2.5 py-2.5" onSelect={d.run}>
                <span className="mt-0.5 grid size-7 flex-none place-items-center rounded-full bg-raised-hover text-dust-1" aria-hidden="true"><Play className="size-3 translate-x-px fill-current text-dust-1" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-dust-1">{d.title}</span>
                  <span className="block text-[12.5px] leading-snug text-dust-2">{d.explain}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Button type="button" variant="secondary" size="sm" className="find h-9 rounded-full pr-2 pl-3 font-normal text-dust-2 hover:text-dust-1" onClick={p.onFind} aria-label="Find a site" aria-keyshortcuts="Meta+K Control+K">
        <Search className="size-3.5" aria-hidden="true" />
        <span className="find-label">Find a site</span>
        <span className="find-kbd"><Kbd>{IS_MAC ? '⌘K' : 'Ctrl K'}</Kbd></span>
      </Button>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={p.onCopy} aria-label="Copy a link to this view"><Link2 aria-hidden="true" /></Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Copy a link to this view</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <a href={p.validationHref} aria-label="How we know it is right"><ShieldCheck aria-hidden="true" /></a>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">How we know it is right</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={p.onIntro} aria-label="New here?"><CircleHelp aria-hidden="true" /></Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">New here?</TooltipContent>
      </Tooltip>
    </nav>
  )
})

/** The handlers and `demos` should be stable (see useStable): the two sides are memoised. */
export function Header({ children, ...actions }: ActionsProps & { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useReportInset('top', ref)
  return (
    <header className="top" ref={ref}>
      <div className="top-side enter enter-top"><Wordmark /></div>
      <div className="top-centre enter enter-top" style={{ '--enter-order': 1 } as React.CSSProperties}>{children}</div>
      <div className="top-side justify-end enter enter-top" style={{ '--enter-order': 2 } as React.CSSProperties}><Actions {...actions} /></div>
    </header>
  )
}
