/** Words the query parser recognises, in English, Russian and Uzbek (Latin and
 * Cyrillic). Terms are written folded (lowercase, no apostrophes). A trailing
 * "*" matches any ending, which covers Russian cases ("Германии") and Uzbek
 * suffixes ("Germaniyada", "kompyuterga"). Multi-word terms match in order. */

/** Country → names and demonyms beyond the English name (which comes from lib/domain). */
export const COUNTRY_TERMS: Record<string, string[]> = {
  US: ["usa", "us", "u s", "u s a", "america", "american*", "united states", "states", "сша", "америк*", "штат*", "aqsh", "amerika*", "акш"],
  GB: ["uk", "u k", "britain", "great britain", "england", "english universities", "british", "scotland", "scottish", "wales", "великобритан*", "британ*", "англи*", "шотланд*", "buyuk britaniya*", "britaniya*", "angliya*", "шотландия"],
  DE: ["german*", "deutschland", "герман*", "немецк*", "germaniya*", "nemis*", "олмония", "olmoniya*"],
  FR: ["france", "french", "франци*", "французск*", "fransiya*", "frantsiya*"],
  IT: ["ital*", "итали*", "итальянск*", "italiya*"],
  ES: ["spain", "spanish", "испани*", "испанск*", "ispaniya*"],
  NL: ["netherlands", "holland", "dutch", "нидерланд*", "голланд*", "niderlandiya*", "gollandiya*"],
  BE: ["belgium", "belgian", "бельги*", "belgiya*"],
  CH: ["switzerland", "swiss", "швейцари*", "shveytsariya*"],
  AT: ["austria*", "австри*", "avstriya*"],
  SE: ["sweden", "swedish", "швеци*", "shvetsiya*"],
  NO: ["norway", "norwegian", "норвеги*", "norvegiya*"],
  FI: ["finland", "finnish", "финлянд*", "finlyandiya*"],
  DK: ["denmark", "danish", "дани*", "daniya*"],
  IE: ["ireland", "irish", "ирланди*", "irlandiya*"],
  PL: ["poland", "polish", "польш*", "polsha*"],
  CZ: ["czech*", "czechia", "чехи*", "чешск*", "chexiya*"],
  HU: ["hungary", "hungarian", "венгри*", "vengriya*"],
  PT: ["portugal", "portuguese", "португали*", "portugaliya*"],
  LT: ["lithuania*", "литв*", "litva*"],
  LV: ["latvia*", "латви*", "latviya*"],
  EE: ["estonia*", "эстони*", "estoniya*"],
  CA: ["canada", "canadian", "канад*", "kanada*"],
  AU: ["australia*", "австрали*", "avstraliya*"],
  NZ: ["new zealand", "новая зеланди*", "новой зеланди*", "yangi zelandiya*"],
  KR: ["korea*", "south korea", "корея", "корее", "корейск*", "южн* коре*", "koreya*", "janubiy koreya*"],
  JP: ["japan*", "япони*", "японск*", "yaponiya*"],
  CN: ["china", "chinese", "китай*", "китае", "xitoy*"],
  HK: ["hong kong", "гонконг*", "gonkong*"],
  SG: ["singapore*", "сингапур*", "singapur*"],
  MY: ["malaysia*", "малайзи*", "malayziya*"],
  TR: ["turkey", "turkiye", "turkish", "турци*", "турецк*", "turkiya*", "туркия"],
  AE: ["uae", "emirates", "dubai", "abu dhabi", "оаэ", "эмират*", "дубай*", "baa", "amirlik*", "dubay*"],
  QA: ["qatar*", "катар*", "qatar"],
  SA: ["saudi*", "саудов*", "saudiya*"],
  IN: ["india", "indian", "инди*", "hindiston*"],
  RU: ["russia*", "росси*", "российск*", "rossiya*"],
  KZ: ["kazakhstan*", "kazakh*", "казахстан*", "казахск*", "qozogiston*", "қозоғистон"],
  UZ: ["uzbekistan*", "uzbek*", "узбекистан*", "узбекск*", "ozbekiston*", "узбекистон", "ўзбекистон"],
  KG: ["kyrgyzstan*", "kyrgyz*", "кыргызстан*", "киргизи*", "qirgiziston*"],
  TJ: ["tajikistan*", "tajik*", "таджикистан*", "tojikiston*"],
  TW: ["taiwan*", "тайван*", "tayvan*"],
  IL: ["israel*", "израил*", "isroil*"],
  GE: ["georgia", "грузи*", "gruziya*"],
};

