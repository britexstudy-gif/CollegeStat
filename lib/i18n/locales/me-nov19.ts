/* Avatar builder, data reset and the AI paywall (Nov 19). Row format: "key": [en, ru, uz, es, de, zh]. */
const T = {
  "av.edit": ["Edit avatar", "Изменить аватар", "Avatarni oʻzgartirish", "Editar avatar", "Avatar bearbeiten", "编辑头像"],
  "av.title": ["Make your avatar", "Создайте аватар", "Avataringizni yarating", "Crea tu avatar", "Erstelle deinen Avatar", "制作你的头像"],
  "av.sub": ["Pick a colour and a sticker. It shows across CollegeStat.", "Выберите цвет и стикер. Он будет виден во всём CollegeStat.", "Rang va stiker tanlang. U butun CollegeStat boʻylab koʻrinadi.", "Elige un color y un sticker. Se verá en todo CollegeStat.", "Wähle eine Farbe und einen Sticker. Er erscheint überall in CollegeStat.", "选择颜色和贴纸，它会显示在 CollegeStat 各处。"],
  "av.colour": ["Colour", "Цвет", "Rang", "Color", "Farbe", "颜色"],
  "av.sticker": ["Sticker", "Стикер", "Stiker", "Sticker", "Sticker", "贴纸"],
  "av.photo": ["Use my Google/GitHub photo instead", "Использовать фото из Google/GitHub", "Buning oʻrniga Google/GitHub rasmimni ishlatish", "Usar mi foto de Google/GitHub", "Stattdessen mein Google/GitHub-Foto verwenden", "改用我的 Google/GitHub 照片"],
  "av.save": ["Save avatar", "Сохранить", "Saqlash", "Guardar", "Speichern", "保存头像"],
  "av.cancel": ["Cancel", "Отмена", "Bekor qilish", "Cancelar", "Abbrechen", "取消"],
  "av.saved": ["Avatar saved", "Аватар сохранён", "Avatar saqlandi", "Avatar guardado", "Avatar gespeichert", "头像已保存"],
  "pw.ai.step": ["AI credits used up", "AI-кредиты закончились", "AI kreditlar tugadi", "Créditos de IA agotados", "KI-Guthaben aufgebraucht", "AI 次数已用完"],
  "pw.ai.title": ["Keep going with more AI help", "Продолжайте с большей помощью AI", "Koʻproq AI yordami bilan davom eting", "Sigue con más ayuda de IA", "Mach weiter mit mehr KI-Hilfe", "获得更多 AI 帮助，继续前进"],
  "pw.ai.text": ["You've used today's free AI questions. Upgrade for more every day, or come back tomorrow.", "Бесплатные вопросы AI на сегодня закончились. Перейдите на тариф с большим лимитом или вернитесь завтра.", "Bugungi bepul AI savollaringiz tugadi. Har kuni koʻproq olish uchun tarifni oshiring yoki ertaga qayting.", "Has usado las preguntas gratis de IA de hoy. Mejora tu plan para tener más cada día, o vuelve mañana.", "Du hast die kostenlosen KI-Fragen für heute verbraucht. Upgrade für mehr pro Tag oder komm morgen wieder.", "今天的免费 AI 提问已用完。升级以每天获得更多，或明天再来。"],
  "pw.ai.later": ["Maybe tomorrow", "Может, завтра", "Balki ertaga", "Quizá mañana", "Vielleicht morgen", "明天再说"],
  "pw.ai.open": ["See plans", "Смотреть тарифы", "Tariflarni koʻrish", "Ver planes", "Pläne ansehen", "查看方案"],
  "cov.full": ["Data fully covered", "Данные полностью проверены", "Maʼlumotlar toʻliq tekshirilgan", "Datos completos", "Daten vollständig", "数据完整"],
  "cov.partial": ["Partly covered · {n}/3", "Частично проверено · {n}/3", "Qisman tekshirilgan · {n}/3", "Datos parciales · {n}/3", "Teilweise geprüft · {n}/3", "部分核实 · {n}/3"],
  "cov.none": ["Not verified yet", "Ещё не проверено", "Hali tekshirilmagan", "Aún sin verificar", "Noch nicht geprüft", "尚未核实"],
  "cov.help": ["What does this mean?", "Что это значит?", "Bu nimani anglatadi?", "¿Qué significa?", "Was bedeutet das?", "这是什么意思？"],
  "cov.help.title": ["How we check the data", "Как мы проверяем данные", "Maʼlumotlarni qanday tekshiramiz", "Cómo verificamos los datos", "So prüfen wir die Daten", "我们如何核实数据"],
  "cov.help.what": ["We check 3 essentials against the university's own website: the next application deadline, yearly tuition for international students, and the IELTS minimum.", "Мы сверяем 3 главных факта с сайтом университета: ближайший дедлайн, стоимость обучения в год для иностранцев и минимальный IELTS.", "Biz 3 ta asosiy maʼlumotni universitetning rasmiy saytidan tekshiramiz: eng yaqin topshirish muddati, xorijliklar uchun yillik kontrakt va IELTS minimumi.", "Comprobamos 3 datos clave en la web oficial de la universidad: el próximo plazo, la matrícula anual para estudiantes internacionales y el IELTS mínimo.", "Wir prüfen 3 Kernangaben auf der offiziellen Website der Hochschule: die nächste Bewerbungsfrist, die jährlichen Studiengebühren für internationale Studierende und das IELTS-Minimum.", "我们在大学官网核对 3 项关键信息：最近的申请截止日期、国际学生每年学费和雅思最低分。"],
  "cov.help.full": ["Fully covered: all 3 are checked, each with a link to the official page and the date we checked it.", "Полностью проверено: все 3 факта сверены, у каждого есть ссылка на официальную страницу и дата проверки.", "Toʻliq tekshirilgan: 3 tasi ham tekshirilgan, har birida rasmiy sahifa havolasi va tekshirilgan sana bor.", "Completo: los 3 están verificados, cada uno con enlace a la página oficial y la fecha.", "Vollständig: alle 3 sind geprüft, jeweils mit Link zur offiziellen Seite und Prüfdatum.", "数据完整：3 项均已核实，每项都附有官网链接和核实日期。"],
  "cov.help.ai": ["AI-checked: an AI agent read the official page; a person has not reviewed it yet.", "Проверено ИИ: ИИ прочитал официальную страницу, человек ещё не перепроверял.", "AI tekshirgan: AI rasmiy sahifani oʻqigan, inson hali qayta koʻrmagan.", "Revisado por IA: una IA leyó la página oficial; aún no lo ha revisado una persona.", "KI-geprüft: Eine KI hat die offizielle Seite gelesen; ein Mensch hat es noch nicht geprüft.", "AI 核对：AI 已阅读官网页面，尚未经人工复核。"],
  "cov.help.confirm": ["Universities change dates and fees. Always confirm on the official page before you apply.", "Университеты меняют сроки и цены. Перед подачей всегда сверяйтесь с официальной страницей.", "Universitetlar muddat va narxlarni oʻzgartiradi. Topshirishdan oldin har doim rasmiy sahifadan tekshiring.", "Las universidades cambian fechas y precios. Confirma siempre en la página oficial antes de postular.", "Hochschulen ändern Fristen und Gebühren. Prüfe vor der Bewerbung immer die offizielle Seite.", "大学会调整日期和费用，申请前请务必在官网确认。"],
  "ess.title": ["2027 essentials", "Главное на 2027", "2027 uchun asosiylar", "Lo esencial 2027", "Das Wichtigste 2027", "2027 关键信息"],
  "ess.deadline": ["Deadline", "Дедлайн", "Muddat", "Plazo", "Frist", "截止日期"],
  "ess.tuition": ["Tuition / year", "Обучение / год", "Kontrakt / yil", "Matrícula / año", "Studiengebühr / Jahr", "学费 / 年"],
  "ess.english": ["IELTS minimum", "Минимум IELTS", "IELTS minimumi", "IELTS mínimo", "IELTS-Minimum", "雅思最低分"],
  "ess.verified": ["Official page · {date}", "Официальный сайт · {date}", "Rasmiy sahifa · {date}", "Página oficial · {date}", "Offizielle Seite · {date}", "官网 · {date}"],
  "ess.ai": ["Official page, AI-checked · {date}", "Официальный сайт, проверено ИИ · {date}", "Rasmiy sahifa, AI tekshirgan · {date}", "Página oficial, revisado por IA · {date}", "Offizielle Seite, KI-geprüft · {date}", "官网，AI 核对 · {date}"],
  "ess.missing": ["Not verified yet", "Ещё не проверено", "Hali tekshirilmagan", "Aún sin verificar", "Noch nicht geprüft", "尚未核实"],
  "ess.all": ["All verified", "Всё проверено", "Hammasi tekshirilgan", "Todo verificado", "Alles geprüft", "全部已核实"],
  "ess.some": ["{n} of 3 verified", "Проверено {n} из 3", "3 tadan {n} tasi tekshirilgan", "{n} de 3 verificados", "{n} von 3 geprüft", "已核实 {n}/3"],
} as const;

type Key = keyof typeof T;
const pick = (i: number) => Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[i]])) as Record<Key, string>;

export const meEn = pick(0);
export const meRu = pick(1);
export const meUz = pick(2);
export const meEs = pick(3);
export const meDe = pick(4);
export const meZh = pick(5);
