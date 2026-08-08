/**
 * Sistema Universal de Envío de Documentos (WhatsApp) — flujo nativo.
 *
 * Al hacer clic en Enviar (orden fijo):
 *  1. Cloud API (servidor) — solo si está configurada
 *  2. Reintento Cloud API (cliente)
 *  3. Web Share API — selector del SO con PDF adjunto
 *  4. WhatsApp Desktop / WhatsApp Web — chat del paciente + PDF desde Blob
 *
 * Nunca: base64 en el chat, Graph API desde el frontend, ni modal de arrastre.
 * El frontend NUNCA llama a Meta Graph directamente.
 */

import { getToken, getApiBase } from "@/lib/api";
import {
  normalizePeruPhone,
  openWhatsAppChat,
  sanitizeWhatsAppText,
  tryCopyPdfToClipboard,
} from "@/lib/whatsapp";
import { DocumentErrorHandler, DocumentSendError } from "./errorHandler";
import { LruBlobCache } from "./lruCache";
import { dismissDocumentNotification, showDocumentNotification } from "./notifications";
import {
  DEFAULT_SENDER_CONFIG,
  type DocumentSenderConfig,
  type SendDocumentParams,
  type SendDocumentResult,
  type SendStrategy,
  type WhatsAppCloudStatus,
} from "./types";

function resolveDocumentUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith("blob:")) return url;
  const base = getApiBase().replace(/\/$/, "");
  if (url.startsWith("/")) return `${base}${url}`;
  return `${base}/${url}`;
}

type StrategyMetrics = Record<SendStrategy, { success: number; fail: number }>;

