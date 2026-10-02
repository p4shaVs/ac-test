"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders a modal at the end of <body>. Inside the page column a `fixed`
 * overlay is trapped by the column's stacking context (and by any animated
 * transform above it), so the sidebar and top bar would paint over it.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}
