/**
 * Hisobot / Report (Nov 19): the AI-written whole-document report.
 * One row per key: [en, ru, uz, es, de, zh]. Spread into every locale file.
 */
const T = {
  "r3.title": ["Your report", "Ваш отчёт", "Sizning hisobotingiz", "Tu informe", "Dein Bericht", "你的报告"],
  "r3.title_for": ["Report for {name}", "Отчёт для {name}", "{name} uchun hisobot", "Informe de {name}", "Bericht für {name}", "{name} 的报告"],
  "r3.meta": ["Generated {date} · based on {n} universities", "Создан {date} · на основе {n} вузов", "Tuzilgan sana: {date} · {n} ta universitet asosida", "Generado el {date} · basado en {n} universidades", "Erstellt am {date} · basierend auf {n} Universitäten", "生成于 {date} · 基于 {n} 所大学"],
  "r3.toc": ["On this page", "На этой странице", "Shu sahifada", "En esta página", "Auf dieser Seite", "本页内容"],
  "r3.generate": ["Write my report", "Составить отчёт", "Hisobotni tuzish", "Escribir mi informe", "Bericht erstellen", "生成我的报告"],
  "r3.regenerate": ["Regenerate", "Составить заново", "Qayta tuzish", "Volver a generar", "Neu erstellen", "重新生成"],
  "r3.busy": ["Writing your report…", "Пишем ваш отчёт…", "Hisobotingiz yozilmoqda…", "Escribiendo tu informe…", "Dein Bericht wird geschrieben…", "正在撰写你的报告…"],
  "r3.busy.hint": ["This takes about a minute. You can keep this page open.", "Это займёт около минуты. Оставьте страницу открытой.", "Bir daqiqa atrofida vaqt oladi. Sahifani ochiq qoldiring.", "Tarda alrededor de un minuto. Puedes dejar esta página abierta.", "Das dauert etwa eine Minute. Lass diese Seite geöffnet.", "大约需要一分钟，请保持页面打开。"],
  "r3.empty": ["An AI-written document about you: your strengths, your list, tests, budget, deadlines and a 4-week plan. It uses only your own data.", "Документ, написанный ИИ о вас: сильные стороны, список вузов, экзамены, бюджет, сроки и план на 4 недели. Только ваши данные.", "Siz haqingizda AI yozgan hujjat: kuchli tomonlar, ro‘yxat, imtihonlar, byudjet, muddatlar va 4 haftalik reja. Faqat o‘zingizning ma’lumotlaringiz asosida.", "Un documento escrito por IA sobre ti: tus fortalezas, tu lista, pruebas, presupuesto, plazos y un plan de 4 semanas. Solo usa tus datos.", "Ein von KI geschriebenes Dokument über dich: Stärken, Liste, Tests, Budget, Fristen und ein 4-Wochen-Plan. Nur mit deinen Daten.", "一份由 AI 撰写的个人文档：优势、院校清单、考试、预算、截止日期和 4 周计划。只使用你自己的数据。"],
  "r3.need": ["Fill in your profile and save a few universities first, so the report has something to work with.", "Сначала заполните профиль и сохраните несколько вузов, чтобы отчёту было на что опереться.", "Avval profilni to‘ldiring va bir nechta universitetni saqlang, shunda hisobotda tayanch bo‘ladi.", "Completa tu perfil y guarda algunas universidades para que el informe tenga con qué trabajar.", "Fülle zuerst dein Profil aus und speichere ein paar Universitäten, damit der Bericht Material hat.", "请先填写资料并收藏几所大学，报告才有内容可写。"],
  "r3.error": ["The report could not be finished this time. Please try again in a minute.", "Отчёт не удалось завершить. Попробуйте ещё раз через минуту.", "Hisobotni bu safar yakunlab bo‘lmadi. Bir daqiqadan so‘ng qayta urinib ko‘ring.", "No se pudo terminar el informe esta vez. Inténtalo de nuevo en un minuto.", "Der Bericht konnte diesmal nicht fertiggestellt werden. Versuche es in einer Minute erneut.", "这次未能完成报告，请一分钟后重试。"],
  "r3.pdf": ["Download PDF", "Скачать PDF", "PDF yuklab olish", "Descargar PDF", "PDF herunterladen", "下载 PDF"],
  "r3.md": ["Download .md", "Скачать .md", ".md yuklab olish", "Descargar .md", ".md herunterladen", "下载 .md"],
  "r3.stale": ["Your list changed since this report. Regenerate to include it.", "Список изменился после создания отчёта. Составьте заново, чтобы учесть его.", "Hisobotdan keyin ro‘yxat o‘zgargan. Hisobga olish uchun qayta tuzing.", "Tu lista cambió desde este informe. Vuelve a generarlo para incluirla.", "Deine Liste hat sich seit diesem Bericht geändert. Erstelle ihn neu, um sie zu berücksichtigen.", "清单在生成报告后有变动，重新生成即可更新。"],
  "r3.foot": ["Written by AI from your profile and saved list. Check every date and requirement on the university's own site.", "Написано ИИ по вашему профилю и списку. Проверяйте даты и требования на сайте вуза.", "AI tomonidan profilingiz va ro‘yxatingiz asosida yozilgan. Sana va talablarni universitetning o‘z saytida tekshiring.", "Escrito por IA a partir de tu perfil y tu lista. Comprueba cada fecha y requisito en el sitio de la universidad.", "Von KI aus deinem Profil und deiner Liste geschrieben. Prüfe jedes Datum und jede Anforderung auf der Website der Universität.", "由 AI 根据你的资料和清单撰写。请在大学官网核对每个日期和要求。"],
  "r3.s.summary": ["Summary", "Итоги", "Xulosa", "Resumen", "Zusammenfassung", "概述"],
  "r3.s.profile": ["Profile", "Профиль", "Profil", "Perfil", "Profil", "个人资料"],
  "r3.s.countries": ["Countries", "Страны", "Davlatlar", "Países", "Länder", "国家"],
  "r3.s.universities": ["Universities", "Вузы", "Universitetlar", "Universidades", "Universitäten", "大学"],
  "r3.s.tests": ["Tests", "Экзамены", "Testlar", "Pruebas", "Tests", "考试"],
  "r3.s.budget": ["Budget", "Бюджет", "Byudjet", "Presupuesto", "Budget", "预算"],
  "r3.s.deadlines": ["Deadlines", "Сроки", "Muddatlar", "Plazos", "Fristen", "截止日期"],
  "r3.s.plan": ["4-week plan", "План на 4 недели", "4 haftalik reja", "Plan de 4 semanas", "4-Wochen-Plan", "4 周计划"],
  "r3.s.risks": ["Risks", "Риски", "Xavflar", "Riesgos", "Risiken", "风险"],
  "r3.file": ["collegestat-report", "collegestat-otchet", "collegestat-hisobot", "collegestat-informe", "collegestat-bericht", "collegestat-report"],
} as const;

type Key = keyof typeof T;
const pick = (i: number) => Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[i]])) as Record<Key, string>;

export const reportEn = pick(0);
export const reportRu = pick(1);
export const reportUz = pick(2);
export const reportEs = pick(3);
export const reportDe = pick(4);
export const reportZh = pick(5);
