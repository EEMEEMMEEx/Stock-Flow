import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "neu-primary font-bold text-white shadow-sm hover:brightness-105",
        destructive:
          "bg-red-600 text-white hover:bg-red-700 font-bold shadow-sm",
        outline:
          "neu-button border border-border/80 bg-card/60 text-foreground hover:bg-accent hover:text-foreground shadow-2xs",
        secondary:
          "neu-button bg-secondary/80 text-secondary-foreground hover:bg-secondary shadow-2xs",
        ghost: "hover:bg-accent/70 hover:text-foreground transition-all",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto font-medium",
        emerald: "bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm",
        indigo: "bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm",
      },
      size: {
        default: "h-10 px-4 py-2 text-sm gap-2",
        sm: "h-8 px-3 text-xs gap-1.5",
        lg: "h-11 px-6 text-base gap-2.5 font-bold",
        icon: "h-9 w-9 p-0 rounded-xl",
        "icon-sm": "h-8 w-8 p-0 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
