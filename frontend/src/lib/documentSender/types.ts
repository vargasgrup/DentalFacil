/**
 * Sistema Universal de Envío de Documentos (WhatsApp).
 *
 * Estrategias (en orden):
 *  1. Cloud API (backend) — PDF en RAM, sin disco
 *  2. Reintentos Cloud API (exponencial)
 *  3. Web Share API (nativo, ideal móvil)
 *  4. Descarga + wa.me (último recurso manual)
 *
 * El frontend NUNCA llama a la Graph API de Meta directamente.
 */

export type DocumentType =
  | "comprobante"
  | "reporte"
  | "formato"
  | "receta"
  | "presupuesto"
  | "ficha"
  | "evolucion"
  | "consentimiento"
  | "cierre_caja"
  | "documento";

export type SendStrategy =
  | "cloud_api"
  | "cloud_api_retry"
  | "web_share"
  | "download_fallback";

export type NotificationType = "info" | "success" | "warning" | "error" | "progress";

export interface SendDocumentParams {
  /** URL autenticada del PDF en el backend (se obtiene en RAM como Blob) */
  downloadUrl: string;
  documentType?: DocumentType;
  fileName?: string;
  message?: string;
  phoneNumber?: string | null;
  metadata?: Record<string, unknown>;
  /** Callback opcional al marcar enviado (p. ej. markSentUrl) */
  onMarkedSent?: () => Promise<void>;
  /** Si false, no intenta Cloud API aunque esté configurada */
  preferCloudApi?: boolean;
}

export interface SendDocumentResult {
  success: boolean;
  strategy: SendStrategy | null;
  messageId?: string;
  error?: string;
  errorCode?: string;
  /** true si el usuario debe adjuntar el PDF manualmente en WhatsApp */
  requiresManualAttach?: boolean;
  durationMs: number;
}

export interface DocumentSenderConfig {
  timeoutMs: number;
  maxRetries: number;
  maxFileBytes: number;
  cacheMaxSize: number;
  baseRetryDelayMs: number;
}

export const DEFAULT_SENDER_CONFIG: DocumentSenderConfig = {
  timeoutMs: 30_000,
  maxRetries: 3,
  maxFileBytes: 25 * 1024 * 1024,
  cacheMaxSize: 50,
  baseRetryDelayMs: 800,
};

export interface WhatsAppCloudStatus {
  configured: boolean;
  enabled: boolean;
  api_version: string;
  max_file_bytes: number;
  max_retries: number;
}
