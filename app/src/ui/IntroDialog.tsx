// Written with AI assistance (Claude); see the README.
// A short explanation for people who have never thought about the lunar pole; shown on the first visit.
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface Props {
  open: boolean
  onClose(): void
  onMonth(): void
  onSlip(): void
}

export function IntroDialog({ open, onClose, onMonth, onSlip }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        className="intro gap-0 p-7 outline-none sm:max-w-[560px]" showCloseButton={false} aria-label="The Moon's south pole in one minute" tabIndex={-1}
        // the box itself takes the focus, so no button looks chosen before the visitor has read it; Tab goes to the first one
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus() }}
      >
        <DialogTitle className="place text-[30px] leading-[1.15] font-normal text-dust-1">The Moon’s south pole in one minute</DialogTitle>
        <DialogDescription asChild>
          <div className="mt-4 grid gap-3 text-[15px] leading-relaxed text-dust-2">
            <p>At the pole the <span className="text-sun">Sun</span> never climbs more than a couple of degrees. It circles the horizon once a month, so a hill a few kilometres away can hide it for days.</p>
            <p>The <span className="text-earth">Earth</span> hangs low as well, and bobs up and down. When it drops behind the terrain, a lander cannot talk to home.</p>
            <p className="text-dust-1">So where and when you land decides whether you have power and a radio link. This map works that out for every point at once, from NASA’s laser elevation maps.</p>
          </div>
        </DialogDescription>
        <div className="intro-actions mt-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="grid gap-2">
            <Button type="button" className="justify-start" onClick={() => { onClose(); onMonth() }}><Play className="fill-current" aria-hidden="true" />Show me a lunar month of light</Button>
            <Button type="button" className="justify-start" onClick={() => { onClose(); onSlip() }}><Play className="fill-current" aria-hidden="true" />Show me a landing date that slips</Button>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>Explore on my own</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
