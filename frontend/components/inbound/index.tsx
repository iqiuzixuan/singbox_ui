"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { QRCodeSVG } from "qrcode.react"
import { Plus, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSingboxConfigStore } from "@/lib/store/singbox-config"
import { apiClient } from "@/lib/api"
import { useTranslation } from "@/lib/i18n"
import type { QrCodeType } from "./types"

// Protocol form components
import { MixedForm } from "./mixed-form"
import { VlessForm } from "./vless-form"
import { VmessForm } from "./vmess-form"
import { TrojanForm } from "./trojan-form"
import { ShadowsocksForm } from "./shadowsocks-form"
import { Hysteria2Form } from "./hysteria2-form"
import { WireguardForm } from "./wireguard-form"
import { TuicForm } from "./tuic-form"
import { NaiveForm } from "./naive-form"
import { ShadowtlsForm } from "./shadowtls-form"
import { AnytlsForm } from "./anytls-form"
import { HttpForm } from "./http-form"

const tabTriggerClass = "rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 data-[state=active]:text-foreground dark:data-[state=active]:text-zinc-100 data-[state=active]:shadow-sm transition-all"

interface InboundConfigProps {
  showCard?: boolean
}

const defaultInboundTags: Record<string, string> = {
  socks5: "mixed-in",
  mixed: "mixed-in",
  vless: "vless-in",
  wireguard: "wireguard-ep",
  http: "http-in",
  shadowsocks: "ss-in",
  hysteria2: "hy2-in",
  vmess: "vmess-in",
  trojan: "trojan-in",
  tuic: "tuic-in",
  naive: "naive-in",
  shadowtls: "shadowtls-in",
  anytls: "anytls-in",
}

function getDefaultInboundTag(protocol: string): string {
  return defaultInboundTags[protocol] || `${protocol}-in`
}

function inboundTypeToProtocol(type?: string): string {
  const map: Record<string, string> = {
    mixed: "socks5",
    socks: "socks5",
    vless: "vless",
    wireguard: "wireguard",
    http: "http",
    shadowsocks: "shadowsocks",
    hysteria2: "hysteria2",
    vmess: "vmess",
    trojan: "trojan",
    tuic: "tuic",
    naive: "naive",
    shadowtls: "shadowtls",
    anytls: "anytls",
  }
  return type ? map[type] || type : "wireguard"
}

function protocolToInboundType(protocol: string): string {
  return protocol === "socks5" ? "mixed" : protocol
}

function getDefaultListenPort(protocol: string): number {
  const ports: Record<string, number> = {
    wireguard: 5353,
    socks5: 1080,
    mixed: 1080,
    http: 8080,
    shadowsocks: 8388,
  }
  return ports[protocol] || 443
}

function getUsedListenPorts(config: any): Set<number> {
  return new Set([
    ...((config.inbounds || []).map((inbound: any) => inbound.listen_port).filter(Boolean)),
    ...((config.endpoints || []).map((endpoint: any) => endpoint.listen_port).filter(Boolean)),
  ])
}

function nextListenPort(config: any, protocol: string): number {
  const usedPorts = getUsedListenPorts(config)
  let port = getDefaultListenPort(protocol)
  while (usedPorts.has(port)) {
    port += 1
  }
  return port
}

function getInboundTagSet(config: any): Set<string> {
  return new Set([
    ...((config.inbounds || []).map((inbound: any) => inbound.tag).filter(Boolean)),
    ...((config.endpoints || []).map((endpoint: any) => endpoint.tag).filter(Boolean)),
  ])
}

function makeUniqueTag(base: string, usedTags: Set<string>, currentTag?: string): string {
  const fallback = base.trim() || "inbound"
  if (fallback === currentTag || !usedTags.has(fallback)) return fallback
  let index = 2
  let candidate = `${fallback}-${index}`
  while (usedTags.has(candidate) && candidate !== currentTag) {
    index += 1
    candidate = `${fallback}-${index}`
  }
  return candidate
}

function buildDefaultInbound(protocol: string, tag: string, listenPort: number): any {
  return {
    type: protocolToInboundType(protocol),
    tag,
    listen: "::",
    listen_port: listenPort,
  }
}