/** Continent words → region names used by lib/regions. */
export const REGION_TERMS: Record<string, string[]> = {
  Europe: ["europe*", "european", "европ*", "yevropa*", "evropa*", "европа"],
  Asia: ["asia*", "asian", "ази*", "osiyo*"],
  "North America": ["north america*", "северн* америк*", "shimoliy amerika*"],
  Oceania: ["oceania*", "океани*", "okeaniya*"],
};

/** Study fields: query words and the programme-name pattern that marks a field
 * in the index. Ids are stable; their order is the bit position in the index. */
export const FIELDS: { id: string; label: string; terms: string[]; match: RegExp }[] = [
  {
    id: "cs",
    label: "Computer science",
    terms: ["computer science", "computer engineering", "computing", "cs", "it", "informatics", "software*", "programming", "coding", "информатик*", "компьютерн*", "программировани*", "программн*", "айти", "ит", "kompyuter*", "informatika*", "dasturlash*", "dasturiy*", "axborot texnologiya*"],
    match: /comput|informati|software|information tech|information sys|cyber|programming/i,
  },
  {
    id: "ai",
    label: "Data science and AI",
    terms: ["data science", "data analytics", "ai", "artificial intelligence", "machine learning", "искусственн* интеллект*", "машинн* обучени*", "наук* о данных", "suniy intellekt*", "malumotlar*"],
    match: /data sci|artificial intel|machine learn|data analy|\bai\b/i,
  },
  {
    id: "eng",
    label: "Engineering",
    terms: ["engineering", "engineer*", "инженер*", "инженери*", "muhandis*"],
    match: /engineer|mechatron|aerospace|aeronaut/i,
  },
  {
    id: "mech",
    label: "Mechanical engineering",
    terms: ["mechanical*", "mechatronics", "механик*", "машиностро*", "mexanika*", "mashinasozlik*"],
    match: /mechanic|mechatron|aerospace|aeronaut|automotive/i,
  },
  {
    id: "ee",
    label: "Electrical engineering",
    terms: ["electrical*", "electronics", "электротехн*", "электроник*", "elektrotexnika*", "elektronika*"],
    match: /electric|electron/i,
  },
  {
    id: "civil",
    label: "Civil engineering",
    terms: ["civil engineering", "construction", "строительств*", "строител*", "qurilish*"],
    match: /civil|construction|structural/i,
  },
  {
    id: "business",
    label: "Business",
    terms: ["business*", "management", "marketing", "mba", "commerce", "бизнес*", "менеджмент*", "маркетинг*", "управлени*", "biznes*", "menejment*", "boshqaruv*"],
    match: /business|management|marketing|commerce|entrepreneur|administration/i,
  },
  {
    id: "econ",
    label: "Economics",
    terms: ["economics", "economy", "econ", "эконом*", "iqtisod*", "iqtisodiyot*"],
    match: /econom/i,
  },
  {
    id: "finance",
    label: "Finance and accounting",
    terms: ["finance", "financial", "accounting", "banking", "финанс*", "бухгалтер*", "банков*", "moliya*", "buxgalteriya*", "bank ishi"],
    match: /financ|accounting|banking|actuar/i,
  },
  {
    id: "med",
    label: "Medicine",
    terms: ["medicine", "medical", "mbbs", "doctor", "медицин*", "лечебн*", "врач*", "tibbiyot*", "shifokor*", "tibbiy*"],
    match: /medicine|\bmbbs\b|surgery|^medical (?:science|studies)|clinical medicine/i,
  },
  {
    id: "dent",
    label: "Dentistry",
    terms: ["dentistry", "dental", "стоматолог*", "stomatologiya*"],
    match: /dent/i,
  },
  {
    id: "pharm",
    label: "Pharmacy",
    terms: ["pharmacy", "pharmaceutical*", "фармац*", "farmatsiya*"],
    match: /pharm/i,
  },
  {
    id: "nursing",
    label: "Nursing",
    terms: ["nursing", "nurse", "сестринск*", "медсестр*", "hamshira*"],
    match: /nurs/i,
  },
  {
    id: "law",
    label: "Law",
    terms: ["law", "legal", "llb", "юриспруденц*", "юридическ*", "юрист*", "право", "huquq*", "yurist*", "yuridik*"],
    match: /\blaws?\b|legal|jurisprud|llb/i,
  },
  {
    id: "psych",
    label: "Psychology",
    terms: ["psychology", "psych", "психолог*", "psixologiya*"],
    match: /psycholog/i,
  },
  {
    id: "bio",
    label: "Biology",
    terms: ["biology", "biotech*", "biomedical*", "life sciences", "биолог*", "биотех*", "biologiya*"],
    match: /biolog|biomed|biochem|life sci|biotech|genetic/i,
  },
  {
    id: "chem",
    label: "Chemistry",
    terms: ["chemistry", "chemical*", "хими*", "kimyo*"],
    match: /chemi/i,
  },
  {
    id: "phys",
    label: "Physics",
    terms: ["physics", "astronomy", "физик*", "fizika*"],
    match: /physics|astronom/i,
  },
  {
    id: "math",
    label: "Mathematics",
    terms: ["mathematics", "math", "maths", "statistics", "математик*", "статистик*", "matematika*", "statistika*"],
    match: /math|statist/i,
  },
  {
    id: "arch",
    label: "Architecture",
    terms: ["architecture", "архитектур*", "arxitektura*", "memorchilik*"],
    match: /architect/i,
  },
  {
    id: "design",
    label: "Design and arts",
    terms: ["design", "art", "arts", "fine arts", "film", "music", "animation", "дизайн*", "искусств*", "музык*", "dizayn*", "sanat*", "musiqa*"],
    match: /design|fine arts?|visual art|\bart\b|animation|film|music|performing/i,
  },
  {
    id: "ir",
    label: "International relations",
    terms: ["international relations", "political science", "politics", "diplomacy", "public policy", "международн* отношени*", "политолог*", "дипломат*", "xalqaro munosabat*", "siyosatshunoslik*", "siyosat*"],
    match: /international relation|politic|government|diplomac|public policy/i,
  },
  {
    id: "edu",
    label: "Education",
    terms: ["education", "teaching", "pedagogy", "педагог*", "pedagogika*", "talim*", "oqituvchi*"],
    match: /education|teaching|pedagog/i,
  },
  {
    id: "lang",
    label: "Languages and linguistics",
    terms: ["linguistics", "languages", "translation", "literature", "philology", "лингвист*", "филолог*", "перевод*", "литератур*", "tilshunoslik*", "filologiya*", "tarjima*"],
    match: /linguist|languages?\b|literature|translation|philolog/i,
  },
  {
    id: "media",
    label: "Media and journalism",
    terms: ["journalism", "media", "communications", "журналист*", "медиа", "jurnalistika*"],
    match: /journalism|media|communication/i,
  },
  {
    id: "tourism",
    label: "Tourism and hospitality",
    terms: ["tourism", "hospitality", "hotel management", "туризм*", "гостинич*", "turizm*", "mehmonxona*"],
    match: /touris|hospitality|hotel/i,
  },
  {
    id: "agri",
    label: "Agriculture and veterinary",
    terms: ["agriculture", "agronomy", "veterinary", "сельск* хозяйств*", "агроном*", "ветеринар*", "qishloq xojaligi", "agronomiya*", "veterinariya*"],
    match: /agricult|agronom|food sci|veterinar|animal sci/i,
  },
  {
    id: "env",
    label: "Environment and earth sciences",
    terms: ["environmental*", "ecology", "geology", "earth sciences", "эколог*", "геолог*", "ekologiya*", "geologiya*"],
    match: /environment|ecolog|sustainab|geolog|earth sci|geograph/i,
  },
];

