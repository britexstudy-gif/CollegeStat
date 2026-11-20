import { cookies, headers } from "next/headers";
import { LANG_COOKIE, resolveLang, type Lang } from "./i18n/languages";

/** The interface language of this request, chosen the same way as the root layout. */
export async function requestLang(): Promise<Lang> {
  return resolveLang((await cookies()).get(LANG_COOKIE)?.value, (await headers()).get("accept-language"));
}
