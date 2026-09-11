import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva('inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground hover:opacity-90',
      secondary: 'bg-surface-muted text-foreground hover:bg-border',
      outline: 'border border-border bg-surface-raised text-foreground hover:bg-surface-muted',
      ghost: 'text-foreground hover:bg-surface-muted',
      destructive: 'bg-destructive text-primary-foreground hover:opacity-90',
    },
    size: { default: 'h-10', sm: 'h-9 px-3 text-xs', lg: 'h-11 px-6', icon: 'h-10 w-10 px-0' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
