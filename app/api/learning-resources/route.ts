import { publicDatabase } from "@/server/hosted-catalogue";
import { publicReadCache } from "@/server/public-read-cache";
import { latestResources, type LearningResource } from "@/lib/learning-resources";
const cache = publicReadCache<LearningResource[]>(1, 60000);
export async function GET() {
  try {
    const resources = await cache("official-resources", async () => {
      const { data, error } = await publicDatabase().from("learning_resources")
        .select("id,slug,title,provider,kind,subject,url,summary,access,country_code,population,publication_year,retrieved_at,verification_state,reuse_mode,steps,evidence")
        .eq("published", true).eq("verification_state", "verified")
        .order("retrieved_at", { ascending: false }).limit(100).abortSignal(AbortSignal.timeout(8000));
      if (error) throw error;
      return latestResources(data as LearningResource[]);
    });
    return Response.json({ resources, source: "hosted", questionImports: 0 }, { headers: { "Cache-Control": "public,max-age=60" } });
  } catch {
    return Response.json({ error: "Official resources could not refresh. The checked catalogue remains available." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
