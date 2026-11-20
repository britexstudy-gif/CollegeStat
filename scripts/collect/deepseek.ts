// Single JSON call per university against the OpenAI-compatible DeepSeek endpoint. Fixed system prompt (cache-friendly).
export const SYSTEM = `You extract admissions facts for INTERNATIONAL first-year BACHELOR applicants (2027 intake) from official university web text.
The user message has page excerpts tagged [P1], [P2]... plus regex hints. Use ONLY the excerpts. Never guess: unknown -> null.
Return ONLY a JSON object with exactly these keys:
{"tuition":{"amount":number|null,"currency":"ISO code"|null,"period":"year"|"semester"|"credit"|null,"academic_year":"2026/27"|null,"src":"P#"|null,"note":string|null},
"deadlines":[{"round":string,"date":"YYYY-MM-DD"|null,"cycle":"2027 entry","src":"P#"}],
"platform":{"value":"Common App"|"Coalition"|"UCAS"|"uni-assist"|"Studielink"|"Direct portal"|other string|null,"src":"P#"|null},
"english":{"ielts_overall":number|null,"ielts_band":number|null,"toefl_ibt":number|null,"duolingo":number|null,"src":"P#"|null},
"sat_act":{"value":"required"|"optional"|"not used"|null,"src":"P#"|null},
"documents":{"value":[string],"src":"P#"|null},
"programmes":{"value":[{"name":string,"years":number|null}],"src":"P#"|null}}
Rules: tuition = international undergraduate tuition only (not graduate, not domestic); give the academic year the page states (null if none). Deadlines only for fall 2027 / 2027 entry, max 4. Documents max 8 short items. Programmes max 10 English-taught bachelor's. Keep values terse.`;

export interface Usage { prompt: number; completion: number }
export async function callDeepSeek(key: string, user: string, model = process.env.DEEPSEEK_MODEL || "deepseek-chat", fetchImpl: typeof fetch = fetch): Promise<{ json: any; usage: Usage }> {
  const res = await fetchImpl("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 700, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
  const d: any = await res.json();
  const txt: string = d.choices?.[0]?.message?.content ?? "{}";
  let json: any = {};
  try { json = JSON.parse(txt.replace(/^```json\s*|```$/g, "")); } catch { json = {}; }
  return { json, usage: { prompt: d.usage?.prompt_tokens ?? 0, completion: d.usage?.completion_tokens ?? 0 } };
}
