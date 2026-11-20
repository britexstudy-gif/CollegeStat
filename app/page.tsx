import type { Metadata } from "next";
import Landing from "@/pages-ui/discovery-landing";
import { JsonLd } from "@/components/seo/json-ld";
import { en } from "@/lib/i18n/locales/en";
import { buildFaqJsonLd, buildSiteJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Universities abroad for students from Central Asia",
  description:
    "See which universities you can afford and get into, and what to do by when. Costs, entry requirements and deadlines with sources, a plan from an AI counsellor, and practice applications.",
  path: "/",
});

// Matches the questions the Faq section renders (land.faq.q1..q10).
const FAQ_COUNT = 10;

// The FAQ shown on the page, in the default (English) language crawlers receive.
const faqs = Array.from({ length: FAQ_COUNT }, (_, i) => i + 1).map((n) => ({
  question: en[`land.faq.q${n}` as keyof typeof en] as string,
  answer: en[`land.faq.a${n}` as keyof typeof en] as string,
}));

export default function Page() {
  return (
    <>
      <JsonLd data={[...buildSiteJsonLd(), buildFaqJsonLd(faqs)]} />
      <Landing />
    </>
  );
}
