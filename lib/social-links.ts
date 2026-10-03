import type { University } from "./domain";

const platforms = [
  { name: "Instagram", icon: "instagram", domains: ["instagram.com"] },
  { name: "YouTube", icon: "youtube", domains: ["youtube.com", "youtu.be"] },
  { name: "Facebook", icon: "facebook", domains: ["facebook.com"] },
  { name: "LinkedIn", icon: "linkedin", domains: ["linkedin.com"] },
  { name: "X", icon: "x", domains: ["x.com", "twitter.com"] },
  { name: "TikTok", icon: "tiktok", domains: ["tiktok.com"] },
  { name: "Telegram", icon: "telegram", domains: ["t.me", "telegram.me"] },
  { name: "Bluesky", icon: "bluesky", domains: ["bsky.app"] },
] as const;

/** Social accounts come from published sources, never invented handles. */
export function universitySocialLinks(u: Pick<University, "social_links">) {
  const seen = new Set<string>();
  return (u.social_links || []).flatMap((link) => {
    try {
      const url = new URL(link.url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        return [];
      const platform = platforms.find((p) =>
        p.domains.some(
          (domain) =>
            url.hostname === domain || url.hostname.endsWith("." + domain),
        ),
      );
      if (!platform || seen.has(platform.name)) return [];
      seen.add(platform.name);
      return [
        {
          name: platform.name,
          icon: platform.icon,
          url: url.href,
          source: link.source_url,
        },
      ];
    } catch {
      return [];
    }
  });
}
