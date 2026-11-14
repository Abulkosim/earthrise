// Written with AI assistance (Claude); see the README.
// shadcn/ui component (Radix primitive), restyled for the Earthrise glass theme.
import * as React from "react"
import { cn } from "@/lib/utils"
import { Switch as SwitchPrimitive } from "radix-ui"

/** `tone` colours the switch when it is on: gold for Sun and power, blue for Earth and contact. */
function Switch({
  className,
  size = "default",
  tone = "none",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
  tone?: "sun" | "earth" | "none"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      data-tone={tone}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent transition-[background-color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[18px] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=unchecked]:bg-white/16",
        "data-[state=checked]:bg-dust-1 data-[tone=earth]:data-[state=checked]:bg-earth data-[tone=earth]:data-[state=checked]:shadow-[0_0_14px_rgba(125,184,240,0.4)] data-[tone=sun]:data-[state=checked]:bg-sun data-[tone=sun]:data-[state=checked]:shadow-[0_0_14px_rgba(245,201,106,0.4)]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full transition-transform duration-200 ease-out group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-2.5 data-[state=checked]:translate-x-[15px] data-[state=checked]:bg-[#0d0d0e] data-[state=unchecked]:translate-x-px data-[state=unchecked]:bg-dust-2 group-data-[size=sm]/switch:data-[state=checked]:translate-x-[11px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
