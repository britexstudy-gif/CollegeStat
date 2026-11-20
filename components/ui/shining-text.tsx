"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Text with a light sweep moving across it, used while AI is working. */
export function ShiningText({
  text,
  className,
  as = "p",
}: {
  text: string;
  className?: string;
  as?: "p" | "h1" | "h2" | "span";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={cn(
        "bg-[linear-gradient(110deg,#525252,35%,#fff,50%,#525252,75%,#525252)] bg-[length:200%_100%] bg-clip-text text-base font-normal text-transparent",
        "[html:not(.dark)_&]:bg-[linear-gradient(110deg,#737373,35%,#0a0a0a,50%,#737373,75%,#737373)]",
        className,
      )}
      initial={{ backgroundPosition: "200% 0" }}
      animate={reduce ? undefined : { backgroundPosition: "-200% 0" }}
      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
    >
      {text}
    </Tag>
  );
}
