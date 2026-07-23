"use client";

import { useCallback, useState } from "react";
import {
  documentSender,
  type SendDocumentParams,
  type SendDocumentResult,
} from "@/lib/documentSender";

export function useDocumentSender() {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SendDocumentResult | null>(null);

  const sendDocument = useCallback(async (params: SendDocumentParams) => {
    setIsSending(true);
    setError(null);
    try {
      const result = await documentSender.sendDocument(params);
      setLastResult(result);
      if (!result.success) {
        setError(result.error || "No se pudo enviar el documento");
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al enviar";
      setError(message);
      const failed: SendDocumentResult = {
        success: false,
        strategy: null,
        cloud_api_sent: false,
        error: message,
        durationMs: 0,
      };
      setLastResult(failed);
      return failed;
    } finally {
      setIsSending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setLastResult(null);
    setIsSending(false);
  }, []);

  return { sendDocument, isSending, error, lastResult, reset };
}
