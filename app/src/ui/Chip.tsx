// Written with AI assistance (Claude); see the README.
// A chip: a fully round raised control that holds one value (a number with its unit, a date, a host name).
// Chips about the Sun or power carry a gold dot, chips about the Earth or contact a blue one.
import { cva, type VariantProps } from 'class-variance-authority'
import { motion, useAnimationControls, type HTMLMotionProps } from 'motion/react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type Tone = 'sun' | 'earth' | 'none'

/** The look alone, for links and other elements that are not buttons: `className={chipVariants()}`. */
export const chipVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-raised align-middle font-medium whitespace-nowrap text-dust-1 tabular-nums transition-colors hover:bg-raised-hover',
  {
    variants: {
      size: {
        sm: 'h-6 px-2 text-xs',
        md: 'h-[25px] px-2.5 text-[13.5px]',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

interface ChipProps extends Omit<HTMLMotionProps<'button'>, 'children'>, VariantProps<typeof chipVariants> {
  tone?: Tone
  /** When this changes, the chip does a quick scale pulse (not while it changes continuously). */
  pulseKey?: unknown
  children?: React.ReactNode
}

export function Chip({ tone = 'none', pulseKey, size, className, children, ...props }: ChipProps) {
  const controls = useAnimationControls()
  const last = useRef({ key: pulseKey, at: 0 })
  useEffect(() => {
    if (Object.is(last.current.key, pulseKey)) return
    const now = performance.now()
    // a slider being dragged or a date that slips changes many times a second: pulse once, at the start
    const stream = now - last.current.at < 320
    last.current = { key: pulseKey, at: now }
    if (!stream) void controls.start({ scale: [1, 1.1, 1], transition: { duration: 0.28, ease: 'easeOut' } })
  }, [pulseKey, controls])
  return (
    <motion.button type="button" animate={controls} whileTap={{ scale: 0.97 }} className={cn(chipVariants({ size }), 'aria-expanded:border-white/20 aria-expanded:bg-raised-hover', className)} {...props}>
      {tone !== 'none' && <span className={`dot dot-${tone}`} aria-hidden="true" />}
      {children}
    </motion.button>
  )
}

/** The unit inside a chip, quieter than the number. */
export function ChipUnit({ children }: { children: React.ReactNode }) {
  return <span className="font-normal text-dust-2">{children}</span>
}
