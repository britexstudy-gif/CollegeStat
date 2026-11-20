/**
 * Plan page (Nov 19): grouped task list, "Ask AI to plan", and the AI's task cards.
 * One row per key: [en, ru, uz, es, de, zh]. Spread into every locale file.
 */
const T = {
  "pl.sub": ["Your next steps, in order. The AI can add and update them for you.", "Ваши следующие шаги по порядку. ИИ может добавлять и менять их за вас.", "Keyingi qadamlaringiz tartib bilan. AI ularni siz uchun qo‘shishi va yangilashi mumkin.", "Tus próximos pasos, en orden. La IA puede añadirlos y actualizarlos por ti.", "Deine nächsten Schritte der Reihe nach. Die KI kann sie für dich anlegen und ändern.", "按顺序排列的下一步。AI 可以帮你添加和更新。"],
  "pl.progress": ["{done} of {total} done", "Готово {done} из {total}", "{total} tadan {done} tasi bajarildi", "{done} de {total} hechas", "{done} von {total} erledigt", "已完成 {done}/{total}"],
  "pl.progress.none": ["Nothing to do yet", "Пока задач нет", "Hozircha vazifa yo‘q", "Aún no hay tareas", "Noch keine Aufgaben", "暂无任务"],
  "pl.ask.label": ["Ask AI to plan", "Попросить ИИ составить план", "AI dan reja tuzishni so‘rash", "Pide a la IA que planifique", "KI um einen Plan bitten", "让 AI 做计划"],
  "pl.ask.ph": ["Ask AI to plan…", "Попросите ИИ составить план…", "AI dan reja so‘rang…", "Pide a la IA que planifique…", "Bitte die KI um einen Plan…", "让 AI 做计划…"],
  "pl.ask.go": ["Plan", "Составить", "Tuzish", "Planificar", "Planen", "规划"],
  "pl.ask.c1": ["Plan my next 4 weeks", "Составь план на 4 недели", "Keyingi 4 hafta uchun reja tuz", "Planifica mis próximas 4 semanas", "Plane meine nächsten 4 Wochen", "规划我接下来的 4 周"],
  "pl.ask.c2": ["What should I do this week?", "Что сделать на этой неделе?", "Shu hafta nima qilishim kerak?", "¿Qué debo hacer esta semana?", "Was sollte ich diese Woche tun?", "这周我该做什么？"],
  "pl.ask.c3": ["Re-date my overdue tasks", "Перенеси просроченные задачи", "Kechikkan vazifalarga yangi sana qo‘y", "Cambia la fecha de mis tareas atrasadas", "Verschiebe meine überfälligen Aufgaben", "为逾期任务重新定日期"],
  "pl.g.overdue": ["Overdue", "Просрочено", "Kechikkan", "Atrasadas", "Überfällig", "已逾期"],
  "pl.g.week": ["This week", "На этой неделе", "Shu hafta", "Esta semana", "Diese Woche", "本周"],
  "pl.g.month": ["This month", "В этом месяце", "Shu oy", "Este mes", "Diesen Monat", "本月"],
  "pl.g.later": ["Later", "Позже", "Keyinroq", "Más adelante", "Später", "以后"],
  "pl.g.done": ["Done", "Выполнено", "Bajarilgan", "Hechas", "Erledigt", "已完成"],
  "pl.add.ph": ["Add a task…", "Добавить задачу…", "Vazifa qo‘shish…", "Añadir una tarea…", "Aufgabe hinzufügen…", "添加任务…"],
  "pl.add.label": ["New task", "Новая задача", "Yangi vazifa", "Nueva tarea", "Neue Aufgabe", "新任务"],
  "pl.add.hint": ["Enter to add", "Enter — добавить", "Qo‘shish uchun Enter", "Enter para añadir", "Enter zum Hinzufügen", "回车添加"],
  "pl.src.ai": ["AI", "ИИ", "AI", "IA", "KI", "AI"],
  "pl.src.you": ["You", "Вы", "Siz", "Tú", "Du", "你"],
  "pl.src.title": ["Added by", "Добавил(а)", "Qo‘shgan", "Añadida por", "Hinzugefügt von", "添加者"],
  "pl.due.today": ["Today", "Сегодня", "Bugun", "Hoy", "Heute", "今天"],
  "pl.due.tomorrow": ["Tomorrow", "Завтра", "Ertaga", "Mañana", "Morgen", "明天"],
  "pl.due.late": ["{n} d late", "−{n} дн.", "{n} kun kechikdi", "{n} d de retraso", "{n} T. überfällig", "逾期 {n} 天"],
  "pl.due.none": ["No date", "Без даты", "Sanasiz", "Sin fecha", "Kein Datum", "无日期"],
  "pl.due.set": ["Set a date for “{title}”", "Назначить дату для «{title}»", "«{title}» uchun sana belgilash", "Fijar fecha para «{title}»", "Datum für „{title}“ festlegen", "为“{title}”设置日期"],
  "pl.done.toggle": ["Mark “{title}” done", "Отметить «{title}» выполненной", "«{title}» ni bajarilgan deb belgilash", "Marcar «{title}» como hecha", "„{title}“ als erledigt markieren", "将“{title}”标记为完成"],
  "pl.rename": ["Rename “{title}”", "Переименовать «{title}»", "«{title}» nomini o‘zgartirish", "Renombrar «{title}»", "„{title}“ umbenennen", "重命名“{title}”"],
  "pl.remove": ["Delete “{title}”", "Удалить «{title}»", "«{title}» ni o‘chirish", "Eliminar «{title}»", "„{title}“ löschen", "删除“{title}”"],
  "pl.view.list": ["List", "Список", "Ro‘yxat", "Lista", "Liste", "列表"],
  "pl.view.cal": ["Calendar", "Календарь", "Kalendar", "Calendario", "Kalender", "日历"],
  "pl.empty.title": ["Nothing planned yet", "Пока ничего не запланировано", "Hozircha reja yo‘q", "Nada planificado aún", "Noch nichts geplant", "还没有计划"],
  "pl.empty.text": ["Add a first task, or let the AI draft your next four weeks.", "Добавьте первую задачу или попросите ИИ набросать план на четыре недели.", "Birinchi vazifani qo‘shing yoki AI keyingi to‘rt hafta rejasini tuzib bersin.", "Añade una primera tarea o deja que la IA redacte tus próximas cuatro semanas.", "Lege eine erste Aufgabe an oder lass die KI die nächsten vier Wochen entwerfen.", "添加第一个任务，或让 AI 起草接下来四周的计划。"],
  "pl.empty.cta": ["Plan my next 4 weeks", "План на 4 недели", "Keyingi 4 hafta rejasi", "Planificar 4 semanas", "Nächste 4 Wochen planen", "规划接下来 4 周"],
  "pl.clear": ["All clear. Nice work.", "Всё сделано. Отличная работа.", "Hammasi bajarildi. Barakalla.", "Todo al día. Buen trabajo.", "Alles erledigt. Gut gemacht.", "全部完成，做得好。"],
  "ai.step.tasklist": ["Reading your plan", "Читаю ваш план", "Rejangizni o‘qiyapman", "Leyendo tu plan", "Lese deinen Plan", "正在读取你的计划"],
  "ai.step.taskedit": ["Preparing plan changes", "Готовлю изменения плана", "Reja o‘zgarishlarini tayyorlayapman", "Preparando cambios del plan", "Bereite Planänderungen vor", "正在准备计划改动"],
  "ai.edit.title": ["Changes to your plan", "Изменения в плане", "Rejadagi o‘zgarishlar", "Cambios en tu plan", "Änderungen an deinem Plan", "计划改动"],
  "ai.edit.confirm": ["Apply {n}", "Применить ({n})", "Qo‘llash ({n})", "Aplicar ({n})", "Anwenden ({n})", "应用（{n}）"],
  "ai.edit.done": ["Plan updated", "План обновлён", "Reja yangilandi", "Plan actualizado", "Plan aktualisiert", "计划已更新"],
  "ai.edit.markdone": ["Mark done", "Отметить выполненной", "Bajarildi deb belgilash", "Marcar como hecha", "Als erledigt markieren", "标记为完成"],
  "ai.edit.reopen": ["Mark not done", "Вернуть в работу", "Bajarilmagan deb belgilash", "Marcar como pendiente", "Als offen markieren", "标记为未完成"],
  "ai.edit.nodate": ["Remove the date", "Убрать дату", "Sanani olib tashlash", "Quitar la fecha", "Datum entfernen", "移除日期"],
} as const;

type Key = keyof typeof T;
const pick = (i: number) => Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[i]])) as Record<Key, string>;

export const planEn = pick(0);
export const planRu = pick(1);
export const planUz = pick(2);
export const planEs = pick(3);
export const planDe = pick(4);
export const planZh = pick(5);
