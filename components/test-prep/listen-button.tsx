"use client";
import { Pause, Play } from "lucide-react";
import { useT } from "@/components/college/i18n";
import { canSpeak, useNarrator } from "./speech";

/** Reads a listening script aloud (the browser's voice), speakers alternating. */
export function ListenButton({ text }: { text: string }) {
  const t = useT();
  const narrator = useNarrator("en-GB");
  const lines = text
    .replace(/^Transcript:\s*/i, "")
    .split(/\n+/)
    .filter(Boolean)
    .map((l, i) => ({ text: l.replace(/^[A-Z][\w .'-]{0,30}:\s*/, ""), voice: (i % 2 ? "b" : "a") as "a" | "b" }));
  if (!canSpeak()) return <p className="qr-passage">{t("pr.ie.no_voice")}</p>;
  return (
    <div className="tp-audio">
      <button type="button" className="tp-audio-btn" onClick={() => (narrator.playing ? narrator.stop() : narrator.play(lines))} aria-label={narrator.playing ? t("pr.audio.stop") : t("pr.audio.play")}>
        {narrator.playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </button>
      <small>{narrator.playing ? t("pr.audio.playing_short") : t("pr.audio.listen_first")}</small>
    </div>
  );
}