function emptyMetrics(): StrategyMetrics {
  return {
    cloud_api: { success: 0, fail: 0 },
    cloud_api_retry: { success: 0, fail: 0 },
    web_share: { success: 0, fail: 0 },
    whatsapp_app: { success: 0, fail: 0 },
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

  showUserNotification(
    message: string,
    type: "info" | "success" | "warning" | "error" | "progress",
    opts?: { progress?: number; id?: string; durationMs?: number }
  ): string {
    return showDocumentNotification(message, type, opts);
  }

  /** Obtiene el PDF en RAM (caché LRU). No escribe a disco. */
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
      const resp = await fetch(resolveDocumentUrl(downloadUrl), {
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
  }): Promise<{
    success: boolean;
    cloudApiSent: boolean;
    messageId?: string;
    error?: string;
    errorCode?: string;
  }> {
    const token = getToken();
    const form = new FormData();
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
          cloudApiSent: false,
          error: body.detail || "Demasiados reintentos",
          errorCode: "TOO_MANY_RETRIES",
        };
      }
      const ok = Boolean(body.success);
      return {
        success: ok,
        cloudApiSent: Boolean(body.cloud_api_sent ?? ok),
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
  }) {
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
  }) {
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

  /** True si el navegador expone Web Share (puede o no aceptar files). */
  canAttemptWebShare(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.share === "function";
  }

  canUseWebShare(file: File): boolean {
    if (!this.canAttemptWebShare()) return false;
    if (typeof navigator.canShare === "function") {
      try {
        // En Chrome/Edge desktop canShare({files}) a veces es false de más;
        // aún así intentamos share más abajo.
        return navigator.canShare({ files: [file] }) || navigator.canShare({ text: "x" });
      } catch {
        return true;
      }
    }
    return true;
  }

  async sendViaWebShare(opts: {
    pdfBlob: Blob;
    fileName: string;
    message: string;
    phoneNumber?: string | null;
  }): Promise<{ success: boolean; aborted?: boolean; error?: string; phoneTargeted?: boolean }> {
    if (!this.canAttemptWebShare()) {
      throw new DocumentSendError("WebShareUnsupported");
    }

    const file = new File([opts.pdfBlob], opts.fileName, { type: "application/pdf" });
    const phone = normalizePeruPhone(opts.phoneNumber);
    const cleanMsg = this.cleanChatMessage(opts.message);

    // No abrir WhatsApp antes del share: el diálogo del protocolo cancela el gesto
    // y fuerza el fallback. El PDF debe viajar solo por Web Share (sigue en RAM).
    try {
      const payload: ShareData = {
        files: [file],
        title: opts.fileName,
        text: cleanMsg.slice(0, 200),
      };
      if (typeof navigator.canShare === "function") {
        try {
          if (!navigator.canShare({ files: [file] })) {
            throw new DocumentSendError("WebShareUnsupported");
          }
        } catch (err) {
          if (err instanceof DocumentSendError) throw err;
          throw new DocumentSendError("WebShareUnsupported");
        }
      }
      await navigator.share(payload);

      // Tras compartir el PDF en RAM, enfocar el chat del paciente (número automático).
      let phoneTargeted = false;
      if (phone) {
        openWhatsAppChat(phone, cleanMsg, { deepLinkOnly: true });
        phoneTargeted = true;
      }
      return { success: true, phoneTargeted };
    } catch (err) {
      if (err instanceof DocumentSendError) throw err;
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") {
        return {
          success: false,
          aborted: true,
          error: "Compartir cancelado",
          phoneTargeted: false,
        };
      }
      // DataError / NotAllowedError / TypeError → fallback sin descarga
      throw new DocumentSendError("WebShareUnsupported");
    }
  }

  /**
   * Sin Cloud / sin Web Share: PDF permanece en RAM (portapapeles) + chat del paciente.
   * Nunca dispara «Guardar como» / descarga a disco.
   */
  async sendViaWhatsAppApp(opts: {
    pdfBlob: Blob;
    fileName: string;
    message: string;
    phoneNumber: string;
  }): Promise<{ success: boolean; clipboardOk: boolean; error?: string }> {
    const phone = normalizePeruPhone(opts.phoneNumber);
    if (!phone) {
      throw new DocumentSendError("InvalidPhone");
    }
    const cleanMsg = this.cleanChatMessage(opts.message);

    // PDF solo en RAM → portapapeles (Ctrl+V en WhatsApp Desktop)
    const clipboardOk = await tryCopyPdfToClipboard(opts.pdfBlob, opts.fileName);

    // Chat del paciente (número automático) — Desktop + Web
    const opened = openWhatsAppChat(phone, cleanMsg, { desktopAndWeb: true });
    if (!opened.success) {
      return {
        success: false,
        clipboardOk,
        error: opened.error || "No se pudo abrir WhatsApp",
      };
    }
    return { success: true, clipboardOk };
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
      /* ignore */
    }
  }

  private track(strategy: SendStrategy, success: boolean): void {
    if (success) this.metrics[strategy].success += 1;
    else this.metrics[strategy].fail += 1;
  }

  /**
   * Flujo nativo: Cloud (opcional) → Web Share → WhatsApp Desktop/Web.
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
      const phone = normalizePeruPhone(params.phoneNumber);
      let lastError: string | undefined;
      let lastCode: string | undefined;

      // --- 1–2. Cloud API solo si está configurada (evita round-trip inútil) ---
      const cloudStatus = preferCloud && phone ? await this.getCloudStatus() : null;
      const cloudConfigured = Boolean(cloudStatus?.configured || cloudStatus?.enabled);

      if (preferCloud && phone && cloudConfigured) {
        this.showUserNotification("Enviando por WhatsApp Cloud…", "progress", {
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

        if (first.success && first.cloudApiSent) {
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
          this.showUserNotification("Documento enviado por WhatsApp", "success");
          return {
            success: true,
            strategy: "cloud_api",
            cloud_api_sent: true,
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
            if (retry.success && retry.cloudApiSent) {
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
                cloud_api_sent: true,
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

      // --- 3. Web Share (PDF en RAM → selector SO; sin descarga) ---
      if (this.canAttemptWebShare()) {
        this.showUserNotification(
          phone
            ? "Compartiendo PDF en memoria hacia WhatsApp…"
            : "Abriendo compartir… elige WhatsApp",
          "progress",
          { id: progressId, progress: 75 }
        );
        try {
          const shared = await this.sendViaWebShare({
            pdfBlob: blob,
            fileName,
            message,
            phoneNumber: phone,
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
              shared.phoneTargeted
                ? "PDF compartido en memoria. WhatsApp abierto con el paciente."
                : "Elige WhatsApp en el selector (PDF en memoria, sin guardar en disco).",
              "success",
              { durationMs: 7000 }
            );
            return {
              success: true,
              strategy: "web_share",
              cloud_api_sent: false,
              durationMs,
            };
          }
          if (shared.aborted) {
            this.track("web_share", false);
            lastCode = "WebShareAborted";
            lastError = "Compartir cancelado";
          }
        } catch (err) {
          this.track("web_share", false);
          DocumentErrorHandler.handleError(err, "web_share");
          lastCode = "WebShareUnsupported";
        }
      }

      // --- 4. WhatsApp Desktop/Web: chat del paciente + PDF en portapapeles (RAM) ---
      if (!phone) {
        const durationMs = Math.round(performance.now() - started);
        dismissDocumentNotification(progressId);
        const failMsg =
          "El paciente no tiene un teléfono válido. Complételo en la ficha para enviar por WhatsApp.";
        this.showUserNotification(failMsg, "error", { durationMs: 8000 });
        return {
          success: false,
          strategy: null,
          cloud_api_sent: false,
          error: failMsg,
          errorCode: "InvalidPhone",
          durationMs,
        };
      }

      this.showUserNotification("Abriendo WhatsApp con el paciente…", "progress", {
        id: progressId,
        progress: 88,
      });

      try {
        const appSend = await this.sendViaWhatsAppApp({
          pdfBlob: blob,
          fileName,
          message,
          phoneNumber: phone,
        });
        if (appSend.success) {
          this.track("whatsapp_app", true);
          await params.onMarkedSent?.().catch(() => undefined);
          const durationMs = Math.round(performance.now() - started);
          await this.reportMetric({
            strategy: "whatsapp_app",
            success: true,
            documentType,
            durationMs,
          });
          dismissDocumentNotification(progressId);
          this.showUserNotification(
            appSend.clipboardOk
              ? "WhatsApp abierto con el paciente. El PDF está en memoria: pegue con Ctrl+V en el chat."
              : "WhatsApp abierto con el paciente. Use Ctrl+V o el clip 📎; el PDF no se guardó en disco (use Descargar solo si lo necesita).",
            "success",
            { durationMs: 9000 }
          );
          return {
            success: true,
            strategy: "whatsapp_app",
            cloud_api_sent: false,
            durationMs,
          };
        }
        this.track("whatsapp_app", false);
        lastError = appSend.error;
        lastCode = "InvalidPhone";
      } catch (err) {
        this.track("whatsapp_app", false);
        DocumentErrorHandler.handleError(err, "whatsapp_app");
        lastError = err instanceof Error ? err.message : "No se pudo abrir WhatsApp";
      }

      const durationMs = Math.round(performance.now() - started);
      await this.reportMetric({
        strategy: "whatsapp_app",
        success: false,
        documentType,
        durationMs,
        errorCode: lastCode || "NATIVE_FLOW_UNAVAILABLE",
      });
      dismissDocumentNotification(progressId);
      const failMsg =
        lastError ||
        "No se pudo abrir WhatsApp. Verifique que la app o WhatsApp Web estén disponibles.";
      this.showUserNotification(failMsg, "error", { durationMs: 8000 });
      return {
        success: false,
        strategy: null,
        cloud_api_sent: false,
        error: failMsg,
        errorCode: lastCode || "NATIVE_FLOW_UNAVAILABLE",
        durationMs,
      };
    } catch (err) {
      const info = DocumentErrorHandler.handleError(err, "sendDocument");
      dismissDocumentNotification(progressId);
      this.showUserNotification(`${info.message} ${info.action}`, "error");
      return {
        success: false,
        strategy: null,
        cloud_api_sent: false,
        error: info.message,
        errorCode: info.code,
        durationMs: Math.round(performance.now() - started),
      };
    }
  }
}

/** Instancia compartida para toda la app. */
export const documentSender = new DocumentSender();
