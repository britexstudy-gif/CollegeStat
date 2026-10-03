"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: { transcript: string }[][] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
export function VoiceSearch({
  onResult,
}: {
  onResult: (text: string) => void;
}) {
  const recognition = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false),
    [available, setAvailable] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Engine = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (Engine) {
      recognition.current = new Engine();
      setAvailable(true);
    }
    return () => {
      recognition.current?.abort();
    };
  }, []);
  const start = () => {
    const r = recognition.current;
    if (!r) return;
    if (listening) {
      r.abort();
      setListening(false);
      return;
    }
    setError("");
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript;
      if (text) onResult(text);
    };
    r.onerror = () => {
      setError("Voice search unavailable. Type your search instead.");
      setListening(false);
    };
    r.onend = () => setListening(false);
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Microphone could not start.");
    }
  };
  return (
    <>
      <button
        type="button"
        className="voice-search"
        disabled={!available}
        onClick={start}
        aria-label={listening ? "Stop voice search" : "Start voice search"}
        title={
          available
            ? "Search with your voice"
            : "Voice input is unavailable in this browser"
        }
      >
        {listening ? <Square size={22} /> : <Mic size={25} />}
      </button>
      {error && (
        <span className="voice-error" role="status">
          {error}
        </span>
      )}
    </>
  );
}
