export type DocumentErrorCode =
  | "NetworkError"
  | "FileTooLarge"
  | "CloudAPIError"
  | "CloudAPINotConfigured"
  | "WebShareUnsupported"
  | "WebShareAborted"
  | "InvalidPhone"
  | "PdfFetchError"
  | "Unknown";

export interface DocumentErrorInfo {
  code: DocumentErrorCode;
  message: string;
  action: string;
  retryable: boolean;
}

const ERROR_MAP: Record<DocumentErrorCode, Omit<DocumentErrorInfo, "code">> = {
  NetworkError: {
    message: "Sin conexión o el servidor no respondió a tiempo.",
    action: "Revisa tu red e inténtalo de nuevo.",
    retryable: true,
  },
  FileTooLarge: {
    message: "El PDF supera el límite permitido (25 MB).",
    action: "Reduce el tamaño del documento o usa otro formato.",
    retryable: false,
  },
  CloudAPIError: {
    message: "WhatsApp Cloud API no pudo entregar el documento.",
    action: "Se reintentará y, si falla, se abrirá compartir nativo.",
    retryable: true,
  },
  CloudAPINotConfigured: {
    message: "Cloud API no está configurada en esta instalación.",
    action: "Se usará el selector nativo del sistema (Web Share) con el PDF.",
    retryable: false,
  },
  WebShareUnsupported: {
    message: "Este navegador no soporta compartir archivos nativo.",
    action: "Configura WhatsApp Cloud API o usa Chrome/Edge.",
    retryable: false,
  },
  WebShareAborted: {
    message: "Compartir cancelado.",
    action: "Puedes volver a intentarlo cuando quieras.",
    retryable: true,
  },
  InvalidPhone: {
    message: "El teléfono del paciente no es válido.",
    action: "Completa el teléfono en la ficha clínica.",
    retryable: false,
  },
  PdfFetchError: {
    message: "No se pudo generar u obtener el PDF.",
    action: "Revisa la sesión e inténtalo de nuevo.",
    retryable: true,
  },
  Unknown: {
    message: "Ocurrió un error inesperado al enviar el documento.",
    action: "Inténtalo de nuevo o descarga el PDF manualmente.",
    retryable: true,
  },
};

export class DocumentSendError extends Error {
  code: DocumentErrorCode;
  action: string;
  retryable: boolean;

  constructor(code: DocumentErrorCode, detail?: string) {
    const info = ERROR_MAP[code] || ERROR_MAP.Unknown;
    super(detail ? `${info.message} ${detail}` : info.message);
    this.name = "DocumentSendError";
    this.code = code;
    this.action = info.action;
    this.retryable = info.retryable;
  }
}

export class DocumentErrorHandler {
  static errorMap = ERROR_MAP;

  static classify(error: unknown): DocumentErrorInfo {
    if (error instanceof DocumentSendError) {
      return {
        code: error.code,
        message: error.message,
        action: error.action,
        retryable: error.retryable,
      };
    }
    const msg = error instanceof Error ? error.message : String(error || "");
    const lower = msg.toLowerCase();
    if (lower.includes("abort") || lower.includes("cancel")) {
      return { code: "WebShareAborted", ...ERROR_MAP.WebShareAborted };
    }
    if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout")) {
      return { code: "NetworkError", ...ERROR_MAP.NetworkError, message: msg || ERROR_MAP.NetworkError.message };
    }
    if (lower.includes("phone") || lower.includes("teléfono")) {
      return { code: "InvalidPhone", ...ERROR_MAP.InvalidPhone };
    }
    return {
      code: "Unknown",
      message: msg || ERROR_MAP.Unknown.message,
      action: ERROR_MAP.Unknown.action,
      retryable: true,
    };
  }

  static handleError(error: unknown, context?: string): DocumentErrorInfo {
    const info = this.classify(error);
    if (typeof console !== "undefined") {
      console.warn(`[DocumentSender]${context ? ` ${context}` : ""}`, info.code, info.message);
    }
    return info;
  }
}
