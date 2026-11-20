#!/usr/bin/env python3
"""Review/apply exact institution-link corrections; never modify publisher facts."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/published'

def source_fingerprint(rows):
    facts = [{k: v for k, v in row.items() if k != 'university_id'} for row in rows]
    return hashlib.sha256(json.dumps(facts, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def reconcile(rows, directory, receipt):
    assert receipt['status'] == 'verified_identity_correction'
    before = source_fingerprint(rows)
    corrected = json.loads(json.dumps(rows))
    changes = []
    for review in receipt['corrections']:
        assert review['verification_status'] == 'verified'
        identity = [u for u in directory if u['id'] == review['university_id']]
        assert len(identity) == 1, 'Exact reviewed identity must already exist'
        identity = identity[0]
        assert identity['country_code'] == review['country_code']
        assert identity['ror'] == review['ror']
        assert identity['city'] == review['official_city']
        assert urlsplit(identity['website']).hostname.removeprefix('www.') == review['official_domain']
        matches = [r for r in corrected if (r['provider'], r['year'], r['name'], r['country_code'], r['url']) ==
                   (review['provider'], review['year'], review['source_name'], review['country_code'], review['source_url'])]
        assert len(matches) == 1, 'Source observation must be exact and unique'
        row = matches[0]
        assert row['university_id'] in (review['original_university_id'], review['university_id']), 'Changed identity requires fresh review'
        if row['university_id'] != review['university_id']:
            changes.append({'source_name': row['name'], 'from': row['university_id'], 'to': review['university_id']})
            row['university_id'] = review['university_id']
    assert source_fingerprint(corrected) == before, 'Publisher fact preservation failed'
    return corrected, {'changes': changes, 'publisher_fact_sha256': before, 'publisher_facts_preserved': True}

def reconcile_snapshots(snapshots, raw_the, rows, receipt, retrieval_date, raw_sha256):
    """Restore a missing snapshot only for an independently reviewed exact link.

    Edition is the publisher's edition, not an invented student census year.
    All unrelated identities and snapshots are retained byte-for-value.
    """
    result = json.loads(json.dumps(snapshots))
    restored = []
    def numeric(value):
        text = str(value if value is not None else '').replace(',', '').replace('%', '').strip()
        return float(text) if re.fullmatch(r'\d+(?:\.\d+)?', text) else None
    for correction in receipt['corrections']:
        if correction['provider'] != 'the':
            continue
        linked = [row for row in rows if (row['provider'], row['year'], row['name'], row['country_code'], row['url']) ==
                  (correction['provider'], correction['year'], correction['source_name'], correction['country_code'], correction['source_url'])]
        assert len(linked) == 1 and linked[0]['university_id'] == correction['university_id']
        source = [row for row in raw_the if row.get('name') == correction['source_name']
                  and row.get('location') == linked[0]['country']
                  and 'https://www.timeshighereducation.com' + row.get('url', '') == correction['source_url']
                  and str(row.get('rank')) == linked[0]['rank_label']]
        assert len(source) == 1, 'Exact original publisher snapshot is required'
        source = source[0]
        international = numeric(source.get('stats_pc_intl_students'))
        ratio = str(source.get('stats_female_male_ratio', ''))
        snapshot = {
            'edition': correction['year'],
            'subjects': [v.strip() for v in source.get('subjects_offered', '').split(',') if v.strip()],
            'source_url': correction['source_url'],
            'students': numeric(source.get('stats_number_students')),
            'student_staff_ratio': numeric(source.get('stats_student_staff_ratio')),
            'international_percent': international if international is not None and 0 <= international <= 100 else None,
            'female_male_ratio': ratio if re.fullmatch(r'\d+\s*:\s*\d+', ratio) else None,
            'evidence': {
                'provider': 'Times Higher Education', 'retrieved_at': retrieval_date,
                'raw_snapshot_sha256': raw_sha256,
                'scope': 'Publisher institution snapshot; student census year not specified',
                'source_name': correction['source_name'], 'verification_status': 'verified_source_identity',
                'identity_reviewed_at': receipt['reviewed_at'],
            },
        }
        key = correction['university_id']
        existing = result.get(key)
        assert existing is None or existing.get('source_url') == snapshot['source_url'], 'Conflicting snapshot requires fresh review'
        if existing != snapshot:
            result[key] = snapshot
            restored.append({'university_id': key, 'source_name': correction['source_name'], 'source_url': snapshot['source_url']})
    changed = {key for key in set(snapshots) | set(result) if snapshots.get(key) != result.get(key)}
    assert changed <= {row['university_id'] for row in receipt['corrections']}, 'Unrelated snapshots must remain unchanged'
    return result, {'restored': restored, 'unrelated_snapshots_preserved': True, 'raw_snapshot_sha256': raw_sha256}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Apply reviewed identity metadata only to derived bundles')
    args = parser.parse_args()
    receipt = json.loads((OUT / 'reviewed-ranking-identities-oct10.json').read_text())
    directory = json.loads((OUT / 'global-directory.json').read_text())
    prepared = []
    for name in ['ranking-all.json', 'ranking-records.json']:
        rows, report = reconcile(json.loads((OUT / name).read_text()), directory, receipt)
        prepared.append((name, rows, report))
    raw_path = ROOT / 'data/raw/rankings/the-2026.json'
    manifest = json.loads((OUT / 'ranking-manifest.json').read_text())
    snapshots, snapshot_report = reconcile_snapshots(
        json.loads((OUT / 'publisher-students.json').read_text()),
        json.loads(raw_path.read_text())['data'], prepared[0][1], receipt,
        manifest['retrieved_at'], hashlib.sha256(raw_path.read_bytes()).hexdigest(),
    )
    if args.apply:
        for name, rows, _ in prepared:
            (OUT / name).write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n')
        (OUT / 'publisher-students.json').write_text(json.dumps(snapshots, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({'applied': args.apply, 'files': {name: report for name, _, report in prepared}, 'publisher_snapshots': snapshot_report}, indent=2))

if __name__ == '__main__':
    main()
