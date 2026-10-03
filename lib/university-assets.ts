// Exact source matching prevents a slug from borrowing another institution's identity.
export const universityMarks = [
  {
    slug: "mit",
    local: "/logos/mit.svg",
    remote:
      "https://upload.wikimedia.org/wikipedia/commons/b/b8/MIT_2023_red_logo.svg",
    source: "https://commons.wikimedia.org/wiki/File:MIT_2023_red_logo.svg",
    credit: "MIT · Matthew Carter and others; PD-textlogo. Trademark retained.",
  },
  {
    slug: "tum",
    local: "/logos/tum.svg",
    remote:
      "https://upload.wikimedia.org/wikipedia/commons/c/c8/Logo_of_the_Technical_University_of_Munich.svg",
    source:
      "https://commons.wikimedia.org/wiki/File:Logo_of_the_Technical_University_of_Munich.svg",
    credit: "TUM ccc · PD-textlogo. Trademark retained.",
  },
  {
    slug: "stanford",
    local: "/logos/stanford.png",
    remote: "https://www.stanford.edu/icon1.png",
    source: "https://www.stanford.edu",
    credit:
      "Stanford University · official website icon; institution identification only.",
  },
  {
    slug: "oxford",
    local: "/logos/oxford.svg",
    remote:
      "https://upload.wikimedia.org/wikipedia/commons/2/2f/University_of_Oxford.svg",
    source: "https://commons.wikimedia.org/wiki/File:University_of_Oxford.svg",
    credit:
      "University of Oxford; vector by Moonrivers · Commons public-domain designation; trademark retained.",
  },
  {
    slug: "toronto",
    local: "/logos/toronto.ico",
    remote: "https://future.utoronto.ca/themes/utfs/favicon.ico",
    source: "https://future.utoronto.ca",
    credit:
      "University of Toronto · official admissions website icon; institution identification only.",
  },
  {
    slug: "wiut",
    local: "/logos/wiut.png",
    remote: "https://www.wiut.uz/images/favicon/website-icon1.png",
    source: "https://www.wiut.uz",
    credit:
      "Westminster International University in Tashkent · official website icon; institution identification only.",
  },
] as const;
export const campusAssets: Record<string, string> = {
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/94/MIT_Killian_Court.jpg/1280px-MIT_Killian_Court.jpg":
    "/images/mit-campus.webp",
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4d/Stanford_University_Main_Quad_-_7_June_2009.jpg/1280px-Stanford_University_Main_Quad_-_7_June_2009.jpg":
    "/images/stanford-campus.webp",
};
