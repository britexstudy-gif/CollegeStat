/* Dashboard shell (Nov 19): first-run tour, cookie consent, recently viewed, GitHub sign-in.
 * Row format: "key": [en, ru, uz, es, de, zh]. */
const T = {
  "gh.soon": ["GitHub sign-in is coming soon. Please use another option for now.", "Вход через GitHub скоро появится. Пока выберите другой способ.", "GitHub orqali kirish tez orada qoʻshiladi. Hozircha boshqa usuldan foydalaning.", "El acceso con GitHub llegará pronto. Por ahora usa otra opción.", "Die Anmeldung mit GitHub kommt bald. Nutze vorerst eine andere Option.", "GitHub 登录即将开放，请先使用其他方式。"],

  "tour.1": ["Hi, I’m Spark! Home shows what is due next and how ready you are.", "Привет, я Spark! На главной видно, что горит дальше и насколько вы готовы.", "Salom, men Sparkman! Bosh sahifada keyingi muddatlar va tayyorgarligingiz koʻrinadi.", "¡Hola, soy Spark! Inicio muestra lo próximo que vence y cómo vas de preparación.", "Hi, ich bin Spark! Start zeigt, was als Nächstes fällig ist und wie bereit du bist.", "你好，我是 Spark！首页显示接下来的截止日期和你的准备进度。"],
  "tour.2": ["Plan turns your goals into dated steps, so nothing slips.", "План превращает цели в шаги с датами, чтобы ничего не потерялось.", "Reja maqsadlaringizni sanali qadamlarga aylantiradi, hech narsa esdan chiqmaydi.", "Plan convierte tus metas en pasos con fecha, para que nada se escape.", "Der Plan macht aus deinen Zielen Schritte mit Datum, damit nichts untergeht.", "计划把目标变成有日期的步骤，不会错过任何事。"],
  "tour.3": ["Ask the AI assistant anything about universities, costs or visas.", "Спросите ИИ-помощника о вузах, расходах или визах, о чём угодно.", "AI yordamchidan universitetlar, xarajatlar yoki viza haqida istalgan narsani soʻrang.", "Pregunta al asistente de IA sobre universidades, costes o visados.", "Frag den KI-Assistenten alles zu Hochschulen, Kosten oder Visa.", "向 AI 助手询问有关大学、费用或签证的任何问题。"],
  "tour.4": ["Your saved universities live in My colleges, sorted as reach, target or safe.", "Сохранённые вузы лежат в «Мои вузы»: мечта, цель или запасной вариант.", "Saqlagan universitetlaringiz “Universitetlarim”da: orzu, maqsad yoki zaxira.", "Tus universidades guardadas están en Mis universidades: ambiciosa, objetivo o segura.", "Deine gemerkten Hochschulen findest du unter „Meine Unis“: Traum, Ziel oder sicher.", "收藏的大学都在“我的院校”里，按冲刺、匹配、保底分类。"],
  "tour.step": ["{n} of {total}", "{n} из {total}", "{n} / {total}", "{n} de {total}", "{n} von {total}", "{n}/{total}"],
  "tour.next": ["Next", "Далее", "Keyingisi", "Siguiente", "Weiter", "下一步"],
  "tour.done": ["Got it", "Понятно", "Tushunarli", "Entendido", "Verstanden", "知道了"],
  "tour.skip": ["Skip", "Пропустить", "Oʻtkazib yuborish", "Omitir", "Überspringen", "跳过"],
  "tour.label": ["Quick tour", "Краткий тур", "Qisqa tanishuv", "Visita rápida", "Kurze Tour", "快速导览"],
  "tour.help": ["Quick tour", "Краткий тур", "Qisqa tanishuv", "Visita rápida", "Kurze Tour", "快速导览"],

  "ck2.label": ["Cookie settings", "Настройки cookie", "Cookie sozlamalari", "Ajustes de cookies", "Cookie-Einstellungen", "Cookie 设置"],
  "ck2.title": ["Your cookies, your choice", "Cookie: выбор за вами", "Cookie: tanlov sizniki", "Tus cookies, tu decisión", "Deine Cookies, deine Wahl", "Cookie 由你决定"],
  "ck2.text": ["Essential cookies keep you signed in. Personalization and analytics are optional and off until you say yes.", "Необходимые cookie нужны для входа. Персонализация и аналитика необязательны и выключены, пока вы не согласитесь.", "Zaruriy cookie fayllar tizimda qolishingiz uchun kerak. Shaxsiylashtirish va tahlil ixtiyoriy va siz rozi boʻlmaguncha oʻchiq.", "Las cookies esenciales mantienen tu sesión. La personalización y las analíticas son opcionales y están desactivadas hasta que aceptes.", "Notwendige Cookies halten dich angemeldet. Personalisierung und Analyse sind optional und bleiben aus, bis du zustimmst.", "必要 Cookie 用于保持登录。个性化和分析是可选的，在你同意前保持关闭。"],
  "ck2.all": ["Accept all", "Принять все", "Hammasini qabul qilish", "Aceptar todo", "Alle akzeptieren", "全部接受"],
  "ck2.min": ["Essential only", "Только необходимые", "Faqat zaruriylari", "Solo esenciales", "Nur notwendige", "仅必要"],
  "ck2.custom": ["Choose", "Выбрать", "Tanlash", "Elegir", "Auswählen", "自选"],
  "ck2.save": ["Save choice", "Сохранить выбор", "Tanlovni saqlash", "Guardar elección", "Auswahl speichern", "保存选择"],
  "ck2.ess": ["Essential", "Необходимые", "Zaruriy", "Esenciales", "Notwendig", "必要"],
  "ck2.ess.d": ["Sign-in, security and your language. Always on.", "Вход, безопасность и язык. Всегда включены.", "Kirish, xavfsizlik va tilingiz. Doim yoniq.", "Inicio de sesión, seguridad e idioma. Siempre activas.", "Anmeldung, Sicherheit und deine Sprache. Immer aktiv.", "登录、安全和语言。始终开启。"],
  "ck2.per": ["Personalization", "Персонализация", "Shaxsiylashtirish", "Personalización", "Personalisierung", "个性化"],
  "ck2.per.d": ["Remembers universities you viewed and uses them to tune your suggestions.", "Запоминает просмотренные вузы и учитывает их в рекомендациях.", "Koʻrgan universitetlaringizni eslab qoladi va tavsiyalarni moslashda ishlatadi.", "Recuerda las universidades que viste y las usa para ajustar tus sugerencias.", "Merkt sich angesehene Hochschulen und nutzt sie für deine Vorschläge.", "记住你看过的大学，并用来优化推荐。"],
  "ck2.ana": ["Analytics", "Аналитика", "Tahlil", "Analíticas", "Analyse", "分析"],
  "ck2.ana.d": ["Anonymous usage counts. None run today; if added, they follow this choice.", "Анонимная статистика. Сейчас её нет; если появится, будет учитывать этот выбор.", "Anonim foydalanish statistikasi. Hozir yoʻq; qoʻshilsa, shu tanlovga amal qiladi.", "Recuentos anónimos de uso. Hoy no hay ninguno; si se añaden, seguirán esta elección.", "Anonyme Nutzungszahlen. Aktuell keine; falls ergänzt, gilt diese Wahl.", "匿名使用统计。目前没有；若添加将遵循此选择。"],
  "ck2.on": ["On", "Вкл.", "Yoniq", "Activado", "An", "开"],

  "rv.title": ["Recently viewed", "Недавно просмотренные", "Yaqinda koʻrilgan", "Vistas recientemente", "Zuletzt angesehen", "最近浏览"],
  "rv.hint": ["Based on this device, with your permission.", "Только на этом устройстве, с вашего разрешения.", "Shu qurilmadan, ruxsatingiz bilan.", "Solo en este dispositivo, con tu permiso.", "Nur auf diesem Gerät, mit deiner Erlaubnis.", "仅限此设备，经你许可。"],
  "rv.clear": ["Clear", "Очистить", "Tozalash", "Borrar", "Löschen", "清除"],
} as const;

type Key = keyof typeof T;
const pick = (i: number) => Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[i]])) as Record<Key, string>;

export const shellEn = pick(0);
export const shellRu = pick(1);
export const shellUz = pick(2);
export const shellEs = pick(3);
export const shellDe = pick(4);
export const shellZh = pick(5);
