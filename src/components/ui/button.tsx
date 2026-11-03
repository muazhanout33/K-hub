import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[#16A34A] text-white font-bold shadow-[0_4px_14px_rgba(22,163,74,0.3)] hover:bg-[#15803D] hover:-translate-y-px active:translate-y-0 dark:bg-[#16A34A] dark:text-[#101512] dark:hover:bg-[#22C55E]",
        secondary:
          "bg-white text-[#0F172A] font-bold border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] dark:bg-[#1D2821] dark:text-[#F5F7F5] dark:border-[#344239] dark:hover:bg-[#26332A] dark:hover:border-[#4B5E52]",
        destructive:
          "bg-transparent text-[#DC2626] font-bold border-[1.5px] border-[#FECACA] hover:bg-[#FEF2F2] hover:border-[#FCA5A5] dark:text-[#FCA5A5] dark:border-[#7F1D1D] dark:hover:bg-[#450A0A]/40 dark:hover:border-[#991B1B]",
        ghost:
          "text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-[#A1ADA4] dark:hover:text-[#F5F7F5] dark:hover:bg-[#1D2821]",
        outline:
          "border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 hover:text-gray-900 dark:border-[#344239] dark:bg-[#171F1A] dark:text-[#F5F7F5] dark:hover:bg-[#1D2821] dark:hover:text-[#F5F7F5]",
        link:
          "text-[#16A34A] underline-offset-4 hover:underline dark:text-[#4ADE80]",
      },
      size: {
        sm: "h-10 px-4 text-xs gap-1.5 rounded-[var(--radius-sm)] [&_svg]:size-[var(--icon-md)]",
        md: "h-11 px-5 sm:px-6 text-sm gap-2 rounded-[var(--radius-md)] [&_svg]:size-[var(--icon-lg)]",
        lg: "h-12 px-6 text-sm gap-2 rounded-[var(--radius-md)] [&_svg]:size-[var(--icon-lg)]",
        pill: "h-11 px-5 sm:px-6 text-[13px] gap-2 rounded-[var(--radius-pill)] [&_svg]:size-[var(--icon-lg)]",
        icon: "h-11 w-11 rounded-[var(--radius-xs)] p-0 [&_svg]:size-[var(--icon-lg)]",
        "icon-sm": "h-9 w-9 rounded-[var(--radius-xs)] p-0 [&_svg]:size-[var(--icon-md)]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
