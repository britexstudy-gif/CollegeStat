import { countryName } from "@/lib/domain";
import type { Lang } from "@/lib/i18n/languages";

/* Chrome ships without Uzbek region names, so Intl falls back to English there.
 * Our own Uzbek (Latin) names for every country a student is likely to pick. */
const UZ: Record<string, string> = {
  UZ: "Oʻzbekiston", KZ: "Qozogʻiston", KG: "Qirgʻiziston", TJ: "Tojikiston", TM: "Turkmaniston", AF: "Afgʻoniston",
  RU: "Rossiya", AZ: "Ozarbayjon", GE: "Gruziya", AM: "Armaniston", BY: "Belarus", UA: "Ukraina", MN: "Moʻgʻuliston",
  US: "AQSH", GB: "Buyuk Britaniya", CA: "Kanada", AU: "Avstraliya", NZ: "Yangi Zelandiya", IE: "Irlandiya",
  DE: "Germaniya", FR: "Fransiya", IT: "Italiya", ES: "Ispaniya", PT: "Portugaliya", NL: "Niderlandiya", BE: "Belgiya",
  CH: "Shveytsariya", AT: "Avstriya", SE: "Shvetsiya", NO: "Norvegiya", DK: "Daniya", FI: "Finlandiya", IS: "Islandiya",
  PL: "Polsha", CZ: "Chexiya", SK: "Slovakiya", HU: "Vengriya", RO: "Ruminiya", BG: "Bolgariya", GR: "Gretsiya",
  LT: "Litva", LV: "Latviya", EE: "Estoniya", SI: "Sloveniya", HR: "Xorvatiya", RS: "Serbiya", CY: "Kipr", MT: "Malta",
  LU: "Lyuksemburg", TR: "Turkiya", CN: "Xitoy", JP: "Yaponiya", KR: "Janubiy Koreya", HK: "Gonkong", TW: "Tayvan",
  SG: "Singapur", MY: "Malayziya", TH: "Tailand", ID: "Indoneziya", PH: "Filippin", VN: "Vyetnam", IN: "Hindiston",
  PK: "Pokiston", BD: "Bangladesh", AE: "BAA", SA: "Saudiya Arabistoni", QA: "Qatar", KW: "Quvayt", BH: "Bahrayn",
  OM: "Ummon", IL: "Isroil", JO: "Iordaniya", LB: "Livan", EG: "Misr", MA: "Marokash", ZA: "Janubiy Afrika",
  BN: "Bruney", MX: "Meksika", BR: "Braziliya", AR: "Argentina", CL: "Chili", IR: "Eron", IQ: "Iroq",
};

/** Country name in the interface language; the catalogue's English name otherwise. */
export function regionName(code: string, lang: Lang | string) {
  if (lang === "en") return countryName(code);
  const cc = code.toUpperCase();
  if (lang === "uz" && UZ[cc]) return UZ[cc];
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(cc) || countryName(code);
  } catch {
    return countryName(code);
  }
}
