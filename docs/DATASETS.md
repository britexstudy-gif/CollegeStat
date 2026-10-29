# Applying public university datasets

Start with [ROR](https://ror.org/registry/) for global identities (CC0), then [College Scorecard](https://collegescorecard.ed.gov/data/api/) for US statistics. [IPEDS survey downloads](https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx?rtid=1) provide additional US survey detail; an IPEDS survey adapter is not implemented yet. These external datasets are not automatically treated as our catalogue coverage.

## ROR identity imports

1. Download a versioned release from the [official ROR dataset](https://doi.org/10.5281/zenodo.6347574). Extract its **v2 JSON** file. Record the release-specific URL, not just the latest-release link.
2. Preview locally without any database connection:

```sh
npm run ingest:ror -- --file data-imports/ror_v2.json --source https://zenodo.org/records/RELEASE_ID --country DE --out data-imports/germany-candidates.json
```

Replace RELEASE_ID with the downloaded release ID. The output path must not exist, preventing accidental overwrite. Omit `--country` for all countries. JSON input is bounded to 256 MiB. Multi-location records are excluded pending campus-aware mapping. Only active education records are candidates; education alone does not establish accreditation or university status.

3. To write the private review queue, configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the trusted process environment, then run the same command with `--stage`. Apply all database migrations first. Each 100-record batch commits atomically. An interrupted run can be repeated: identical versions deduplicate.
4. In **Admin → Candidates**, inspect the proposed identity and its source. Link the UUID of an existing institution or create an unpublished draft. Duplicate names/websites require explicit linking. Linking adds a ROR identifier; it never overwrites reviewed university fields. Changes from newer releases remain available as candidate versions.
5. Verify drafts in **Admin → Universities** before setting `published`. ROR city coordinates are retained as city-level source metadata, never labeled as university campus coordinates.

## College Scorecard observations

The trusted scheduled worker already supports `scorecard` feeds. Create an official `data_sources` record, add verified IPEDS ID mappings under **Identifiers**, then create a disabled feed. A feed URL must contain explicit institution IDs and reporting year, for example:

```
https://api.data.gov/ed/collegescorecard/v1/schools?id=IPEDS_ID&year=2024
```

Replace IPEDS_ID with the official identifier. `year` is worker configuration and is translated into year-specific API fields. The API key is added server-side from `SCORECARD_API_KEY`; never place it in the saved feed URL. Allow `api.data.gov` in `INGEST_ALLOWED_HOSTS`.

The current adapter maps admissions rate, undergraduate enrollment, and 150%-time completion. It does not mislabel out-of-state tuition as international tuition. It rejects unmapped identities, missing reporting years, oversized or truncated responses; null statistics remain absent. The resulting observations require admin approval. A source's reporting year may differ from the cohort year; preserve the dictionary and cohort notes when reviewing.

## IPEDS extension

Download the institution directory (HD), admissions (ADM), enrollment (EF), student financial aid (SFA), institutional characteristics/costs (IC), and graduation rate (GR) files for a deliberate survey year. Join by UNITID and inspect the annual dictionary, imputation flags, suppressed values, and cohort definitions before mapping. Do not load arbitrary CSV columns directly into canonical statistics. Feed reviewed mappings through the existing observation staging endpoint.

## Official-site facts for ranked universities

Outside the US the catalogue mostly holds identity data. `data/review/` holds batches of international tuition, English requirements, deadlines and public/private status collected from each university's own website, with a quote and source link for every value. They are review candidates only; see [data/review/README.md](../data/review/README.md) for validation and staging.
