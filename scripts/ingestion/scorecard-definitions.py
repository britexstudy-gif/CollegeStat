#!/usr/bin/env python3
"""Rebuild the checked Scorecard field/cohort contract from the installed dictionary.
No fetch, no institution import, and no inferred cohort dates. Requires openpyxl.
"""
import hashlib, json, pathlib
import openpyxl
ROOT=pathlib.Path(__file__).resolve().parents[2]; RAW=ROOT/'data/raw/scorecard'
FIELDS={'admission_rate.overall','sat_scores.25th_percentile.critical_reading','sat_scores.75th_percentile.critical_reading','sat_scores.25th_percentile.math','sat_scores.75th_percentile.math','act_scores.25th_percentile.cumulative','act_scores.75th_percentile.cumulative','size','tuition.in_state','tuition.out_of_state','avg_net_price.public','avg_net_price.private','completion_rate_4yr_150nt','completion_rate_less_than_4yr_150nt','median_debt.completers.overall','pell_grant_rate','10_yrs_after_entry.median'}
def main():
    meta=json.loads((RAW/'dictionary.xlsx.meta.json').read_text())
    assert meta['url']=='https://collegescorecard.ed.gov/files/CollegeScorecardDataDictionary.xlsx'
    assert hashlib.sha256((RAW/'dictionary.xlsx').read_bytes()).hexdigest()==meta['sha256']
    book=openpyxl.load_workbook(RAW/'dictionary.xlsx',read_only=True,data_only=True)
    entries={r[2]:{'variable':r[5],'notes':r[10],'label':r[0]} for r in list(book['Institution_Data_Dictionary'].values)[1:] if r[2] in FIELDS}
    assert set(entries)==FIELDS,'Dictionary field missing: review provider changes before release'
    cohorts=list(book['Institution_Cohort_Map'].values);columns={n:i for i,n in enumerate(cohorts[0]) if n and str(n).startswith('MERGED_')}
    definitions={k:v|{'cohorts_by_file':{n:row[i] for n,i in columns.items() if row[i] not in (None,'NA')}} for k,v in entries.items() for row in cohorts[1:] if row[0]==v['variable']}
    assert len(definitions)==17
    (ROOT/'data/published/scorecard-field-definitions.json').write_text(json.dumps({'source':meta,'definitions':definitions},indent=2)+'\n')
    print(json.dumps({'definitions':len(definitions),'live_adapter_fields':15,'note':'Debt and earnings lack a merged-file cohort in this contract; not enabled in the live adapter'}))
if __name__=='__main__':main()
