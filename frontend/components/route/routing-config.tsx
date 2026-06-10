"use client"

import { useState, useEffect, useRef } from "react"
import { Plus, Route, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSingboxConfigStore, RouteRule } from "@/lib/store/singbox-config"
import { useTranslation } from "@/lib/i18n"
import { parseLines, normalizeIpCidrs, parseDomainLines, domainFieldsToLines, applyDomainGroups, hasDomainEntries } from "./utils"
import { DirectTab } from "./direct-tab"
import { ProxyTab } from "./proxy-tab"
import { BlockTab } from "./block-tab"
import { GfwTab } from "./gfw-tab"
import { CnDomainTab } from "./cn-domain-tab"
import { CnIpTab } from "./cn-ip-tab"

interface RoutingConfigProps {
  showCard?: boolean
  availableOutbounds?: string[]
  availableInbounds?: string[]
}

// Stable default to avoid useEffect infinite loops from reference changes
const EMPTY_OUTBOUNDS: string[] = []
const EMPTY_INBOUNDS: string[] = []

interface InboundForwardRule {
  inbound: string
  outbound: string
}

const INBOUND_FORWARD_RULE_KEYS = new Set(["action", "inbound", "outbound"])

function isInboundForwardRule(rule: RouteRule): boolean {
  return rule.action === "route" &&
    !!rule.outbound &&
    (rule.inbound?.length || 0) > 0 &&
    Object.keys(rule).every((key) => INBOUND_FORWARD_RULE_KEYS.has(key))
}

