"use client";
import { GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
import { Scholarship, University } from "@/lib/domain";
import { scholarshipCampusMedia } from "@/lib/scholarship-media";
import { useCollege } from "./provider";
import { UniversityLogo } from "./primitives";
import { CampusImage } from "./campus-image";

const identities = new Map<string, Promise<University | undefined>>();
function loadIdentity(id: string) {
  let request = identities.get(id);
  if (!request) {
    request = fetch("/api/catalog?mode=identity&ids=" + encodeURIComponent(id))
      .then(async response => {
        if (!response.ok) throw new Error("University identity unavailable");
        const rows = await response.json() as University[];
        return rows.find(row => row.id === id);
      }).catch(() => { identities.delete(id); return undefined; });
    identities.set(id, request);
  }
  return request;
}

/** Documentary campus media only; the scholarship remains a separate record. */
export function AwardIdentity({ award }: { award: Scholarship }) {
  const { universities } = useCollege();
  const link = award.university_scholarships[0];
  const [loaded, setLoaded] = useState<University>();
  const listed = universities.find((u) => u.id === link?.university_id);
  const university = loaded?.id === link?.university_id ? loaded : listed;
  const id = link?.university_id;
  useEffect(() => {
    if (!id || listed) return;
    let live = true;
    loadIdentity(id).then(value => { if (live) setLoaded(value); });
    return () => { live = false; };
  }, [id, listed]);
  const media = (id && scholarshipCampusMedia.get(id)) || university?.media.find(
    (m) =>
      m.reuse_permitted &&
      m.verification_status === "verified" &&
      m.kind === "campus",
  );
  return (
    <div className={"award-identity " + (media ? "has-campus" : "")}>
      {media ? (
        <CampusImage media={media} universityName={university?.name || link?.universities?.name} />
      ) : (
        <div className="award-identity-pattern" aria-hidden="true">
          <GraduationCap size={54} strokeWidth={1} />
        </div>
      )}
      <div className="award-institution">
        {university ? (
          <UniversityLogo university={university} size="sm" />
        ) : (
          <GraduationCap size={22} aria-hidden="true" />
        )}
        <span>
          {university?.name ||
            link?.universities?.name ||
            "Official scholarship programme"}
        </span>
      </div>
    </div>
  );
}
