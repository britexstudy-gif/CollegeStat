"use client";
import Link from "next/link";
import { rankingSystems, rankingSystemHref } from "@/lib/ranking-systems";
import { useT } from "./i18n";

/* Ranking publishers as one quiet row. Each mark has a light-page and a
 * dark-page file, because several publishers print their wordmark in black
 * (QS, THE) or white (ShanghaiRanking): the variants in public/brand/publishers
 * only recolour that wordmark, the brand colours stay. At rest the row is
 * greyscale; hover or focus shows the mark in its own colours. */
const PUBLISHERS: { slug: string; light: string; dark: string }[] = [
  { slug: "qs", light: "/brand/publishers/qs.png", dark: "/brand/publishers/qs-dark.png" },
  { slug: "the", light: "/logos/publishers/the.svg", dark: "/brand/publishers/the-dark.svg" },
  { slug: "arwu", light: "/brand/publishers/arwu-light.svg", dark: "/logos/publishers/arwu.svg" },
  { slug: "usnews", light: "/logos/publishers/usnews.svg", dark: "/logos/publishers/usnews.svg" },
  { slug: "cwur", light: "/logos/publishers/cwur.svg", dark: "/logos/publishers/cwur.svg" },
  { slug: "unirank", light: "/logos/publishers/unirank.png", dark: "/brand/publishers/unirank-dark.png" },
  { slug: "webometrics", light: "/logos/publishers/webometrics.png", dark: "/logos/publishers/webometrics.png" },
];

export function Publishers() {
  const t = useT();
  return (
    <div className="lp-pubs" data-enter>
      <p>{t("land.pubs")}</p>
      <ul>
        {PUBLISHERS.map(({ slug, light, dark }) => {
          const s = rankingSystems.find((x) => x.slug === slug);
          if (!s) return null;
          return (
            <li key={slug}>
              <Link href={rankingSystemHref(s)} aria-label={s.name} title={s.name}>
                {/* eslint-disable-next-line @next/next/no-img-element -- small static publisher mark */}
                <img className="is-light" src={light} alt="" height={28} decoding="async" />
                {/* eslint-disable-next-line @next/next/no-img-element -- small static publisher mark */}
                <img className="is-dark" src={dark} alt="" height={28} decoding="async" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
