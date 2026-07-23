/**
 * Motor de envío de documentos PDF por WhatsApp.
 *
 * Orden:
 *  1. Cloud API (multipart → backend → Meta) — único adjunto 100% automático
 *  2. Reintentos Cloud API
 *  3. Web Share API con File (móvil / Windows Share)
 *  4. Fallback desktop: descarga + guía 📎 + abrir chat (solo texto limpio)
 *
 * NUNCA poner base64/PDF en el texto de wa.me.
 * El frontend NUNCA llama a Graph API de Meta directamente.
 */

import { getToken } from "@/lib/api";
import {
  buildWhatsAppUrl,
  isValidPhone,
  openWhatsAppChat,
  sanitizeWhatsAppText,
} from "@/lib/whatsapp";
import { DocumentErrorHandler, DocumentSendError } from "./errorHandler";
import { LruBlobCache } from "./lruCache";
import { dismissDocumentNotification, showDocumentNotification } from "./notifications";
import {
  DEFAULT_SENDER_CONFIG,
  type AttachGuidePayload,
  type DocumentSenderConfig,
  type SendDocumentParams,
  type SendDocumentResult,
  type SendStrategy,
  type WhatsAppCloudStatus,
} from "./types";

type StrategyMetrics = Record<SendStrategy, { success: number; fail: number }>;

function emptyMetrics(): StrategyMetrics {
  return {
    cloud_api: { success: 0, fail: 0 },
    cloud_api_retry: { success: 0, fail: 0 },
    web_share: { success: 0, fail: 0 },
    download_fallback: { success: 0, fail: 0 },
  };
}

export class DocumentSender {
  private config: DocumentSenderConfig;
  private cache: LruBlobCache;
  private statusCache: { at: number; value: WhatsAppCloudStatus | null } = {
    at: 0,
    value: null,
  };
  private metrics = emptyMetrics();

  constructor(config: Partial<DocumentSenderConfig> = {}) {
    this.config = { ...DEFAULT_SENDER_CONFIG, ...config };
    this.cache = new LruBlobCache(this.config.cacheMaxSize);
  }

  getMetrics(): StrategyMetrics {
    return structuredClone(this.metrics);
  }

  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  validateDocument(blob: Blob, fileName: string): void {
    if (!blob || blob.size <= 0) {
      throw new DocumentSendError("PdfFetchError", "PDF vacío.");
    }
    if (blob.size > this.config.maxFileBytes) {
      throw new DocumentSendError("FileTooLarge");
    }
    if (!fileName.trim()) {
      throw new DocumentSendError("PdfFetchError", "Nombre de archivo inválido.");
    }
  }

  /** Solo para depuración / futuras APIs. No usar en el texto del chat. */
  async bufferToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  showUserNotification(
    message: string,
    type: "info" | "success" | "warning" | "error" | "progress",
    opts?: { progress?: number; id?: string; durationMs?: number }
  ): string {
    return showDocumentNotification(message, type, opts);
  }

