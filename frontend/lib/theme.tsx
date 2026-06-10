"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type ThemeMode = "light" | "dark" | "system"

interface ThemeContextType {
  mode: ThemeMode
  resolvedMode: "light" | "dark"
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)
const STORAGE_KEY = "singbox_theme_mode"

function getStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system"
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "light" || stored === "dark" || stored === "system") return stored
  return "system"
}

function getSystemMode(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(mode: ThemeMode, systemMode: "light" | "dark") {
  const resolved = mode === "system" ? systemMode : mode
  document.documentElement.classList.toggle("dark", resolved === "dark")
  document.documentElement.style.colorScheme = resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode)
  const [systemMode, setSystemMode] = useState<"light" | "dark">(getSystemMode)

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => setSystemMode(media.matches ? "dark" : "light")
    handleChange()
    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [])

  useEffect(() => {
    applyTheme(mode, systemMode)
  }, [mode, systemMode])

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode)
    localStorage.setItem(STORAGE_KEY, nextMode)
    applyTheme(nextMode, getSystemMode())
  }, [])

  const value = useMemo<ThemeContextType>(() => ({
    mode,
    resolvedMode: mode === "system" ? systemMode : mode,
    setMode,
  }), [mode, setMode, systemMode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return context
}
