"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** The browser reads recordings aloud (no audio files to license or host),
 * and transcribes spoken answers where the browser supports it. */

export type Line = { text: string; voice?: "a" | "b" };

function pickVoices(lang: string) {
  const all = typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices() : [];
  const local = all.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang.toLowerCase()));
  const en = local.length ? local : all.filter((v) => v.lang.toLowerCase().startsWith("en"));
  return [en[0], en.find((v) => v !== en[0]) || en[0]] as const;
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Plays a list of lines in order. `index` is the line being read, -1 when idle. */
export function useNarrator(lang = "en-GB", rate = 0.95) {
  const [index, setIndex] = useState(-1);
  const [played, setPlayed] = useState(false);
  const token = useRef(0);
  const stop = useCallback(() => {
    token.current++;
    if (canSpeak()) speechSynthesis.cancel();
    setIndex(-1);
  }, []);
  const play = useCallback(
    (lines: Line[], from = 0) => {
      if (!canSpeak() || !lines.length) return;
      speechSynthesis.cancel();
      const my = ++token.current;
      const [a, b] = pickVoices(lang);
      const say = (i: number) => {
        if (my !== token.current) return;
        if (i >= lines.length) {
          setIndex(-1);
          setPlayed(true);
          return;
        }
        setIndex(i);
        const u = new SpeechSynthesisUtterance(lines[i].text);
        u.lang = lang;
        u.rate = rate;
        const v = lines[i].voice === "b" ? b : a;
        if (v) u.voice = v;
        if (lines[i].voice === "b" && a === b) u.pitch = 1.25;
        u.onend = () => setTimeout(() => say(i + 1), 350);
        u.onerror = () => say(i + 1);
        speechSynthesis.speak(u);
      };
      say(from);
    },
    [lang, rate],
  );
  useEffect(() => () => stop(), [stop]);
  return { play, stop, index, playing: index >= 0, played };
}

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};
const Recognition = () =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition ||
      null);

/** Speech-to-text for spoken answers. Falls back to typing where unsupported. */
export function useDictation(lang = "en-GB") {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const rec = useRef<Rec | null>(null);
  const base = useRef("");
  useEffect(() => {
    queueMicrotask(() => setSupported(!!Recognition()));
  }, []);
  const stop = useCallback(() => {
    rec.current?.stop();
    rec.current = null;
    setListening(false);
  }, []);
  const start = useCallback(
    (seed = "") => {
      const R = Recognition();
      if (!R) return;
      const r = new R();
      r.continuous = true;
      r.interimResults = true;
      r.lang = lang;
      base.current = seed ? seed.trimEnd() + " " : "";
      let finals = "";
      r.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finals += res[0].transcript + " ";
          else interim += res[0].transcript;
        }
        setText((base.current + finals + interim).trim());
      };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      try {
        r.start();
        rec.current = r;
        setListening(true);
      } catch {
        setListening(false);
      }
    },
    [lang],
  );
  useEffect(() => () => rec.current?.stop(), []);
  return { supported, listening, text, setText, start, stop };
}

/** A countdown in whole seconds that calls `onDone` once at zero. */
export function useCountdown(seconds: number, running: boolean, onDone?: () => void) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => {
    if (running && left === 0) done.current?.();
  }, [left, running]);
  return [left, setLeft] as const;
}

export const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
