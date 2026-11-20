"use client";
/* eslint-disable @next/next/no-img-element -- Account photos come straight from the OAuth provider, without an image proxy. */
/**
 * UserAvatar: a sticker avatar the student builds themselves (a colour plus a sticker,
 * saved in profile.preferences.avatar), or their Google/GitHub photo when they chose it.
 * Before they pick, everyone gets a stable starter (colour and sticker from their user id),
 * so two students rarely look the same and nobody's avatar changes between visits.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import "./user-avatar.css";

type Meta = { avatar_url?: unknown; picture?: unknown } | null | undefined;
export type AvatarChoice = { bg: string; s: string; photo?: boolean };

export const AVATAR_BGS: { id: string; css: string }[] = [
  { id: "ocean", css: "linear-gradient(135deg, #6d7dff, #22c3e6)" },
  { id: "sky", css: "linear-gradient(135deg, #c7e3ff, #8fb8ff)" },
  { id: "mint", css: "linear-gradient(135deg, #6ee7b7, #22c3e6)" },
  { id: "forest", css: "linear-gradient(135deg, #22c55e, #0f766e)" },
  { id: "lemon", css: "linear-gradient(135deg, #fde68a, #fb923c)" },
  { id: "sunset", css: "linear-gradient(135deg, #fb923c, #f43f5e)" },
  { id: "rose", css: "linear-gradient(135deg, #fbcfe8, #f472b6)" },
  { id: "night", css: "linear-gradient(135deg, #374151, #111827)" },
];
export const AVATAR_STICKERS = [
  "🎓", "🚀", "🌍", "📚", "✨", "🦊", "🐼", "🐱", "🦉", "🐧", "🐯", "🦄",
  "🌸", "⚡", "🎧", "🎨", "⚽", "🏀", "🎮", "🔭", "🧠", "🌙", "🍀", "💎",
];

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
/** The starter avatar for a user who hasn't built one yet: stable per user id. */
export const starterAvatar = (seed: string): AvatarChoice => {
  const h = hash(seed || "student");
  return { bg: AVATAR_BGS[h % AVATAR_BGS.length].id, s: AVATAR_STICKERS[(h >>> 8) % AVATAR_STICKERS.length] };
};

/** The provider photo we have: the saved profile photo, then the sign-in provider's. */
export function avatarSrcOf(
  profile?: { avatar_url?: string | null } | null,
  user?: { user_metadata?: Meta } | null,
): string | null {
  const meta = user?.user_metadata;
  for (const v of [profile?.avatar_url, meta?.avatar_url, meta?.picture]) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

const validChoice = (v: unknown): AvatarChoice | null => {
  const c = v as AvatarChoice | null;
  return c && typeof c === "object" && AVATAR_BGS.some((b) => b.id === c.bg) && AVATAR_STICKERS.includes(c.s) ? c : null;
};

/** Everything UserAvatar needs, from the profile row and the signed-in user. */
export function avatarOf(
  profile?: { avatar_url?: string | null; preferences?: unknown } | null,
  user?: { id?: string; user_metadata?: Meta } | null,
): { src: string | null; choice: AvatarChoice } {
  const photo = avatarSrcOf(profile, user);
  const saved = validChoice((profile?.preferences as { avatar?: unknown } | undefined)?.avatar);
  const choice = saved || starterAvatar(user?.id || "");
  // A saved sticker avatar wins over the provider photo unless the student picked the photo.
  return { src: photo && (!saved || saved.photo) ? photo : null, choice };
}

/** Only https photos or same-origin paths; anything else falls back to the sticker. */
const safeSrc = (src?: string | null) => !!src && (/^https:\/\//.test(src) || /^\/(?!\/)/.test(src));

export function UserAvatar({
  src,
  choice,
  name,
  size = 32,
  className,
  label,
}: {
  src?: string | null;
  choice?: AvatarChoice;
  /** Used only as the accessible name when `label` is set to true. */
  name?: string | null;
  size?: number;
  className?: string;
  label?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const photo = safeSrc(src) && !failed;
  const a11y = label && name ? { role: "img", "aria-label": name } : { "aria-hidden": true as const };
  return (
    <span className={cn("ua", className)} style={{ width: size, height: size }} {...a11y}>
      {photo ? (
        <img src={src!} alt="" width={size} height={size} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <StickerFace choice={choice || starterAvatar(name || "")} size={size} />
      )}
    </span>
  );
}

export function StickerFace({ choice, size }: { choice: AvatarChoice; size: number }) {
  const bg = AVATAR_BGS.find((b) => b.id === choice.bg) || AVATAR_BGS[0];
  return (
    <span className="ua-face" style={{ background: bg.css }}>
      <span className="ua-sticker" style={{ fontSize: Math.round(size * 0.54) }}>
        {choice.s}
      </span>
    </span>
  );
}
