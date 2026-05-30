"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Theme provider — wraps the app with next-themes for dark/light mode.

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
