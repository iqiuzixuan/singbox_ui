"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { useTheme, type ThemeMode } from "@/lib/theme"
import { useTranslation } from "@/lib/i18n"

const themeIcons: Record<ThemeMode, typeof Monitor> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

export function ThemeSwitcher() {
  const { mode, setMode } = useTheme()
  const { t } = useTranslation("theme")
  const Icon = themeIcons[mode]

  return (
    <Select value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
      <SelectTrigger className="h-9 w-[112px] bg-background/80 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{t(mode)}</span>
        </div>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="system">
          <span className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            {t("system")}
          </span>
        </SelectItem>
        <SelectItem value="light">
          <span className="flex items-center gap-2">
            <Sun className="h-4 w-4 text-muted-foreground" />
            {t("light")}
          </span>
        </SelectItem>
        <SelectItem value="dark">
          <span className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-muted-foreground" />
            {t("dark")}
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