/** Application platforms (ids match lib/application-platforms). */
export const PLATFORM_TERMS: Record<string, string[]> = {
  "common-app": ["common app", "common application", "commonapp", "коммон апп", "коммон эпп", "коммонапп", "kommon app"],
  coalition: ["coalition", "coalition app", "коалиция"],
  ucas: ["ucas", "юкас", "укас"],
  "uni-assist": ["uni assist", "uniassist", "uni-assist", "юни ассист", "униассист"],
  studielink: ["studielink", "студиелинк"],
  "campus-france": ["campus france", "кампус франс"],
  universitaly: ["universitaly"],
  uc: ["uc application", "uc app"],
  ouac: ["ouac"],
  uac: ["uac"],
  direct: ["apply directly", "direct application", "own portal", "напрямую", "togridan togri"],
};
export const PLATFORM_NAMES: Record<string, string> = {
  "common-app": "Common App",
  coalition: "Coalition App",
  ucas: "UCAS",
  "uni-assist": "uni-assist",
  studielink: "Studielink",
  "campus-france": "Campus France",
  universitaly: "Universitaly",
  uc: "UC Application",
  ouac: "OUAC",
  uac: "UAC",
  direct: "Direct application",
};

export const FREE_TERMS = ["free", "tuition free", "free tuition", "no tuition", "without tuition", "бесплатн*", "без оплаты", "bepul*", "tekin*", "kontraktsiz"];
export const SCHOLARSHIP_TERMS = ["scholarship*", "grant*", "funding", "fully funded", "financial aid", "стипенди*", "грант*", "финансировани*", "stipendiya*", "grant", "moliyaviy yordam", "toliq grant"];
export const CHEAP_TERMS = ["cheap*", "affordable", "low cost", "low tuition", "дешев*", "недорог*", "arzon*"];
export const NO_SAT_TERMS = ["no sat", "without sat", "sat optional", "test optional", "test-optional", "без sat", "без сат", "satsiz", "sat shart emas", "sat talab qilinmaydi"];
export const NO_IELTS_TERMS = ["no ielts", "without ielts", "ielts optional", "без ielts", "без айелтс", "ieltssiz", "ielts shart emas", "ielts talab qilinmaydi"];

