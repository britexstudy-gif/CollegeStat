-- Publisher identity/permission metadata only. No positions, university data,
-- editions, logos or copied publisher table contents are imported.
insert into public.ranking_providers(name,slug,website,license_status,methodology)
values
 ('Center for World University Rankings','cwur','https://cwur.org/','restricted','Publisher reference only. Official methodology/about and 2026 edition checked 2026-10-12. No open redistribution permission established; no positions imported. https://cwur.org/about.php'),
 ('uniRank','unirank','https://www.unirank.org/','restricted','Non-academic web popularity and university directory. Source reference only: prior written permission required for scraping/republication. Terms checked 2026-10-12: https://www.unirank.org/terms/. No university records, logos or positions imported.')
on conflict(slug) do nothing;
