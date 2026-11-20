import { SITE_NAME, SITE_URL } from "@/lib/seo/site";

const body = `# ${SITE_NAME}

> University research for students applying to bachelor's programmes abroad. Sourced admissions, tuition, rankings and scholarships for about 14,000 universities, with links to the original sources. Independent; not an official ranking publisher.

## Who it is for

Students in Uzbekistan, Kazakhstan, Kyrgyzstan and Tajikistan applying for bachelor's degrees abroad (2027 intake). The interface is in English, Russian and Uzbek.

## Coverage (updated November 2026)

- About 14,000 universities with location, type and world rankings (QS, THE, ARWU and others).
- For roughly 500 of the highest-ranked universities: English-test minimums (IELTS, TOEFL iBT, Duolingo, PTE), international tuition, application fees and 2027-entry deadlines, each read from the university's own website and linked to that page.
- Verified scholarships open to Central Asian students, with eligibility and deadlines.
- Every figure links to its source; nothing is estimated.

## Key sections

- [University directory](${SITE_URL}/universities): search and filter by country, field, degree, cost and entry requirements. Add ?q=<name> to search.
- [University profile](${SITE_URL}/university/{slug}): one page per university with location, type, founding year, world rankings (QS, THE, ARWU and others), international tuition, English-test requirement and next deadline where sourced.
- [Rankings](${SITE_URL}/rankings): QS, Times Higher Education, ARWU, Leiden and national tables, each with publisher, edition and scope.
- [Compare](${SITE_URL}/compare?ids=): side-by-side universities.
- [Scholarships](${SITE_URL}/scholarships): funding with eligibility, amounts and deadlines from the provider.
- [Articles](${SITE_URL}/articles): admissions advice from universities and students (links to the original publisher).
- [Methodology](${SITE_URL}/methodology) and [Sources](${SITE_URL}/sources): how data is collected and verified.

## Machine-readable access

- Concise facts for one university: GET ${SITE_URL}/api/public/university/{slug} (JSON) or ${SITE_URL}/api/public/university/{slug}?format=md (Markdown). Each lists its sources.
- Every profile page carries schema.org JSON-LD (CollegeOrUniversity, BreadcrumbList) and links to its JSON and Markdown views with <link rel="alternate">.
- Sitemap index: ${SITE_URL}/sitemap.xml. Find a slug from the sitemap or from /universities?q=<name>.

## Notes

- Figures are as reported by the linked sources and can change; confirm requirements with the university before applying.
- The site is English by default; the interface language follows the visitor's cookie or Accept-Language header.
`;

export function GET() {
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
