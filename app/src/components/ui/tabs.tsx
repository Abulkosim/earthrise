// Written with AI assistance (Claude); see the README.
// shadcn/ui component (Radix primitive), restyled for the Earthrise glass theme.
// The active tab's background is a Motion element that slides between triggers (`layoutId`).
import * as React from "react"
import { motion } from "motion/react"
import { Tabs as TabsPrimitive } from "radix-ui"
import { spring } from "@/lib/motion"
import { cn } from "@/lib/utils"

const TabsCtx = React.createContext<{ value?: string; id: string }>({ id: "tabs" })

function Tabs({
  className,
  orientation = "horizontal",
  value,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const id = React.useId()
  const ctx = React.useMemo(() => ({ value, id }), [value, id])
  return (
    <TabsCtx.Provider value={ctx}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        orientation={orientation}
        value={value}
        className={cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className)}
        {...props}
      />
    </TabsCtx.Provider>
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("inline-flex h-9 w-fit items-center rounded-full bg-raised p-[3px] text-dust-2", className)}
      {...props}
    />
  )
}

/** Works with a controlled `Tabs` (pass `value`), which is what lets the pill know where to slide. */
function TabsTrigger({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const ctx = React.useContext(TabsCtx)
  const active = ctx.value === value
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap text-dust-2 transition-colors hover:text-dust-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-dust-1 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {active && (
        <motion.span
          layoutId={`${ctx.id}-pill`}
          transition={spring}
          className="absolute inset-0 rounded-full bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
