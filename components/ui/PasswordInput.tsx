"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Height variant: "lg" (h-14, auth forms) or "md" (h-12, modals) */
  size?: "lg" | "md";
}

/**
 * Password field with a show/hide toggle. Drop-in replacement for the
 * plain password <input> used across auth forms and modals.
 */
export function PasswordInput({ size = "lg", className = "", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const height = size === "lg" ? "h-14" : "h-12";
  const text = size === "lg" ? "text-base" : "text-sm";

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`w-full ${height} px-4 pr-12 rounded-xl border-2 border-black bg-white ${text} font-medium text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all placeholder:text-black/40 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-black/50 hover:text-black transition-colors"
      >
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}

export default PasswordInput;
