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
} as const;

type Key = keyof typeof T;
const pick = (i: number) => Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[i]])) as Record<Key, string>;

export const meEn = pick(0);
export const meRu = pick(1);
export const meUz = pick(2);
export const meEs = pick(3);
export const meDe = pick(4);
export const meZh = pick(5);
