"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

type RecInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: {
    resultIndex: number;
    results: Array<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

/** Dictado de voz (Web Speech API) para notas clínicas. */
export function VoiceDictation({
  value,
  onChange,
  label = "Dictado de voz",
}: {
  value: string;
  onChange: (text: string) => void;
  label?: string;
}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<RecInstance | null>(null);
  const baseRef = useRef(value);

  useEffect(() => {
    baseRef.current = value;
  }, [value]);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => RecInstance;
      webkitSpeechRecognition?: new () => RecInstance;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = "es-VE";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let finalChunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) {
          finalChunk += ev.results[i][0].transcript + " ";
        }
      }
      if (finalChunk) {
        const next = `${baseRef.current} ${finalChunk}`.replace(/\s+/g, " ").trim();
        baseRef.current = next;
        onChange(next);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    };
  }, [onChange]);

  const toggle = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      try {
        rec.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  };

  if (!supported) {
    return (
      <p className="text-[11px] text-slate-400">
        Dictado de voz no disponible en este navegador (usa Chrome/Edge).
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
        listening
          ? "border-red-600 bg-red-50 text-red-800"
          : "border-slate-400 bg-white text-slate-700 hover:bg-slate-50"
      }`}
      title={label}
    >
      {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
      {listening ? "Detener dictado" : "Dictar nota"}
    </button>
  );
}
