// Written with AI assistance (Claude); see the README.
// shadcn/ui component (Radix primitive), restyled for the Earthrise glass theme.
import * as React from "react"
import { cn } from "@/lib/utils"
import { Slider as SliderPrimitive } from "radix-ui"

/** `tone` colours the filled part: gold for Sun and power, blue for Earth and contact. */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  tone = "none",
  thumbLabel,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  tone?: "sun" | "earth" | "none"
  thumbLabel?: string
}) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      data-tone={tone}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "group/slider relative flex h-5 w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/10"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-dust-1 group-data-[tone=earth]/slider:bg-earth group-data-[tone=sun]/slider:bg-sun"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={thumbLabel}
          className="block size-4 shrink-0 rounded-full bg-dust-1 shadow-[0_1px_4px_rgba(0,0,0,0.6)] transition-transform hover:scale-110 active:scale-95 disabled:pointer-events-none group-data-[tone=earth]/slider:shadow-[0_1px_4px_rgba(0,0,0,0.6),var(--glow-earth)] group-data-[tone=sun]/slider:shadow-[0_1px_4px_rgba(0,0,0,0.6),var(--glow-sun)]"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
