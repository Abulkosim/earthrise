// Written with AI assistance (Claude); see the README.
// The right-hand glass panel that holds the site sheet. It slides in from the right with a spring
// when a site is selected and out again when it is closed. The sheet itself is passed as children.
import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { slide } from '@/lib/motion'
import { useReportInset } from './chrome'

export function SitePanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useReportInset('right', ref, open)
  return (
    <div className="right" ref={ref}>
      <AnimatePresence>
        {open && (
          <motion.div key="site" className="site-panel glass" {...slide('right', 36)}>
            <ScrollArea className="site-scroll">{children}</ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
