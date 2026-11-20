/**
 * Writing desk (Nov 19): essay list with status, empty state, top fixes, mobile sheet.
 * One row per key: [en, ru, uz, es, de, zh]. Spread into every locale file.
 */
const T = {
  "wn9.drafts": ["Your essays", "Ваши эссе", "Insholaringiz", "Tus ensayos", "Deine Essays", "你的文书"],
  "wn9.status.draft": ["Draft", "Черновик", "Qoralama", "Borrador", "Entwurf", "草稿"],
  "wn9.status.reviewed": ["Reviewed", "Проверено", "Tekshirilgan", "Revisado", "Geprüft", "已点评"],
  "wn9.status.final": ["Final", "Готово", "Yakuniy", "Final", "Final", "定稿"],
  "wn9.final.mark": ["Mark as final", "Отметить готовым", "Yakuniy deb belgilash", "Marcar como final", "Als final markieren", "标为定稿"],
  "wn9.final.unmark": ["Back to draft", "Вернуть в черновики", "Qoralamaga qaytarish", "Volver a borrador", "Zurück zum Entwurf", "改回草稿"],
  "wn9.empty.title": ["Your first essay starts here", "Ваше первое эссе начинается здесь", "Birinchi insho shu yerdan boshlanadi", "Tu primer ensayo empieza aquí", "Dein erstes Essay beginnt hier", "你的第一篇文书从这里开始"],
  "wn9.empty.text": ["Pick an essay below. You write every sentence; the AI only gives feedback.", "Выберите эссе ниже. Каждое предложение пишете вы, ИИ лишь даёт обратную связь.", "Quyidan insho turini tanlang. Har bir gapni o‘zingiz yozasiz, AI faqat fikr bildiradi.", "Elige un ensayo abajo. Tú escribes cada frase; la IA solo da comentarios.", "Wähle unten ein Essay. Du schreibst jeden Satz, die KI gibt nur Feedback.", "在下方选择文书。每个句子都由你来写，AI 只提供反馈。"],
  "wn9.new": ["New essay", "Новое эссе", "Yangi insho", "Nuevo ensayo", "Neues Essay", "新文书"],
  "wn9.pick": ["Start another essay", "Начать другое эссе", "Boshqa insho boshlash", "Empezar otro ensayo", "Weiteres Essay beginnen", "开始另一篇"],
  "wn9.edited": ["Edited {when}", "Изменено {when}", "O‘zgartirilgan: {when}", "Editado {when}", "Bearbeitet {when}", "编辑于 {when}"],
  "wn9.fixes": ["Fix these first", "Сначала исправьте это", "Avval shularni tuzating", "Arregla esto primero", "Das zuerst verbessern", "优先修改这些"],
  "wn9.fixes.sub": ["The three changes that matter most. Each points to your own words.", "Три самых важных правки. Каждая указывает на ваши слова.", "Eng muhim uchta tuzatish. Har biri o‘z so‘zlaringizga ishora qiladi.", "Los tres cambios más importantes. Cada uno señala tus propias palabras.", "Die drei wichtigsten Änderungen. Jede zeigt auf deine eigenen Worte.", "最重要的三处修改，每一处都指向你自己的文字。"],
  "wn9.sheet.close": ["Close feedback", "Закрыть разбор", "Fikrni yopish", "Cerrar comentarios", "Feedback schließen", "关闭反馈"],
  "wn9.sheet.open": ["Feedback", "Разбор", "Fikr-mulohaza", "Comentarios", "Feedback", "反馈"],
  "wn9.limit": ["{n} of {max} {unit}", "{n} из {max} {unit}", "{n} / {max} {unit}", "{n} de {max} {unit}", "{n} von {max} {unit}", "{n}/{max} {unit}"],
  "wn9.start": ["Start a new essay", "Начать новое эссе", "Yangi insho boshlash", "Empezar un ensayo nuevo", "Neues Essay beginnen", "开始写新文书"],
  "wn9.start.sub": ["Each template comes with the official limit, prompts and a checklist.", "В каждом шаблоне — официальный лимит, темы и чек-лист.", "Har bir shablonda rasmiy limit, savollar va tekshiruv roʻyxati bor.", "Cada plantilla trae el límite oficial, las preguntas y una lista de control.", "Jede Vorlage enthält das offizielle Limit, die Fragen und eine Checkliste.", "每个模板都附有官方字数限制、题目和检查清单。"],
  "wn9.count.words": ["{n} words", "{n} слов", "{n} soʻz", "{n} palabras", "{n} Wörter", "{n} 词"],
  "wn9.count.chars": ["{n} characters", "{n} знаков", "{n} belgi", "{n} caracteres", "{n} Zeichen", "{n} 字符"],
} as const;

type Key = keyof typeof T;
const pick = (i: number) => Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[i]])) as Record<Key, string>;

export const writingEn = pick(0);
export const writingRu = pick(1);
export const writingUz = pick(2);
export const writingEs = pick(3);
export const writingDe = pick(4);
export const writingZh = pick(5);