export function RoutingConfig({
  showCard = true,
  availableOutbounds = EMPTY_OUTBOUNDS,
  availableInbounds = EMPTY_INBOUNDS,
}: RoutingConfigProps) {
  const { config, setRouting } = useSingboxConfigStore()
  const { t } = useTranslation("routing")
  const initialConfig = config.route

  const [finalOutbound, setFinalOutbound] = useState("proxy_out")
  const [rules, setRules] = useState<RouteRule[]>([])
  const [defaultDomainResolver, setDefaultDomainResolver] = useState("local_dns")
  const [activeTab, setActiveTab] = useState("direct")
  const [routeMode, setRouteMode] = useState<"rules" | "global_proxy" | "global_direct">("global_proxy")
  const [inboundForwards, setInboundForwards] = useState<InboundForwardRule[]>([])

  // Passwall-style list state
  const [directDomains, setDirectDomains] = useState("")
  const [directIps, setDirectIps] = useState("")
  const [proxyDomains, setProxyDomains] = useState("")
  const [proxyIps, setProxyIps] = useState("")
  const [blockDomains, setBlockDomains] = useState("")
  const [blockIps, setBlockIps] = useState("")

  // Preset rule set toggles
  const [enableGfw, setEnableGfw] = useState(false)
  const [enableCnDomain, setEnableCnDomain] = useState(false)
  const [enableCnIp, setEnableCnIp] = useState(false)
  const [enableBlockAds, setEnableBlockAds] = useState(false)
  const [enablePrivateIpDirect, setEnablePrivateIpDirect] = useState(false)

  const isInitializedRef = useRef(false)

  // Initialize from initialConfig (first load only)
  useEffect(() => {
    if (isInitializedRef.current) return
    if (!initialConfig) {
      isInitializedRef.current = true
      return
    }

    if (initialConfig.final) {
      setFinalOutbound(initialConfig.final)
    }
    if (initialConfig.default_domain_resolver) {
      const resolver = initialConfig.default_domain_resolver
      setDefaultDomainResolver(typeof resolver === "string" ? resolver : resolver.server || "")
    }
    if ((initialConfig.rules || []).length > 0) {
      setRouteMode("rules")
    } else if (initialConfig.final === "direct") {
      setRouteMode("global_direct")
    } else {
      setRouteMode("global_proxy")
    }

    // Reverse-parse existing rules into Passwall lists
    const manualRules: RouteRule[] = []
    const parsedInboundForwards: InboundForwardRule[] = []
    const dDomains: string[] = []
    const dIps: string[] = []
    const pDomains: string[] = []
    const pIps: string[] = []
    const bDomains: string[] = []
    const bIps: string[] = []

    for (const rule of initialConfig.rules || []) {
      let classified = false

      if (isInboundForwardRule(rule)) {
        for (const inbound of rule.inbound || []) {
          parsedInboundForwards.push({ inbound, outbound: rule.outbound || "proxy_out" })
        }
        classified = true
      }

      // Detect preset rule_set rules
      if (rule.rule_set?.length === 1) {
        const rs = rule.rule_set[0]
        if (rs === "geosite-category-ads-all" && rule.outbound === "block") {
          setEnableBlockAds(true); classified = true
        } else if (rs === "geosite-cn" && rule.outbound === "direct") {
          setEnableCnDomain(true); classified = true
        } else if (rs === "geoip-cn" && rule.outbound === "direct") {
          setEnableCnIp(true); classified = true
        } else if (rs === "geosite-gfw") {
          setEnableGfw(true); classified = true
        }
      }

      // Detect ip_is_private direct rule
      if (!classified && rule.ip_is_private && rule.outbound === "direct") {
        setEnablePrivateIpDirect(true); classified = true
      }

      // Detect simple domain/IP rules (支持 domain, domain_suffix, domain_keyword, domain_regex)
      if (!classified) {
        const hasDomains = (rule.domain_suffix?.length || 0) > 0 || (rule.domain?.length || 0) > 0 ||
          (rule.domain_keyword?.length || 0) > 0 || (rule.domain_regex?.length || 0) > 0
        const hasIps = (rule.ip_cidr?.length || 0) > 0
        const isSimple = !rule.port && !rule.protocol && !rule.inbound &&
          !rule.network && !rule.clash_mode && !rule.rule_set

        if (isSimple && (hasDomains || hasIps) && rule.action === "route") {
          const targetDomains = domainFieldsToLines(rule)
          const targetIps = rule.ip_cidr || []

          if (rule.outbound === "direct") {
            dDomains.push(...targetDomains)
            dIps.push(...targetIps)
            classified = true
          } else if (rule.outbound === "block") {
            bDomains.push(...targetDomains)
            bIps.push(...targetIps)
            classified = true
          } else if (rule.outbound && rule.outbound !== "direct" && rule.outbound !== "block") {
            pDomains.push(...targetDomains)
            pIps.push(...targetIps)
            classified = true
          }
        }
      }

      if (!classified) {
        manualRules.push(rule)
      }
    }

    setDirectDomains(dDomains.join("\n"))
    setDirectIps(dIps.join("\n"))
    setProxyDomains(pDomains.join("\n"))
    setProxyIps(pIps.join("\n"))
    setBlockDomains(bDomains.join("\n"))
    setBlockIps(bIps.join("\n"))
    setInboundForwards(parsedInboundForwards)
    setRules(manualRules)

    isInitializedRef.current = true
  }, [initialConfig])

  // Sync to global store on every state change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // config.dns is intentionally omitted to avoid re-initialization loops;
  // we only want to capture the initial value once.
  useEffect(() => {
    if (!isInitializedRef.current) return

    const proxyTag = availableOutbounds.includes("proxy_out")
      ? "proxy_out"
      : (availableOutbounds.find((t) => t !== "direct" && t !== "block") || "proxy_out")
    const effectiveFinalOutbound = availableOutbounds.includes(finalOutbound)
      ? finalOutbound
      : proxyTag

    // Global mode: DNS/route are fully managed by buildFullConfig; just set the final tag
    if (routeMode === "global_proxy" || routeMode === "global_direct") {
      const finalTag = routeMode === "global_proxy" ? proxyTag : "direct"
      setRouting({ rules: [], final: finalTag })
      return
    }

    const generatedRules: RouteRule[] = []

    // Priority 0: inbound forwarding rules
    for (const item of inboundForwards) {
      if (item.inbound && item.outbound) {
        generatedRules.push({ action: "route", inbound: [item.inbound], outbound: item.outbound })
      }
    }

    // Priority 1: block rules
    if (enableBlockAds) {
      generatedRules.push({ action: "route", outbound: "block", rule_set: ["geosite-category-ads-all"] })
    }
    const blockDomainGroups = parseDomainLines(blockDomains)
    const blockIpList = parseLines(blockIps)
    if (hasDomainEntries(blockDomainGroups)) {
      const rule: any = { action: "route", outbound: "block" }
      applyDomainGroups(rule, blockDomainGroups)
      generatedRules.push(rule)
    }
    if (blockIpList.length > 0) {
      generatedRules.push({ action: "route", outbound: "block", ip_cidr: normalizeIpCidrs(blockIpList) })
    }

    // Priority 2: direct rules
    if (enablePrivateIpDirect) {
      generatedRules.push({ action: "route", outbound: "direct", ip_is_private: true })
    }
    const directDomainGroups = parseDomainLines(directDomains)
    const directIpList = parseLines(directIps)
    if (hasDomainEntries(directDomainGroups)) {
      const rule: any = { action: "route", outbound: "direct" }
      applyDomainGroups(rule, directDomainGroups)
      generatedRules.push(rule)
    }
    if (directIpList.length > 0) {
      generatedRules.push({ action: "route", outbound: "direct", ip_cidr: normalizeIpCidrs(directIpList) })
    }
    if (enableCnDomain) {
      generatedRules.push({ action: "route", outbound: "direct", rule_set: ["geosite-cn"] })
    }
    if (enableCnIp) {
      generatedRules.push({ action: "route", outbound: "direct", rule_set: ["geoip-cn"] })
    }

    // Priority 3: proxy rules
    const proxyDomainGroups = parseDomainLines(proxyDomains)
    const proxyIpList = parseLines(proxyIps)
    if (hasDomainEntries(proxyDomainGroups)) {
      const rule: any = { action: "route", outbound: proxyTag }
      applyDomainGroups(rule, proxyDomainGroups)
      generatedRules.push(rule)
    }
    if (proxyIpList.length > 0) {
      generatedRules.push({ action: "route", outbound: proxyTag, ip_cidr: normalizeIpCidrs(proxyIpList) })
    }
    if (enableGfw) {
      generatedRules.push({ action: "route", outbound: proxyTag, rule_set: ["geosite-gfw"] })
    }

    // Append manual rules
    const allRules = [...generatedRules, ...rules.filter((r) => r.outbound || r.action)]

    const routingConfig: any = { rules: allRules, final: effectiveFinalOutbound }
    if (defaultDomainResolver) {
      routingConfig.default_domain_resolver = defaultDomainResolver
    }
    setRouting(routingConfig)
  }, [
    routeMode, finalOutbound, rules, defaultDomainResolver,
    directDomains, directIps, proxyDomains, proxyIps,
    blockDomains, blockIps,
    inboundForwards,
    enableGfw, enableCnDomain, enableCnIp,
    enableBlockAds, enablePrivateIpDirect,
    availableOutbounds, setRouting,
  ])

  const addInboundForward = () => {
    setInboundForwards((current) => [
      ...current,
      {
        inbound: availableInbounds[0] || "",
        outbound: availableOutbounds[0] || finalOutbound || "proxy_out",
      },
    ])
  }

  const updateInboundForward = (index: number, patch: Partial<InboundForwardRule>) => {
    setInboundForwards((current) =>
      current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
    )
  }

  const removeInboundForward = (index: number) => {
    setInboundForwards((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const content = (
    <div className="space-y-4">
      {/* Route mode selector */}
      <div className="space-y-4 p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800/50">
        <div className="space-y-2">
          <Label>{t("routeMode")}</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "global_proxy" as const, label: t("globalProxy") },
              { value: "global_direct" as const, label: t("globalDirect") },
              { value: "rules" as const, label: t("ruleRouting") },
            ].map((mode) => (
              <Button
                key={mode.value}
                type="button"
                variant={routeMode === mode.value ? "default" : "outline"}
                size="sm"
                onClick={() => setRouteMode(mode.value)}
                className="w-full"
              >
                {mode.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {routeMode === "global_proxy" && t("globalProxyDesc")}
            {routeMode === "global_direct" && t("globalDirectDesc")}
            {routeMode === "rules" && t("ruleRoutingDesc")}
          </p>
        </div>
      </div>

      {/* Rule split mode: final outbound + domain resolver + tab lists */}
      {routeMode === "rules" && (
        <>
          <div className="space-y-4 p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>{t("inboundForwarding")}</Label>
                <p className="text-xs text-muted-foreground mt-1">{t("inboundForwardingDesc")}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addInboundForward}>
                <Plus className="h-4 w-4 mr-1" />
                {t("addInboundForward")}
              </Button>
            </div>

            {inboundForwards.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {t("noInboundForwards")}
              </div>
            ) : (
              <div className="space-y-2">
                {inboundForwards.map((item, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={item.inbound}
                      onChange={(event) => updateInboundForward(index, { inbound: event.target.value })}
                    >
                      {item.inbound && !availableInbounds.includes(item.inbound) && (
                        <option value={item.inbound}>{item.inbound}</option>
                      )}
                      {availableInbounds.length > 0 ? (
                        availableInbounds.map((tag) => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))
                      ) : (
                        <option value="">{t("noAvailableInbounds")}</option>
                      )}
                    </select>

                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={item.outbound}
                      onChange={(event) => updateInboundForward(index, { outbound: event.target.value })}
                    >
                      {item.outbound && !availableOutbounds.includes(item.outbound) && (
                        <option value={item.outbound}>{item.outbound}</option>
                      )}
                      {availableOutbounds.length > 0 ? (
                        availableOutbounds.map((tag) => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))
                      ) : (
                        <option value="proxy_out">proxy_out</option>
                      )}
                    </select>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeInboundForward(index)}
                      className="h-10 w-10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800/50">
            <div className="space-y-2">
              <Label>{t("finalOutbound")} (final)</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={finalOutbound}
                onChange={(e) => setFinalOutbound(e.target.value)}
              >
                {availableOutbounds.length > 0 ? (
                  availableOutbounds.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="proxy_out">proxy_out</option>
                    <option value="direct">direct</option>
                    <option value="block">block</option>
                  </>
                )}
              </select>
              <p className="text-xs text-muted-foreground">{t("finalOutboundDesc")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("domainResolverLabel")}</Label>
              <Input
                placeholder={t("domainResolverPlaceholder")}
                value={defaultDomainResolver}
                onChange={(e) => setDefaultDomainResolver(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("domainResolverDesc")}</p>
            </div>
          </div>

          <div className="space-y-4 p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800/50">
            <div className="space-y-3">
              <Label>{t("routingRules")}</Label>
            <p className="text-xs text-muted-foreground">{t("rulePriority")}</p>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="direct">{t("directList")}</TabsTrigger>
                <TabsTrigger value="proxy">{t("proxyList")}</TabsTrigger>
                <TabsTrigger value="block">{t("blockList")}</TabsTrigger>
              </TabsList>
              <TabsList className="grid w-full grid-cols-3 mt-1">
                <TabsTrigger value="gfw">{t("gfwList")}</TabsTrigger>
                <TabsTrigger value="cnDomain">{t("cnDomainTab")}</TabsTrigger>
                <TabsTrigger value="cnIp">{t("cnIpTab")}</TabsTrigger>
              </TabsList>

              <TabsContent value="direct">
                <DirectTab
                  directDomains={directDomains}
                  setDirectDomains={setDirectDomains}
                  directIps={directIps}
                  setDirectIps={setDirectIps}
                  enablePrivateIpDirect={enablePrivateIpDirect}
                  setEnablePrivateIpDirect={setEnablePrivateIpDirect}
                />
              </TabsContent>

              <TabsContent value="proxy">
                <ProxyTab
                  proxyDomains={proxyDomains}
                  setProxyDomains={setProxyDomains}
                  proxyIps={proxyIps}
                  setProxyIps={setProxyIps}
                />
              </TabsContent>

              <TabsContent value="block">
                <BlockTab
                  blockDomains={blockDomains}
                  setBlockDomains={setBlockDomains}
                  blockIps={blockIps}
                  setBlockIps={setBlockIps}
                  enableBlockAds={enableBlockAds}
                  setEnableBlockAds={setEnableBlockAds}
                />
              </TabsContent>

              <TabsContent value="gfw">
                <GfwTab enableGfw={enableGfw} setEnableGfw={setEnableGfw} />
              </TabsContent>

              <TabsContent value="cnDomain">
                <CnDomainTab enableCnDomain={enableCnDomain} setEnableCnDomain={setEnableCnDomain} />
              </TabsContent>

              <TabsContent value="cnIp">
                <CnIpTab enableCnIp={enableCnIp} setEnableCnIp={setEnableCnIp} />
              </TabsContent>
            </Tabs>
            </div>
          </div>
        </>
      )}
    </div>
  )

  if (!showCard) {
    return content
  }

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-zinc-100 dark:border-zinc-800 relative transition-all duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500 text-white shadow-sm">
          <Route className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{t("description")}</p>
        </div>
      </div>
      {content}
    </div>
  )
}
