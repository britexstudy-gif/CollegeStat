# CollegeStat open data

Sourced facts about universities, for students in Central Asia applying abroad. Every value carries an official source URL and the date it was checked.

**O'zbekcha:** CollegeStat universitetlar haqidagi tekshirilgan ma'lumotlarni (to'lov, muddatlar, IELTS talablari) manba havolasi bilan jamlaydi. Xato topdingizmi? Issue oching yoki ma'lumotni o'zingiz to'g'rilang: har bir qiymat uchun rasmiy sahifa havolasi va sanasi kerak.

**По-русски:** CollegeStat собирает проверенные данные об университетах (стоимость, дедлайны, требования IELTS) со ссылкой на источник. Нашли ошибку? Откройте issue или исправьте сами: для каждого значения нужны ссылка на официальную страницу и дата.

## What is in this repo

- `data/`: the dataset (CSV, JSON, Parquet; see [DATA_SCHEMA.md](DATA_SCHEMA.md)). Licence: CC BY 4.0.
- `scripts/data-ops/`, `scripts/ingest/`: the tools that merge, validate and check the data. Licence: Apache-2.0.
- Live product: https://collegestat.xyz (the app itself is not in this repo).

## Quick start

Node.js 22.13 or newer.

```sh
npm ci
npm run data:check     # validates the curated data, writes a coverage report
```

## Contribute data (no code needed)

1. Open a [data correction](../../issues/new?template=data_correction.yml) or [new university](../../issues/new?template=new_university.yml) issue with the official URL, or
2. Edit a record and open a pull request. Read [CONTRIBUTING.md](CONTRIBUTING.md): official source URL and date are required, latest academic year only.

## Contribute code

See the code section of [CONTRIBUTING.md](CONTRIBUTING.md): setup, tests, style.

## Principles

- Official source or it does not go in. No rumours, no forum posts.
- Latest year only (2026/27, else 2025/26). Unknown is shown as unknown, never as zero.
- Facts only: no copied prose, logos or photos from university sites.

## Licence

Data: CC BY 4.0, credit "CollegeStat contributors, collegestat.xyz". Code: Apache-2.0. The CollegeStat name and logo are not licensed. Third-party sources are listed in NOTICE.
