/**
 * Sistema Universal de Envío de Documentos (WhatsApp) — flujo nativo.
 *
 * Orden fijo al hacer clic en Enviar:
 *  1. Cloud API — POST /api/integrations/whatsapp/share → cloud_api_sent: true
 *  2. Reintento — POST /api/integrations/whatsapp/send-document
 *  3. Web Share API — selector del SO con PDF adjunto (sin modal de arrastre)
 *
 * El frontend NUNCA llama a la Graph API de Meta directamente.
 * Nunca poner base64/PDF en el texto del mensaje.
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

/** Estrategias del flujo nativo (sin download_fallback / wa.me). */
export type SendStrategy = "cloud_api" | "cloud_api_retry" | "web_share";

export type NotificationType = "info" | "success" | "warning" | "error" | "progress";

export interface SendDocumentParams {
  /** URL autenticada del PDF en el backend (se obtiene en RAM como Blob) */
  downloadUrl: string;
  documentType?: DocumentType;
  fileName?: string;
  message?: string;
  phoneNumber?: string | null;
  metadata?: Record<string, unknown>;
  onMarkedSent?: () => Promise<void>;
  /** Si false, salta Cloud API y va directo a Web Share */
  preferCloudApi?: boolean;
}

export interface SendDocumentResult {
  success: boolean;
  strategy: SendStrategy | null;
  /** true solo cuando Meta Cloud API entregó el documento */
  cloud_api_sent?: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  durationMs: number;
}

export interface DocumentSenderConfig {
  timeoutMs: number;
  maxRetries: number;
  maxFileBytes: number;
  cacheMaxSize: number;
  baseRetryDelayMs: number;
  maxWhatsAppTextLength: number;
}

export const DEFAULT_SENDER_CONFIG: DocumentSenderConfig = {
  timeoutMs: 30_000,
  maxRetries: 3,
  maxFileBytes: 25 * 1024 * 1024,
  cacheMaxSize: 50,
  baseRetryDelayMs: 800,
  maxWhatsAppTextLength: 700,
};

export interface WhatsAppCloudStatus {
  configured: boolean;
  enabled: boolean;
  api_version: string;
  max_file_bytes: number;
  max_retries: number;
}
