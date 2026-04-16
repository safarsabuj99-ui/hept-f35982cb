import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base: relative + overflow for shimmer; smooth transitions; subtle lift; shimmer sweep via ::before
  "relative overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:relative [&_svg]:z-10 [&>span]:relative [&>span]:z-10 hover:-translate-y-0.5 active:translate-y-0 before:absolute before:inset-0 before:-translate-x-full hover:before:translate-x-full before:transition-transform before:duration-700 before:ease-out before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent before:pointer-events-none before:z-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground hover:shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.55)] hover:from-primary hover:to-primary/95",
        destructive:
          "bg-gradient-to-br from-destructive to-destructive/85 text-destructive-foreground hover:shadow-[0_8px_24px_-6px_hsl(var(--destructive)/0.55)] hover:from-destructive hover:to-destructive/95",
        outline:
          "border border-border/60 bg-card/40 backdrop-blur-sm text-foreground hover:bg-accent hover:text-accent-foreground hover:border-primary/40 hover:shadow-[0_6px_18px_-8px_hsl(var(--primary)/0.35)]",
        secondary:
          "bg-gradient-to-br from-secondary to-secondary/70 text-secondary-foreground hover:from-secondary hover:to-secondary/85 hover:shadow-[0_6px_18px_-8px_hsl(var(--foreground)/0.25)]",
        ghost:
          "hover:bg-accent hover:text-accent-foreground",
        link:
          "text-primary underline-offset-4 hover:underline hover:translate-y-0 before:hidden",
        success:
          "border border-success/30 bg-gradient-to-br from-success/15 via-success/5 to-transparent text-success backdrop-blur-sm hover:bg-success hover:text-success-foreground hover:border-success hover:shadow-[0_8px_24px_-6px_hsl(var(--success)/0.55)]",
        warning:
          "border border-warning/30 bg-gradient-to-br from-warning/15 via-warning/5 to-transparent text-warning backdrop-blur-sm hover:bg-warning hover:text-warning-foreground hover:border-warning hover:shadow-[0_8px_24px_-6px_hsl(var(--warning)/0.55)]",
        premium:
          "bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.5)] hover:shadow-[0_12px_32px_-8px_hsl(var(--primary)/0.7)] hover:from-primary hover:to-primary",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10 hover:translate-y-0 before:hidden",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
