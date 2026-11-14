// Written with AI assistance (Claude); see the README.
// The left panel: the mission brief and the real landings, as two tabs in one glass panel.
// It collapses to a small pill. Both tabs stay mounted, so scripts and links find their content.
import { ChevronRight, PanelLeftClose, SlidersHorizontal } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { slide, spring } from '@/lib/motion'
import { useReportInset } from './chrome'

export type LeftTab = 'mission' | 'landings'

interface Props {
  tab: LeftTab
  onTab(t: LeftTab): void
  mission: React.ReactNode
  landings: React.ReactNode
}

export function LeftPanel(p: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useReportInset('left', ref, !collapsed)
  // the first arrival is part of the entrance on load (fourth in the 50 ms stagger); the class goes
  // once it has played, or it would play again each time the panel is shown
  const [arrived, setArrived] = useState(false)
  return (
    <div className="left" ref={ref} data-collapsed={collapsed}>
      <motion.aside
        className={arrived ? 'left-panel glass' : 'left-panel glass enter enter-left'} aria-label="Mission and real landings" initial={false}
        style={{ '--enter-order': 3 } as React.CSSProperties}
        onAnimationEnd={(e) => { if (e.target === e.currentTarget) setArrived(true) }}
        animate={collapsed ? { opacity: 0, x: -24, transitionEnd: { display: 'none' } } : { opacity: 1, x: 0, display: 'flex' }}
        transition={spring}
      >
        <Tabs value={p.tab} onValueChange={(v) => p.onTab(v as LeftTab)} className="min-h-0 flex-1 gap-0">
          <div className="flex items-center gap-2 p-2.5 pb-2">
            <TabsList className="flex-1">
              <TabsTrigger value="mission">Mission</TabsTrigger>
              <TabsTrigger value="landings">Real landings</TabsTrigger>
            </TabsList>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="collapse-button rounded-full" onClick={() => setCollapsed(true)} aria-label="Hide this panel"><PanelLeftClose aria-hidden="true" /></Button>
              </TooltipTrigger>
              <TooltipContent side="right">Hide this panel</TooltipContent>
            </Tooltip>
          </div>
          <ScrollArea className="left-scroll min-h-0 flex-1">
            <TabsContent value="mission" forceMount className="data-[state=inactive]:hidden">{p.mission}</TabsContent>
            <TabsContent value="landings" forceMount className="data-[state=inactive]:hidden">{p.landings}</TabsContent>
          </ScrollArea>
        </Tabs>
      </motion.aside>
      <AnimatePresence>
        {collapsed && (
          <motion.button type="button" className="collapsed-pill glass pressable" onClick={() => setCollapsed(false)} aria-label="Show the mission panel" {...slide('left', 16)}>
            <SlidersHorizontal className="size-4 text-dust-2" aria-hidden="true" />
            Mission
            <ChevronRight className="size-4 text-dust-2" aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
