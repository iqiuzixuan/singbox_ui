"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { Lock, LogIn, RotateCw, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  const { t: tc } = useTranslation("common")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm rounded-xl">
        <CardHeader className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="auth-username">{tc("username")}</Label>
              <Input
                id="auth-username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">{tc("password")}</Label>
              <Input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <RotateCw className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {loading ? t("signingIn") : t("signIn")}
            </Button>
          </form>
        </CardContent>
      </Card>
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
