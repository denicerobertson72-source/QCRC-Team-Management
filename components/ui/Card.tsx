import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  subtle?: boolean;
};

export function Card({ children, subtle = false, className = "", ...props }: CardProps) {
  const base = subtle ? "card-subtle" : "card";
  return (
    <div {...props} className={`${base} ${className}`.trim()}>
      {children}
    </div>
  );
}
