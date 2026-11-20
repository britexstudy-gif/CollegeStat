/**
 * The support / report-a-problem form (Nov 18).
 * One row per key: [en, ru, uz, es, de, zh]. Spread into every locale file.
 */
const T = {
  "sf.intro": ["Share a question, a broken feature or a source correction. Please leave out passwords, documents and private application details.", "Задайте вопрос, сообщите о неработающей функции или исправьте источник. Не присылайте пароли, документы и личные данные заявки.", "Savol, ishlamayotgan funksiya yoki manba bo‘yicha tuzatishni yozing. Parol, hujjatlar va arizaning shaxsiy ma’lumotlarini yubormang.", "Comparte una pregunta, una función que falla o una corrección de fuente. No incluyas contraseñas, documentos ni datos privados de tu solicitud.", "Stell eine Frage, melde einen Fehler oder korrigiere eine Quelle. Bitte keine Passwörter, Dokumente oder privaten Bewerbungsdaten.", "提出问题、报告故障或更正来源。请勿填写密码、证件或申请中的私人信息。"],
  "sf.type": ["Message type", "Тип сообщения", "Xabar turi", "Tipo de mensaje", "Art der Nachricht", "消息类型"],
  "sf.type.question": ["A question", "Вопрос", "Savol", "Una pregunta", "Eine Frage", "提问"],
  "sf.type.issue": ["Report a problem", "Сообщить о проблеме", "Muammo haqida xabar", "Informar de un problema", "Problem melden", "报告问题"],
  "sf.type.correction": ["Correct university data", "Исправить данные вуза", "Universitet ma’lumotini tuzatish", "Corregir datos de una universidad", "Hochschuldaten korrigieren", "更正大学信息"],
  "sf.type.feedback": ["Share feedback", "Оставить отзыв", "Fikr bildirish", "Enviar comentarios", "Feedback geben", "提供反馈"],
  "sf.name": ["Your name", "Ваше имя", "Ismingiz", "Tu nombre", "Dein Name", "你的名字"],
  "sf.optional": ["(optional)", "(необязательно)", "(ixtiyoriy)", "(opcional)", "(optional)", "（选填）"],
  "sf.email": ["Email", "Эл. почта", "Email", "Correo", "E-Mail", "邮箱"],
  "sf.subject": ["Subject", "Тема", "Mavzu", "Asunto", "Betreff", "主题"],
  "sf.subject.ph": ["What can we help with?", "Чем мы можем помочь?", "Qanday yordam bera olamiz?", "¿En qué podemos ayudarte?", "Wobei können wir helfen?", "需要什么帮助？"],
  "sf.message": ["Message", "Сообщение", "Xabar", "Mensaje", "Nachricht", "内容"],
  "sf.message.ph": ["Describe what happened, what you expected and any official source that helps.", "Опишите, что произошло, что вы ожидали, и приложите официальный источник, если есть.", "Nima bo‘lganini, nimani kutganingizni va yordam beradigan rasmiy manbani yozing.", "Describe qué pasó, qué esperabas y cualquier fuente oficial útil.", "Beschreibe, was passiert ist, was du erwartet hast, und eine hilfreiche offizielle Quelle.", "请描述发生了什么、你的预期，以及可参考的官方来源。"],
  "sf.count": ["{n} / 5,000 characters", "{n} / 5 000 символов", "{n} / 5 000 belgi", "{n} / 5.000 caracteres", "{n} / 5.000 Zeichen", "{n} / 5000 字"],
  "sf.consent": ["I agree that CollegeStat staff can read and store this message to investigate it.", "Я согласен(на), что сотрудники CollegeStat прочитают и сохранят это сообщение для проверки.", "CollegeStat xodimlari bu xabarni tekshirish uchun o‘qishi va saqlashiga roziman.", "Acepto que el equipo de CollegeStat lea y guarde este mensaje para revisarlo.", "Ich bin einverstanden, dass das CollegeStat-Team diese Nachricht zur Prüfung liest und speichert.", "我同意 CollegeStat 工作人员阅读并保存此消息以便处理。"],
  "sf.note": ["This is a private message to our team. It is not posted publicly.", "Это личное сообщение нашей команде. Оно не публикуется.", "Bu jamoamizga shaxsiy xabar. U hech qayerda e’lon qilinmaydi.", "Es un mensaje privado para nuestro equipo. No se publica.", "Dies ist eine private Nachricht an unser Team. Sie wird nicht veröffentlicht.", "这是发给团队的私信，不会公开。"],
  "sf.send": ["Send message", "Отправить", "Yuborish", "Enviar mensaje", "Nachricht senden", "发送"],
  "sf.sending": ["Sending…", "Отправка…", "Yuborilmoqda…", "Enviando…", "Wird gesendet…", "发送中…"],
  "sf.done": ["Message received", "Сообщение получено", "Xabar qabul qilindi", "Mensaje recibido", "Nachricht erhalten", "已收到消息"],
  "sf.done.text": ["Your message is with the CollegeStat team.", "Ваше сообщение у команды CollegeStat.", "Xabaringiz CollegeStat jamoasiga yetib bordi.", "Tu mensaje ya está con el equipo de CollegeStat.", "Deine Nachricht ist beim CollegeStat-Team.", "你的消息已送达 CollegeStat 团队。"],
  "sf.ref": ["Reference: {id}", "Номер: {id}", "Raqam: {id}", "Referencia: {id}", "Referenz: {id}", "编号：{id}"],
  "sf.again": ["Send another message", "Отправить ещё", "Yana xabar yuborish", "Enviar otro mensaje", "Weitere Nachricht senden", "再发一条"],
  "sf.failed": ["Your message was not confirmed. Your draft is kept.", "Сообщение не подтверждено. Черновик сохранён.", "Xabar tasdiqlanmadi. Qoralama saqlab qolindi.", "Tu mensaje no se confirmó. El borrador se guardó.", "Deine Nachricht wurde nicht bestätigt. Der Entwurf bleibt erhalten.", "消息未确认，草稿已保留。"],
  "sf.changed": ["Your account changed. Reopen the form.", "Аккаунт сменился. Откройте форму заново.", "Hisob o‘zgardi. Formani qayta oching.", "Tu cuenta cambió. Vuelve a abrir el formulario.", "Dein Konto hat sich geändert. Öffne das Formular erneut.", "账户已变更，请重新打开表单。"],
  "sf.report.title": ["Help us fix it", "Помогите нам исправить", "Tuzatishga yordam bering", "Ayúdanos a arreglarlo", "Hilf uns, es zu beheben", "帮我们修复"],
  "sf.report.text": ["Report an issue on this page to the CollegeStat team.", "Сообщите команде CollegeStat о проблеме на этой странице.", "Bu sahifadagi muammo haqida CollegeStat jamoasiga yozing.", "Informa al equipo de CollegeStat de un problema en esta página.", "Melde dem CollegeStat-Team ein Problem auf dieser Seite.", "向 CollegeStat 团队报告本页的问题。"],
} as const;

type Key = keyof typeof T;
const pick = (i: number) => Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v[i]])) as Record<Key, string>;

export const supportEn = pick(0);
export const supportRu = pick(1);
export const supportUz = pick(2);
export const supportEs = pick(3);
export const supportDe = pick(4);
export const supportZh = pick(5);
