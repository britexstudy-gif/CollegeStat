import type { University } from '@/lib/domain';

/** Cards keep their evidence, but course and paper libraries load on the profile route. */
export function discoveryPreview(u: University): University {
  const cardMetrics = new Set(['acceptance_rate','enrollment_12_month','tuition_in_state','tuition_out_of_state','fees_out_of_state']);
  return { ...u, profile_resources: undefined, reported_programs: [], university_programs: [], departments: [], professors: [], research: [], requirements: [],
    application_brief: undefined, research_identity: undefined,
    imported_records: u.imported_records?.filter(r => cardMetrics.has(r.metric)),
  };
}
