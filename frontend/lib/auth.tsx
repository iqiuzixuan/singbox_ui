"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { KeyRound, Lock, Moon, RotateCw, Server, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslation } from "@/lib/i18n"

interface AuthStatus {
  enabled: boolean
  authenticated: boolean
  username?: string
}

interface AuthContextType {
  enabled: boolean
  authenticated: boolean
  username?: string
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)
const AUTH_REQUIRED_EVENT = "singbox-auth-required"

async function readErrorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null)
  return data?.message || data?.error || fallback
}

function isApiRequest(input: RequestInfo | URL) {
  const rawUrl = input instanceof Request ? input.url : String(input)
  try {
    const url = new URL(rawUrl, window.location.origin)
    return url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/")
  } catch {
    return false
  }
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: (status: AuthStatus) => void }) {
  const { t } = useTranslation("auth")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const statusIcons = [ShieldCheck, Server, KeyRound]

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    if (!username.trim() || !password) {
      setError(t("missingCredentials"))
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      if (!response.ok) {
        if (response.status === 401) {
          setError(t("invalidCredentials"))
          return
        }
        setError(await readErrorMessage(response, t("loginFailed")))
        return
      }
      onAuthenticated(await response.json())
    } catch (error) {
      setError(error instanceof Error ? error.message : t("loginFailed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030407] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:72px_72px] opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_30%,rgba(0,0,0,0.24))]" />

      <div className="pointer-events-none absolute left-6 top-6 hidden font-mono text-[10px] uppercase tracking-[0.2em] text-white/30 sm:block">
        {t("terminalTop")}
      </div>
      <div className="pointer-events-none absolute bottom-6 left-6 hidden font-mono text-[10px] uppercase tracking-[0.2em] text-white/30 sm:block">
        {t("terminalBottom")}
      </div>
      <div className="absolute right-5 top-5 flex h-10 items-center gap-4 sm:right-12 sm:top-12">
        <div className="hidden font-mono text-xs text-white/50 sm:block">{t("terminalVersion")}</div>
        <div className="flex h-10 items-center gap-2 rounded-full bg-white/[0.02] px-4 text-[13px] font-semibold text-white">
          <Moon className="h-4 w-4" />
          {t("terminalMode")}
        </div>
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-[599px] items-center justify-center px-4 py-24 sm:px-8">
        <section className="w-full max-w-[440px] animate-slide-up rounded-[40px] border border-white/[0.03] bg-white/[0.02] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:rounded-[48px] sm:p-12">
          <div className="space-y-8">
            <div>
              <div className="mb-2 inline-flex rounded-full bg-white/[0.05] px-3 py-1 font-mono text-[11px] tracking-[0.1em] text-white">
                {t("terminalBadge")}
              </div>
              <h1 className="text-[32px] font-medium leading-tight text-white">{t("terminalTitle")}</h1>
              <p className="mt-1 text-sm text-white/50">{t("terminalSubtitle")}</p>
            </div>

            <div className="grid grid-cols-3 gap-4" aria-hidden="true">
              {statusIcons.map((StatusIcon, index) => (
                <div
                  key={index}
                  className="flex h-14 items-center justify-center rounded-full bg-white/[0.05] text-white transition-all duration-300 hover:bg-white/[0.08]"
                >
                  <StatusIcon className="h-5 w-5" />
                </div>
              ))}
            </div>

            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/30">
              {t("terminalProtocol")}
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="auth-username" className="block pl-4 text-xs font-medium uppercase text-white/50">
                  {t("identifier")}
                </Label>
                <Input
                  id="auth-username"
                  className="h-14 rounded-full border-0 bg-white/[0.05] px-6 text-[15px] text-white shadow-none transition-all duration-300 placeholder:text-white/25 hover:bg-white/[0.07] focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-white/40 disabled:opacity-50"
                  autoComplete="username"
                  placeholder="user@domain.net"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-password" className="block pl-4 text-xs font-medium uppercase text-white/50">
                  {t("passcode")}
                </Label>
                <Input
                  id="auth-password"
                  className="h-14 rounded-full border-0 bg-white/[0.05] px-6 text-[15px] text-white shadow-none transition-all duration-300 placeholder:text-white/25 hover:bg-white/[0.07] focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-white/40 disabled:opacity-50"
                  type="password"
                  autoComplete="current-password"
                  placeholder="passcode"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                />
              </div>
              {error && (
                <div
                  className="flex animate-scale-in items-start gap-2 rounded-[24px] border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100"
                  role="alert"
                  aria-live="polite"
                >
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Button
                type="submit"
                className="mt-2 h-16 w-full rounded-full bg-white text-base font-semibold tracking-[0.02em] text-[#030407] shadow-[0_0_40px_rgba(255,255,255,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-[0_0_52px_rgba(255,255,255,0.28)]"
                disabled={loading}
              >
                {loading ? <RotateCw className="h-4 w-4 animate-spin" /> : null}
                {loading ? t("signingIn") : t("initialize")}
                {!loading ? <Lock className="h-4 w-4" /> : null}
              </Button>
            </form>
          </div>
        </section>
      </main>
    </div>
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("auth")
  const [status, setStatus] = useState<AuthStatus | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/status")
      if (!response.ok) {
        setStatus({ enabled: true, authenticated: false })
        return
      }
      setStatus(await response.json())
    } catch {
      setStatus({ enabled: false, authenticated: true })
    }
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (...args) => {
      const response = await originalFetch(...args)
      if (response.status === 401 && isApiRequest(args[0])) {
        window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT))
      }
      return response
    }
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  useEffect(() => {
    const handleAuthRequired = () => {
      setStatus((current) => ({
        enabled: true,
        authenticated: false,
        username: current?.username,
      }))
    }
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired)
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired)
  }, [])

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined)
    setStatus({ enabled: status?.enabled ?? true, authenticated: false, username: status?.username })
  }, [status?.enabled, status?.username])

  const value = useMemo<AuthContextType>(() => ({
    enabled: status?.enabled ?? false,
    authenticated: status?.authenticated ?? false,
    username: status?.username,
    logout,
  }), [logout, status])

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <RotateCw className="mr-2 h-5 w-5 animate-spin text-primary" />
        {t("checking")}
      </div>
    )
  }

  if (status.enabled && !status.authenticated) {
    return (
      <AuthContext.Provider value={value}>
        <LoginScreen onAuthenticated={setStatus} />
      </AuthContext.Provider>
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
