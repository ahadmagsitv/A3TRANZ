// .btn — primary/amber/secondary/ghost/danger, optional .btn-sm.
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "amber" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
}

export function Button({ variant = "primary", size = "md", className, ...rest }: ButtonProps) {
  const classes = ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button className={classes} {...rest} />;
}
