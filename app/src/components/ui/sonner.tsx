// Written with AI assistance (Claude); see the README.
// shadcn/ui component (sonner toasts), restyled for the Earthrise glass theme.
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "glass-pop !rounded-full !px-4 !py-2.5 !w-max !max-w-[calc(100vw-24px)] !whitespace-nowrap max-[600px]:!mx-auto !gap-2 !font-sans !text-[13px] !text-dust-1",
        },
      }}
      style={
        {
          "--normal-bg": "var(--glass-bg-pop)",
          "--normal-text": "var(--dust-1)",
          "--normal-border": "var(--glass-border)",
          "--border-radius": "999px",
          "--width": "auto",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
