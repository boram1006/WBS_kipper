import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckboxProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  indeterminate?: boolean;
};

export function Checkbox({ className, checked, onCheckedChange, indeterminate, disabled, ...props }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked || indeterminate ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white hover:border-zinc-400",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      {...props}
    >
      {checked && !indeterminate && <Check className="h-3 w-3" strokeWidth={3} />}
      {indeterminate && <span className="h-0.5 w-2.5 rounded-full bg-white" />}
    </button>
  );
}