function buildDefaultEndpoint(tag: string, listenPort: number): any {
  return {
    type: "wireguard",
    tag,
    listen_port: listenPort,
    address: ["10.10.0.1/32"],
    peers: [],
    mtu: 1420,
  }
}

type InboundSourceKind = "inbound" | "endpoint"

interface InboundSourceItem {
  key: string
  kind: InboundSourceKind
  index: number
  type: string
  protocol: string
  tag: string
}

export function InboundConfig({ showCard = true }: InboundConfigProps) {
  const { t } = useTranslation("inbound")
  const {
    config: storeConfig,
    setInbound,
    addInbound,
    removeInbound,
    setEndpoint,
    addEndpoint,
    removeEndpoint,
    currentInstance,
  } = useSingboxConfigStore()

  const sourceItems = useMemo<InboundSourceItem[]>(() => {
    const inbounds = (storeConfig.inbounds || []).map((inbound: any, index: number) => ({
      key: `inbound:${index}`,
      kind: "inbound" as const,
      index,
      type: inbound.type || "mixed",
      protocol: inboundTypeToProtocol(inbound.type),
      tag: inbound.tag || getDefaultInboundTag(inboundTypeToProtocol(inbound.type)),
    }))
    const endpoints = (storeConfig.endpoints || [])
      .map((endpoint: any, index: number) => ({
        key: `endpoint:${index}`,
        kind: "endpoint" as const,
        index,
        type: endpoint.type || "wireguard",
        protocol: inboundTypeToProtocol(endpoint.type),
        tag: endpoint.tag || getDefaultInboundTag(inboundTypeToProtocol(endpoint.type)),
        listenPort: endpoint.listen_port,
      }))
      .filter((endpoint: any) => endpoint.type === "wireguard" && endpoint.listenPort)
    return [...inbounds, ...endpoints]
  }, [storeConfig.inbounds, storeConfig.endpoints])

  const [selectedKey, setSelectedKey] = useState(() => sourceItems[0]?.key || "")
  const selectedItem = sourceItems.find((item) => item.key === selectedKey)
  const initialConfig = selectedItem?.kind === "inbound" ? storeConfig.inbounds?.[selectedItem.index] : undefined
  const initialEndpoint = selectedItem?.kind === "endpoint" ? storeConfig.endpoints?.[selectedItem.index] : undefined

  const [protocol, setProtocol] = useState(() => {
    if (initialConfig?.type) return inboundTypeToProtocol(initialConfig.type)
    if (initialEndpoint?.type === "wireguard") return "wireguard"
    return "wireguard"
  })
  const [sourceTag, setSourceTag] = useState(() => {
    if (initialEndpoint?.type === "wireguard") return initialEndpoint.tag || "wireguard-ep"
    if (initialConfig?.tag) return initialConfig.tag
    return getDefaultInboundTag(protocol)
  })

  useEffect(() => {
    if (sourceItems.length === 0) {
      if (selectedKey) setSelectedKey("")
      return
    }
    if (!sourceItems.some((item) => item.key === selectedKey)) {
      setSelectedKey(sourceItems[0].key)
    }
  }, [sourceItems, selectedKey])

  useEffect(() => {
    if (!selectedItem) return
    setProtocol(selectedItem.protocol)
    setSourceTag(selectedItem.tag || getDefaultInboundTag(selectedItem.protocol))
  }, [selectedItem?.key, selectedItem?.protocol, selectedItem?.tag])

  // Shared state
  const [error, setError] = useState("")
  const [showQrCode, setShowQrCode] = useState(false)
  const [qrCodeContent, setQrCodeContent] = useState("")
  const [qrCodeType, setQrCodeType] = useState<QrCodeType>("wireguard")
  const [selectedPeerIndex, setSelectedPeerIndex] = useState(0)
  const [serverIP, setServerIP] = useState("")
  const [certLoading, setCertLoading] = useState(false)
  const [certInfo, setCertInfo] = useState<{ common_name?: string; valid_to?: string } | null>(null)

  // Certificate file upload refs
  const certFileRef = useRef<HTMLInputElement>(null)
  const keyFileRef = useRef<HTMLInputElement>(null)
  const [pendingCertFile, setPendingCertFile] = useState<File | null>(null)

  // Shared callbacks
  const handleError = (msg: string) => setError(msg)

  const handleShowQrCode = (content: string, type: QrCodeType, peerIndex?: number) => {
    setQrCodeContent(content)
    setQrCodeType(type)
    if (peerIndex !== undefined) setSelectedPeerIndex(peerIndex)
    setShowQrCode(true)
  }

  const handleGenerateCert = async (domain?: string) => {
    if (!currentInstance) {
      setError(t("selectInstanceFirst"))
      return
    }

    setCertLoading(true)
    setError("")
    try {
      let certDomain = domain
      if (!certDomain) {
        const response = await fetch("/api/wireguard/public-ip")
        if (response.ok) {
          const data = await response.json()
          certDomain = data.ip
        } else {
          certDomain = "localhost"
        }
      }

      const result = await apiClient.generateSelfSignedCert(currentInstance, certDomain || "localhost", 365)
      setCertInfo({
        common_name: result.common_name,
        valid_to: result.valid_to,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t("generateCertFailed"))
    } finally {
      setCertLoading(false)
    }
  }

  const handleUploadCert = () => {
    certFileRef.current?.click()
  }

  const handleCertFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPendingCertFile(file)
      keyFileRef.current?.click()
    }
  }

  const handleKeyFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && pendingCertFile) {
      if (!currentInstance) {
        setError(t("selectInstanceFirst"))
        return
      }

      setCertLoading(true)
      setError("")
      try {
        const result = await apiClient.uploadCertificate(currentInstance, pendingCertFile, file)
        setCertInfo({
          common_name: result.common_name,
          valid_to: result.valid_to,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : t("uploadCertFailed"))
      } finally {
        setCertLoading(false)
      }

      setPendingCertFile(null)
      if (certFileRef.current) certFileRef.current.value = ""
      if (keyFileRef.current) keyFileRef.current.value = ""
    }
  }

  // Shared props for all protocol forms
  const handleAddSource = () => {
    const usedTags = getInboundTagSet(storeConfig)
    const nextProtocol = protocol || "wireguard"
    const tag = makeUniqueTag(getDefaultInboundTag(nextProtocol), usedTags)
    const listenPort = nextListenPort(storeConfig, nextProtocol)

    if (nextProtocol === "wireguard") {
      const nextIndex = storeConfig.endpoints?.length || 0
      addEndpoint(buildDefaultEndpoint(tag, listenPort))
      setSelectedKey(`endpoint:${nextIndex}`)
    } else {
      const nextIndex = storeConfig.inbounds?.length || 0
      addInbound(buildDefaultInbound(nextProtocol, tag, listenPort))
      setSelectedKey(`inbound:${nextIndex}`)
    }
    setProtocol(nextProtocol)
    setSourceTag(tag)
  }

  const handleRemoveSource = () => {
    if (!selectedItem) return
    if (!window.confirm(t("confirmRemove"))) return
    if (selectedItem.kind === "endpoint") {
      removeEndpoint(selectedItem.index)
    } else {
      removeInbound(selectedItem.index)
    }
    setSelectedKey("")
  }

  const handleProtocolChange = (value: string) => {
    setProtocol(value)
    if (!selectedItem) {
      setSourceTag(getDefaultInboundTag(value))
      return
    }

    const usedTags = getInboundTagSet(storeConfig)
    const oldDefaultTag = getDefaultInboundTag(protocol)
    const rawTag = sourceTag.trim() || selectedItem.tag
    const nextTag = makeUniqueTag(
      rawTag === oldDefaultTag ? getDefaultInboundTag(value) : rawTag,
      usedTags,
      selectedItem.tag
    )
    const currentConfig = selectedItem.kind === "inbound" ? initialConfig : initialEndpoint
    const listenPort = currentConfig?.listen_port || nextListenPort(storeConfig, value)

    setSourceTag(nextTag)

    if (value === "wireguard") {
      if (selectedItem.kind === "endpoint") return
      const nextIndex = storeConfig.endpoints?.length || 0
      addEndpoint(buildDefaultEndpoint(nextTag, listenPort))
      removeInbound(selectedItem.index)
      setSelectedKey(`endpoint:${nextIndex}`)
      return
    }

    if (selectedItem.kind === "inbound") {
      setInbound(selectedItem.index, buildDefaultInbound(value, nextTag, listenPort))
      return
    }

    const nextIndex = storeConfig.inbounds?.length || 0
    addInbound(buildDefaultInbound(value, nextTag, listenPort))
    removeEndpoint(selectedItem.index)
    setSelectedKey(`inbound:${nextIndex}`)
  }

  const updateSourceTag = (value: string) => {
    setSourceTag(value)
    const tag = value.trim()
    if (!tag) return
    if (!selectedItem) return
    if (selectedItem.kind === "endpoint") {
      const currentEndpoint = useSingboxConfigStore.getState().config.endpoints?.[selectedItem.index]
      if (currentEndpoint) setEndpoint(selectedItem.index, { ...currentEndpoint, tag })
      return
    }
    const currentInbound = useSingboxConfigStore.getState().config.inbounds?.[selectedItem.index]
    if (currentInbound) {
      setInbound(selectedItem.index, { ...currentInbound, tag })
    }
  }

  const setInboundWithTag = (index: number, inbound: any) => {
    if (!selectedItem || selectedItem.kind !== "inbound") return
    const tag = sourceTag.trim() || inbound.tag || getDefaultInboundTag(protocol)
    setInbound(selectedItem.index, { ...inbound, tag })
  }

  const setEndpointWithTag = (index: number, endpoint: any) => {
    if (!selectedItem || selectedItem.kind !== "endpoint") return
    const tag = sourceTag.trim() || endpoint.tag || getDefaultInboundTag(protocol)
    setEndpoint(selectedItem.index, { ...endpoint, tag })
  }

  const clearSelectedEndpoint = () => {
    if (selectedItem?.kind === "endpoint") {
      removeEndpoint(selectedItem.index)
      setSelectedKey("")
    }
  }

  const formProps = {
    initialConfig,
    initialEndpoint,
    setInbound: setInboundWithTag,
    setEndpoint: setEndpointWithTag,
    clearEndpoints: clearSelectedEndpoint,
    currentInstance,
    onError: handleError,
    onShowQrCode: handleShowQrCode,
    serverIP,
    setServerIP,
    certLoading,
    setCertLoading,
    certInfo,
    setCertInfo,
    onGenerateCert: handleGenerateCert,
    onUploadCert: handleUploadCert,
  }

  const content = (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label>{t("title")}</Label>
          <div className="flex items-center gap-2">
            {selectedItem && (
              <Button size="sm" variant="outline" onClick={handleRemoveSource}>
                <Trash2 className="h-4 w-4 mr-1" />
                {t("removeInbound")}
              </Button>
            )}
            <Button size="sm" onClick={handleAddSource}>
              <Plus className="h-4 w-4 mr-1" />
              {t("addInbound")}
            </Button>
          </div>
        </div>

        {sourceItems.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <p>{t("noInbound")}</p>
            <p className="mt-1 text-xs">{t("noInboundHint")}</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sourceItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedKey(item.key)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  item.key === selectedKey
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                <span className="block font-medium">{item.tag}</span>
                <span className="block text-xs text-muted-foreground">{item.protocol}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedItem && (
        <>
          <div className="space-y-2">
            <Label>{t("tagLabel")}</Label>
            <Input
              value={sourceTag}
              onChange={(e) => updateSourceTag(e.target.value)}
              placeholder={getDefaultInboundTag(protocol)}
            />
            <p className="text-xs text-muted-foreground">{t("tagDesc")}</p>
          </div>

          <Tabs
            value={protocol}
            onValueChange={handleProtocolChange}
            className="w-full"
          >
            <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm">
              <TabsTrigger className={tabTriggerClass} value="wireguard">WireGuard</TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="socks5">Mixed</TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="vless">VLESS</TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="vmess">VMess</TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="trojan">Trojan</TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="shadowsocks">Shadowsocks</TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="hysteria2">Hysteria2</TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="tuic">TUIC</TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="naive">Naive</TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="shadowtls">ShadowTLS</TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="anytls">AnyTLS</TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="http">HTTP</TabsTrigger>
            </TabsList>

            <div key={selectedItem.key} className="pt-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <TabsContent value="socks5"><MixedForm {...formProps} /></TabsContent>
              <TabsContent value="vless"><VlessForm {...formProps} /></TabsContent>
              <TabsContent value="wireguard"><WireguardForm {...formProps} /></TabsContent>
              <TabsContent value="shadowsocks"><ShadowsocksForm {...formProps} /></TabsContent>
              <TabsContent value="hysteria2"><Hysteria2Form {...formProps} /></TabsContent>
              <TabsContent value="vmess"><VmessForm {...formProps} /></TabsContent>
              <TabsContent value="trojan"><TrojanForm {...formProps} /></TabsContent>
              <TabsContent value="tuic"><TuicForm {...formProps} /></TabsContent>
              <TabsContent value="naive"><NaiveForm {...formProps} /></TabsContent>
              <TabsContent value="shadowtls"><ShadowtlsForm {...formProps} /></TabsContent>
              <TabsContent value="anytls"><AnytlsForm {...formProps} /></TabsContent>
              <TabsContent value="http"><HttpForm {...formProps} /></TabsContent>
            </div>
          </Tabs>
        </>
      )}

      {error && (
        <div className="mt-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      {/* QR Code Dialog */}
      <Dialog open={showQrCode} onOpenChange={setShowQrCode}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {qrCodeType === "wireguard" && t("qrCodeTitleWireguard")}
              {qrCodeType === "shadowsocks" && t("qrCodeTitleShadowsocks")}
              {qrCodeType === "socks5" && t("qrCodeTitleMixed")}
              {qrCodeType === "vless" && t("qrCodeTitleVless")}
              {qrCodeType === "hysteria2" && t("qrCodeTitleHysteria2")}
              {qrCodeType === "vmess" && t("qrCodeTitleVmess")}
              {qrCodeType === "trojan" && t("qrCodeTitleTrojan")}
              {qrCodeType === "tuic" && t("qrCodeTitleTuic")}
            </DialogTitle>
            <DialogDescription>
              {qrCodeType === "wireguard" && t("qrCodeDescWireguard", { n: selectedPeerIndex + 1 })}
              {qrCodeType === "shadowsocks" && t("qrCodeDescShadowsocks")}
              {qrCodeType === "socks5" && t("qrCodeDescSocks5")}
              {qrCodeType === "vless" && t("qrCodeDescVless", { n: selectedPeerIndex + 1 })}
              {qrCodeType === "hysteria2" && t("qrCodeDescHysteria2")}
              {qrCodeType === "vmess" && t("qrCodeDescVmess", { n: selectedPeerIndex + 1 })}
              {qrCodeType === "trojan" && t("qrCodeDescTrojan", { n: selectedPeerIndex + 1 })}
              {qrCodeType === "tuic" && t("qrCodeDescTuic", { n: selectedPeerIndex + 1 })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG value={qrCodeContent} size={256} level="M" />
            </div>
            {qrCodeType !== "wireguard" && (
              <div className="w-full">
                <Label className="text-xs text-muted-foreground">{t("shareLink")}</Label>
                <Input
                  value={qrCodeContent}
                  readOnly
                  className="text-xs font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden file inputs for certificate upload */}
      <input
        type="file"
        ref={certFileRef}
        onChange={handleCertFileChange}
        accept=".pem,.crt,.cer"
        style={{ display: "none" }}
      />
      <input
        type="file"
        ref={keyFileRef}
        onChange={handleKeyFileChange}
        accept=".pem,.key"
        style={{ display: "none" }}
      />
    </div>
  )

  if (showCard) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
    )
  }

  return content
}
