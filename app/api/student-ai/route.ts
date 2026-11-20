import { consumePlanQuota } from "@/server/plan-quota";
import { abortable } from "@/lib/abortable";
import {
  handleStudentAI,
  type StudentAIEvidence,
} from "@/server/student-ai-handler";
import { authenticate, sameOrigin, serverConfig } from "@/server/config";
import { aiConnected, connectedAIJSON } from "@/services/openrouter-provider";
import { hostedUniversities } from "@/server/hosted-catalogue";
import { evidenceFor } from "@/services/ai-provider";
import { learningResources } from "@/lib/learning-resources";
import { countryName } from "@/lib/domain";

export async function POST(request: Request) {
  const config = serverConfig();
  return handleStudentAI(request, {
    sameOrigin,
    authenticate: async (request, signal) => {
      const auth = await abortable(authenticate(request), signal);
      if (!auth?.user?.id) return null;
      return {
        owner: auth.user.id,
        consumeLimit: async () => {
          if (!(await consumePlanQuota(auth.db, auth.user.id, "ai", signal)).ok) return false;
          const { data, error } = await auth.db
            .rpc("consume_student_ai_limit")
            .abortSignal(signal);
          return !error && data === true;
        },
      };
    },
    configured: () => aiConnected(config),
    evidence: async (input, signal) => {
      const facts: StudentAIEvidence[] = [];
      if (input.university_id) {
        const rows = await abortable(
          hostedUniversities([input.university_id]),
          signal,
        );
        if (input.mode === "application_review")
          for (const fact of evidenceFor(rows).slice(0, 8))
            facts.push({
              id: fact.id,
              title: fact.university + " · " + fact.metric,
              detail: `${fact.value} ${fact.unit}. ${fact.notes || ""}`.slice(
                0,
                450,
              ),
              url: fact.url,
              reporting_year: fact.year,
              population: fact.population || fact.scope,
            });
        const u = rows[0];
        if (u)
          for (const requirement of u.requirements
            .filter(
              (r) =>
                r.verification_status === "verified" &&
                (input.mode !== "certificate_practice" ||
                  !input.certificate ||
                  r.kind.toLowerCase().includes(input.certificate)),
            )
            .slice(0, 6)) {
            const url = requirement.source_url || requirement.data_sources?.url;
            if (!url || !url.startsWith("https://")) continue;
            facts.push({
              id: "requirement:" + requirement.id,
              title: u.name + " · " + requirement.kind,
              detail: JSON.stringify({
                minimum: requirement.minimum,
                notes: requirement.notes,
                program_id: requirement.program_id,
              }).slice(0, 450),
              url,
              reporting_year: requirement.year,
              population:
                requirement.evidence?.population ||
                requirement.evidence?.scope ||
                null,
            });
          }
      }
      // Only checked public link metadata, not private profile or saved-writing content.
      const destination = input.country.trim().toLowerCase();
      const guides = learningResources.filter(
        (resource) =>
          resource.verification_state === "verified" &&
          (input.mode === "certificate_practice"
            ? resource.kind === "practice" &&
              (!input.certificate ||
                resource.subject.toLowerCase().includes(input.certificate))
            : resource.kind === "destination") &&
          (!destination ||
            !resource.country_code ||
            [
              resource.country_code.toLowerCase(),
              countryName(resource.country_code).toLowerCase(),
            ].includes(destination)),
      );
      for (const guide of guides.slice(0, 4))
        facts.push({
          id: "guide:" + guide.slug,
          title: guide.title,
          detail: guide.summary.slice(0, 450),
          url: guide.url,
          reporting_year: guide.publication_year,
          population: guide.population,
        });
      return facts;
    },
    generate: (system, input, schema, signal) =>
      connectedAIJSON(config, {
        system,
        input,
        schema,
        name: "student_rehearsal",
        maxTokens: 1800,
        signal,
      }),
  });
}
