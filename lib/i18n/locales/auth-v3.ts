/**
 * Messages for the sign-in / sign-up form (Nov 17): sign-up asks name and country,
 * sign-in is email + a 6-digit code by default (password stays as an option).
 * One row per key: [en, ru, uz, es, de, zh]. Spread into every locale file.
 */
const T = {
  "au3.field.name": ["Your name", "Ваше имя", "Ismingiz", "Tu nombre", "Dein Name", "你的姓名"],
  "au3.name.ph": ["First and last name", "Имя и фамилия", "Ism va familiya", "Nombre y apellido", "Vor- und Nachname", "名字和姓氏"],
  "au3.field.country": ["Country you live in", "Страна проживания", "Yashash mamlakatingiz", "País donde vives", "Land, in dem du lebst", "居住国家"],
  "au3.country.choose": ["Choose a country", "Выберите страну", "Mamlakatni tanlang", "Elige un país", "Land wählen", "选择国家"],
  "au3.country.other": ["Other country", "Другая страна", "Boshqa mamlakat", "Otro país", "Anderes Land", "其他国家"],
  "au3.signin.sub": ["Enter your email and we’ll send you a 6-digit code. No password needed.", "Введите email — мы пришлём 6-значный код. Пароль не нужен.", "Emailingizni kiriting — 6 xonali kod yuboramiz. Parol kerak emas.", "Escribe tu email y te enviaremos un código de 6 dígitos. Sin contraseña.", "Gib deine E-Mail ein, wir senden dir einen 6-stelligen Code. Kein Passwort nötig.", "输入邮箱，我们会发送 6 位验证码，无需密码。"],
  "au3.signin.sub.pw": ["Welcome back. Enter your email and password.", "С возвращением. Введите email и пароль.", "Xush kelibsiz. Email va parolingizni kiriting.", "Hola de nuevo. Escribe tu email y contraseña.", "Willkommen zurück. Gib E-Mail und Passwort ein.", "欢迎回来，请输入邮箱和密码。"],
  "au3.signup.sub": ["Your name and country help us tailor universities, deadlines and scholarships. Takes under a minute.", "Имя и страна помогут подобрать вузы, сроки и стипендии. Займёт меньше минуты.", "Ism va mamlakat universitetlar, muddatlar va grantlarni moslashga yordam beradi. Bir daqiqadan kam vaqt oladi.", "Tu nombre y país nos ayudan a ajustar universidades, plazos y becas. Menos de un minuto.", "Name und Land helfen uns, Unis, Fristen und Stipendien anzupassen. Dauert unter einer Minute.", "姓名和国家帮助我们匹配院校、截止日期和奖学金，一分钟内完成。"],
  "au3.btn.code": ["Send me a code", "Получить код", "Kod yuborish", "Enviarme un código", "Code senden", "发送验证码"],
  "au3.use.password": ["Use a password instead", "Войти с паролем", "Parol bilan kirish", "Usar contraseña", "Stattdessen Passwort nutzen", "改用密码登录"],
  "au3.use.code": ["Use an email code instead", "Войти по коду из email", "Email kodi bilan kirish", "Usar un código por email", "Stattdessen E-Mail-Code nutzen", "改用邮箱验证码"],
} as const;

type Key = keyof typeof T;
const pick = (i: number) => Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[i]])) as Record<Key, string>;

export const authEn = pick(0);
export const authRu = pick(1);
export const authUz = pick(2);
export const authEs = pick(3);
export const authDe = pick(4);
export const authZh = pick(5);