/** Month stems (folded) → month number. */
export const MONTHS: [string, number][] = [
  ["january", 1], ["jan", 1], ["январ*", 1], ["yanvar*", 1],
  ["february", 2], ["feb", 2], ["феврал*", 2], ["fevral*", 2],
  ["march", 3], ["mar", 3], ["март*", 3], ["mart*", 3],
  ["april", 4], ["apr", 4], ["апрел*", 4], ["aprel*", 4],
  ["may", 5], ["май", 5], ["мая", 5], ["мае", 5],
  ["june", 6], ["jun", 6], ["июн*", 6], ["iyun*", 6],
  ["july", 7], ["jul", 7], ["июл*", 7], ["iyul*", 7],
  ["august", 8], ["aug", 8], ["август*", 8], ["avgust*", 8],
  ["september", 9], ["sep", 9], ["sept", 9], ["сентябр*", 9], ["sentyabr*", 9],
  ["october", 10], ["oct", 10], ["октябр*", 10], ["oktyabr*", 10],
  ["november", 11], ["nov", 11], ["ноябр*", 11], ["noyabr*", 11],
  ["december", 12], ["dec", 12], ["декабр*", 12], ["dekabr*", 12],
];

/** Words that carry no meaning for matching (connectors, "university", "study"). */
export const STOPWORDS = new Set(
  [
    "the", "of", "in", "at", "for", "and", "a", "an", "to", "with", "on", "my", "me", "i", "show", "find", "list", "best", "top", "good", "study", "studying", "universities", "university", "uni", "unis", "college", "colleges", "school", "schools", "programme", "programmes", "program", "programs", "degree", "degrees", "bachelor", "bachelors", "undergraduate", "course", "courses", "where", "which", "what", "can", "is", "are", "or", "per", "year", "yearly", "annual", "tuition", "fee", "fees", "price", "cost", "costs", "deadline", "deadlines", "requirements", "apply", "applying", "abroad", "international", "students", "student",
    "в", "во", "на", "и", "для", "с", "со", "по", "из", "о", "об", "у", "или", "где", "какие", "какой", "лучшие", "лучший", "хорошие", "учеба", "учёба", "учиться", "обучение", "университет", "университеты", "университета", "университете", "вуз", "вузы", "вузе", "колледж", "программа", "программы", "бакалавр", "бакалавриат", "год", "в год", "стоимость", "цена", "плата", "дедлайн", "поступление", "поступить", "за", "рубежом", "границей",
    "va", "da", "uchun", "bilan", "eng", "yaxshi", "qaysi", "qayerda", "universitet", "universiteti", "universitetlar", "universitetlari", "oliygoh", "oliygohlar", "dastur", "dasturi", "bakalavriat", "yil", "yiliga", "narx", "narxi", "kontrakt", "oqish", "chet", "elda", "xorijda", "topish", "kerak",
  ].map((w) => w.toLowerCase()),
);

