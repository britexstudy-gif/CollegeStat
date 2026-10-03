# Official university marks — 1 October 2026

Seven university marks were obtained from the university's own website: Ruse, WIUT, Harvard, UIBE, ETH Zurich, KU Leuven and Birmingham. Exact URLs, retrieval dates, local paths, display surfaces and SHA-256 hashes are recorded in `data/published/official-logos.json`.

`lib/official-logos.ts` matches the institution's domain or a real subdomain. It rejects domains that merely contain a university's name. The shared `UniversityLogo` component prioritizes these local assets, then a sourced logo, then an explicitly labeled official website icon. It no longer treats OpenAlex campus photographs as institution logos. A missing mark falls back to labeled initials; coverage is still incomplete.

White wordmarks use a dark neutral surface. Marks with dark lettering use a white surface. Original university artwork is preserved. These assets identify institutions; they are not generated substitutes or a claim of affiliation. University trademark and reuse conditions still apply. Licensed Wikimedia marks retain their separate attribution records.