  /** Obtiene el PDF en RAM (con caché LRU). No escribe a disco. */
  async fetchPdfBlob(
    downloadUrl: string
  ): Promise<{ blob: Blob; fileName: string }> {
    const cached = this.cache.get(downloadUrl);
    if (cached) {
      return { blob: cached, fileName: this.guessFileName(downloadUrl) };
    }

    const token = getToken();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const resp = await fetch(downloadUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new DocumentSendError("PdfFetchError", `HTTP ${resp.status}`);
      }
      const raw = await resp.blob();
      const blob =
        raw.type === "application/pdf"
          ? raw
          : new Blob([raw], { type: "application/pdf" });
      const fileName =
        resp.headers
          .get("Content-Disposition")
          ?.split('filename="')[1]
          ?.replace('"', "") || this.guessFileName(downloadUrl);
      this.validateDocument(blob, fileName);
      this.cache.set(downloadUrl, blob);
      return { blob, fileName };
    } catch (err) {
      if (err instanceof DocumentSendError) throw err;
      throw new DocumentSendError(
        "PdfFetchError",
        err instanceof Error ? err.message : undefined
      );
    } finally {
      window.clearTimeout(timer);
    }
  }

  private guessFileName(url: string): string {
    try {
      const path = new URL(url, window.location.origin).pathname;
      const last = path.split("/").filter(Boolean).pop() || "documento";
      return last.endsWith(".pdf") ? last : `${last}.pdf`;
    } catch {
      return "documento.pdf";
    }
  }

  private cleanChatMessage(raw: string): string {
    return sanitizeWhatsAppText(raw, this.config.maxWhatsAppTextLength);
  }

  async getCloudStatus(force = false): Promise<WhatsAppCloudStatus | null> {
    const now = Date.now();
    if (!force && this.statusCache.value && now - this.statusCache.at < 60_000) {
      return this.statusCache.value;
    }
    try {
      const token = getToken();
      const resp = await fetch("/api/integrations/whatsapp/status", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) return null;
      const value = (await resp.json()) as WhatsAppCloudStatus;
      this.statusCache = { at: now, value };
      return value;
    } catch {
      return null;
    }
  }

  private async postCloudShare(opts: {
    endpoint: "/api/integrations/whatsapp/share" | "/api/integrations/whatsapp/send-document";
    blob: Blob;
    fileName: string;
    message: string;
    phoneNumber: string;
    documentType: string;
    attempt: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; messageId?: string; error?: string; errorCode?: string }> {
    const token = getToken();
    const form = new FormData();
    // Multipart real — nunca JSON con base64 (el backend espera UploadFile)
    form.append("file", opts.blob, opts.fileName);
    form.append("phone_number", opts.phoneNumber);
    form.append("message", this.cleanChatMessage(opts.message));
    form.append("file_name", opts.fileName);
    form.append("document_type", opts.documentType);
    form.append("attempt", String(opts.attempt));
    if (opts.metadata) {
      form.append("metadata_json", JSON.stringify(opts.metadata));
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const resp = await fetch(opts.endpoint, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
        signal: controller.signal,
      });
      const body = await resp.json().catch(() => ({}));
      if (resp.status === 429) {
        return {
          success: false,
          error: body.detail || "Demasiados reintentos",
          errorCode: "TOO_MANY_RETRIES",
        };
      }
      return {
        success: Boolean(body.success),
        messageId: body.message_id,
        error: body.error || (!resp.ok ? `HTTP ${resp.status}` : undefined),
        errorCode: body.error_code,
      };
    } finally {
      window.clearTimeout(timer);
    }
  }

  async sendViaCloudAPI(opts: {
    pdfBlob: Blob;
    fileName: string;
    message: string;
    phoneNumber: string;
    documentType: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; messageId?: string; error?: string; errorCode?: string }> {
    return this.postCloudShare({
      endpoint: "/api/integrations/whatsapp/share",
      blob: opts.pdfBlob,
      fileName: opts.fileName,
      message: opts.message,
      phoneNumber: opts.phoneNumber,
      documentType: opts.documentType,
      attempt: 1,
      metadata: opts.metadata,
    });
  }

  async sendViaCloudAPIRetry(opts: {
    pdfBlob: Blob;
    fileName: string;
    message: string;
    phoneNumber: string;
    documentType: string;
    metadata?: Record<string, unknown>;
    attempt: number;
  }): Promise<{ success: boolean; messageId?: string; error?: string; errorCode?: string }> {
    await this.delay(this.config.baseRetryDelayMs * Math.pow(2, opts.attempt - 2));
    return this.postCloudShare({
      endpoint: "/api/integrations/whatsapp/send-document",
      blob: opts.pdfBlob,
      fileName: opts.fileName,
      message: opts.message,
      phoneNumber: opts.phoneNumber,
      documentType: opts.documentType,
      attempt: opts.attempt,
      metadata: opts.metadata,
    });
  }

  canUseWebShare(file: File): boolean {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return false;
    }
    if (typeof navigator.canShare === "function") {
      try {
        return navigator.canShare({ files: [file] });
      } catch {
        return false;
      }
    }
    return true;
  }

  async sendViaWebShare(opts: {
    pdfBlob: Blob;
    fileName: string;
    message: string;
  }): Promise<{ success: boolean; aborted?: boolean; error?: string }> {
    const file = new File([opts.pdfBlob], opts.fileName, { type: "application/pdf" });
    if (!this.canUseWebShare(file)) {
      throw new DocumentSendError("WebShareUnsupported");
    }
    try {
      await navigator.share({
        files: [file],
        title: opts.fileName,
        text: this.cleanChatMessage(opts.message).slice(0, 200),
      });
      return { success: true };
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") {
        return { success: false, aborted: true, error: "Compartir cancelado" };
      }
      throw err;
    }
  }

  async downloadAsFallback(opts: {
    pdfBlob: Blob;
    fileName: string;
    message: string;
    phoneNumber?: string | null;
  }): Promise<{
    success: boolean;
    requiresManualAttach: boolean;
    attachGuide: AttachGuidePayload;
    error?: string;
  }> {
    const safeName = opts.fileName.endsWith(".pdf") ? opts.fileName : `${opts.fileName}.pdf`;
    const chatMessage = this.cleanChatMessage(
      opts.message ||
        `Hola, te compartimos el documento ${safeName}. Adjúntalo con el clip 📎.`
    );

    const pdfObjectUrl = URL.createObjectURL(opts.pdfBlob);
    try {
      const a = document.createElement("a");
      a.href = pdfObjectUrl;
      a.download = safeName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      /* download may still work via object URL in guide */
    }

    // Conservar object URL para re-descarga desde el modal (~10 min)
    window.setTimeout(() => {
      try {
        URL.revokeObjectURL(pdfObjectUrl);
      } catch {
        /* ignore */
      }
    }, 10 * 60 * 1000);

    if (opts.phoneNumber && isValidPhone(opts.phoneNumber)) {
      openWhatsAppChat(opts.phoneNumber, chatMessage);
    }

    const attachGuide: AttachGuidePayload = {
      fileName: safeName,
      phoneNumber: opts.phoneNumber,
      message: chatMessage,
      pdfObjectUrl,
    };

    // Disparar evento global para el modal de asistencia
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("dentalfacil:attach-guide", { detail: attachGuide })
      );
    }

    return {
      success: true,
      requiresManualAttach: true,
      attachGuide,
      error:
        opts.phoneNumber && isValidPhone(opts.phoneNumber)
          ? undefined
          : "PDF descargado. Abre WhatsApp y adjunta el archivo con el clip 📎.",
    };
  }

  /** Re-descarga el PDF y reabre el chat (desde el modal). */
  reopenAttachAssist(guide: AttachGuidePayload): void {
    const a = document.createElement("a");
    a.href = guide.pdfObjectUrl;
    a.download = guide.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (guide.phoneNumber && isValidPhone(guide.phoneNumber)) {
      openWhatsAppChat(guide.phoneNumber, guide.message);
    }
  }

  previewWhatsAppLink(phone: string | null | undefined, message: string): string | null {
    return buildWhatsAppUrl(phone, this.cleanChatMessage(message), {
      preferDeepLink: false,
    });
  }

  private async reportMetric(payload: {
    strategy: SendStrategy;
    success: boolean;
    documentType?: string;
    durationMs: number;
    errorCode?: string;
  }): Promise<void> {
    try {
      const token = getToken();
      await fetch("/api/integrations/whatsapp/metrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          strategy: payload.strategy,
          success: payload.success,
          document_type: payload.documentType,
          duration_ms: payload.durationMs,
          error_code: payload.errorCode,
        }),
      });
    } catch {
      /* ignore metrics failures */
    }
  }

  private track(strategy: SendStrategy, success: boolean): void {
    if (success) this.metrics[strategy].success += 1;
    else this.metrics[strategy].fail += 1;
  }

  /**
   * Orquesta el envío con fallback automático.
   */
  async sendDocument(params: SendDocumentParams): Promise<SendDocumentResult> {
    const started = performance.now();
    const documentType = params.documentType || "documento";
    const message = this.cleanChatMessage((params.message || "").trim());
    const progressId = this.showUserNotification("Preparando documento…", "progress", {
      progress: 10,
    });

    try {
      if (!params.downloadUrl) {
        throw new DocumentSendError("PdfFetchError", "Falta la URL del documento.");
      }

      this.showUserNotification("Generando PDF en memoria…", "progress", {
        id: progressId,
        progress: 25,
      });
      const { blob, fileName: fetchedName } = await this.fetchPdfBlob(params.downloadUrl);
      const fileName = (params.fileName || fetchedName || "documento.pdf").trim();
      this.validateDocument(blob, fileName);

      const preferCloud = params.preferCloudApi !== false;
      const phone = params.phoneNumber;
      let lastError: string | undefined;
      let lastCode: string | undefined;

      // --- Estrategia 1 + 2: Cloud API (multipart) ---
      if (preferCloud && phone && isValidPhone(phone)) {
        const status = await this.getCloudStatus();
        if (status?.configured && status.enabled) {
          this.showUserNotification("Enviando PDF por WhatsApp (Cloud API)…", "progress", {
            id: progressId,
            progress: 45,
          });
          const first = await this.sendViaCloudAPI({
            pdfBlob: blob,
            fileName,
            message,
            phoneNumber: phone,
            documentType,
            metadata: params.metadata,
          });
          if (first.success) {
            this.track("cloud_api", true);
            await params.onMarkedSent?.().catch(() => undefined);
            const durationMs = Math.round(performance.now() - started);
            await this.reportMetric({
              strategy: "cloud_api",
              success: true,
              documentType,
              durationMs,
            });
            dismissDocumentNotification(progressId);
            this.showUserNotification(
              "Documento enviado por WhatsApp con PDF adjunto",
              "success"
            );
            return {
              success: true,
              strategy: "cloud_api",
              messageId: first.messageId,
              durationMs,
            };
          }
          this.track("cloud_api", false);
          lastError = first.error;
          lastCode = first.errorCode;

          if (first.errorCode !== "CLOUD_API_NOT_CONFIGURED") {
            for (let attempt = 2; attempt <= this.config.maxRetries; attempt += 1) {
              this.showUserNotification(
                `Reintento Cloud API (${attempt}/${this.config.maxRetries})…`,
                "progress",
                { id: progressId, progress: 45 + attempt * 8 }
              );
              const retry = await this.sendViaCloudAPIRetry({
                pdfBlob: blob,
                fileName,
                message,
                phoneNumber: phone,
                documentType,
                metadata: params.metadata,
                attempt,
              });
              if (retry.success) {
                this.track("cloud_api_retry", true);
                await params.onMarkedSent?.().catch(() => undefined);
                const durationMs = Math.round(performance.now() - started);
                await this.reportMetric({
                  strategy: "cloud_api_retry",
                  success: true,
                  documentType,
                  durationMs,
                });
                dismissDocumentNotification(progressId);
                this.showUserNotification("Documento enviado (reintento)", "success");
                return {
                  success: true,
                  strategy: "cloud_api_retry",
                  messageId: retry.messageId,
                  durationMs,
                };
              }
              this.track("cloud_api_retry", false);
              lastError = retry.error;
              lastCode = retry.errorCode;
            }
          }
        }
      }

      // --- Estrategia 3: Web Share con archivo ---
      this.showUserNotification("Abriendo compartir con archivo adjunto…", "progress", {
        id: progressId,
        progress: 70,
      });
      try {
        const shared = await this.sendViaWebShare({
          pdfBlob: blob,
          fileName,
          message,
        });
        if (shared.success) {
          this.track("web_share", true);
          await params.onMarkedSent?.().catch(() => undefined);
          const durationMs = Math.round(performance.now() - started);
          await this.reportMetric({
            strategy: "web_share",
            success: true,
            documentType,
            durationMs,
          });
          dismissDocumentNotification(progressId);
          this.showUserNotification(
            "Documento compartido — elige WhatsApp en el menú",
            "success"
          );
          return { success: true, strategy: "web_share", durationMs };
        }
        if (shared.aborted) {
          this.track("web_share", false);
        }
      } catch (err) {
        this.track("web_share", false);
        DocumentErrorHandler.handleError(err, "web_share");
      }

      // --- Estrategia 4: descarga + guía + chat (wa.me no adjunta archivos) ---
      this.showUserNotification(
        "Descargando PDF. WhatsApp Desktop no adjunta solo: usa el clip 📎.",
        "progress",
        { id: progressId, progress: 90 }
      );
      const fallback = await this.downloadAsFallback({
        pdfBlob: blob,
        fileName,
        message,
        phoneNumber: phone,
      });
      this.track("download_fallback", fallback.success);
      if (fallback.success) {
        await params.onMarkedSent?.().catch(() => undefined);
      }
      const durationMs = Math.round(performance.now() - started);
      await this.reportMetric({
        strategy: "download_fallback",
        success: fallback.success,
        documentType,
        durationMs,
        errorCode: lastCode,
      });
      dismissDocumentNotification(progressId);
      this.showUserNotification(
        "PDF descargado. En el chat de WhatsApp: clip 📎 → elige el archivo → Enviar.",
        "warning",
        { durationMs: 9000 }
      );
      return {
        success: fallback.success,
        strategy: "download_fallback",
        requiresManualAttach: true,
        attachGuide: fallback.attachGuide,
        error: fallback.error || lastError,
        errorCode: lastCode,
        durationMs,
      };
    } catch (err) {
      const info = DocumentErrorHandler.handleError(err, "sendDocument");
      dismissDocumentNotification(progressId);
      this.showUserNotification(`${info.message} ${info.action}`, "error");
      return {
        success: false,
        strategy: null,
        error: info.message,
        errorCode: info.code,
        durationMs: Math.round(performance.now() - started),
      };
    }
  }
}

/** Instancia compartida para toda la app. */
export const documentSender = new DocumentSender();