/** Common Russian/Uzbek names whose spelling differs too much from the English
 * one for fuzzy matching. Name patterns are matched against the catalogue when
 * the index is built; the aliases are added to those universities. */
export const NAME_ALIASES: [RegExp, string[]][] = [
  [/^Harvard University$/, ["гарвард", "гарвардский", "garvard"]],
  [/^Yale University$/, ["йель", "йельский", "yel"]],
  [/^Princeton University$/, ["принстон", "принстонский"]],
  [/^Stanford University$/, ["стэнфорд", "стенфорд", "stenford"]],
  [/^Columbia University/, ["колумбийский", "колумбия"]],
  [/^Massachusetts Institute of Technology$/, ["мит", "мти", "массачусетский", "массачусетский технологический"]],
  [/^California Institute of Technology$/, ["калтех", "kaltex"]],
  [/^University of California[-, ]+Berkeley$/, ["беркли", "berkli"]],
  [/^University of Oxford$/, ["оксфорд", "оксфордский", "oksford"]],
  [/^University of Cambridge$/, ["кембридж", "кембриджский", "kembrij"]],
  [/^Imperial College London$/, ["империал", "имперский колледж"]],
  [/^University College London$/, ["юсиэл", "юсл"]],
  [/^London School of Economics/, ["лсэ", "лондонская школа экономики"]],
  [/^University of Edinburgh$/, ["эдинбург", "эдинбургский", "edinburg"]],
  [/^Technical University of Munich$/, ["тум", "мюнхенский технический", "tum"]],
  [/^Ludwig-Maximilians-Universität München$/, ["лму", "мюнхенский университет", "lmu", "university of munich"]],
  [/^Ruprecht-Karls-Universität Heidelberg$/, ["гейдельберг", "гейдельбергский", "geydelberg", "heidelberg university"]],
  [/^Lomonosov Moscow State University$|^Moscow State University$/, ["мгу", "мгу имени ломоносова", "московский государственный университет", "mgu"]],
  [/^Moscow Institute of Physics and Technology/, ["мфти", "физтех", "mfti"]],
  [/^HSE University$|Higher School of Economics$/, ["вшэ", "вышка", "высшая школа экономики", "vshe"]],
  [/^Saint Petersburg State University$|^St\.? Petersburg State University$/, ["спбгу", "spbgu"]],
  [/^Bauman Moscow State Technical University$/, ["бауманка", "мгту", "мгту баумана"]],
  [/^Nazarbayev University$/, ["назарбаев", "назарбаев университет", "nu", "назарбаев университеті"]],
  [/^Westminster International University in Tashkent$/, ["вестминстер", "виут", "wiut", "vestminster"]],
  [/^Inha University in Tashkent$/, ["инха", "inha toshkent", "iut"]],
  [/^Tsinghua University$/, ["цинхуа", "sinxua", "tsinxua"]],
  [/^Peking University$/, ["пекинский", "пекинский университет", "pekin universiteti"]],
  [/^University of Tokyo$|^The University of Tokyo$/, ["токийский", "токийский университет", "tokio"]],
  [/^Seoul National University$/, ["сеульский", "сеульский национальный", "snu", "seul milliy"]],
  [/^Korea Advanced Institute of Science (and|&) Technology$/, ["кайст", "kaist"]],
  [/^National University of Singapore$/, ["нус", "nus", "сингапурский национальный"]],
  [/^Sorbonne University$|^Sorbonne Université$/, ["сорбонна", "sorbonna"]],
  [/^University of Toronto$/, ["торонто", "toronto universiteti"]],
  [/^University of Melbourne$|^The University of Melbourne$/, ["мельбурн", "мельбурнский", "melburn"]],
  [/\bETH Zurich\b/, ["eth", "цюрих", "цюрихский политехнический", "syurix"]],
  [/^Charles University/, ["карлов", "карлов университет", "karlov"]],
  [/^Bilkent University$|^Bilkent Üniversitesi$/, ["билкент", "bilkent"]],
  [/^Middle East Technical University$/, ["метю", "odtu", "metu", "одту"]],
];
