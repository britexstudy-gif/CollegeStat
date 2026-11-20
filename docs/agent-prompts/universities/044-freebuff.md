# Public university people and media research: Institut Polytechnique de Paris

Task 044 · provider Freebuff · review date 2026-10-16
University ID: 9f3cf72f-ca1e-5831-b48d-e5747fb631d6
Official university website: https://www.ip-paris.fr
Scope: identity_people_media

Research only this institution using public official university pages and official channels linked from the university website. Inspect exact source pages rather than guessing paths or video IDs. You are working in a temporary public research folder. Never read a repository, parent directories, environment variables, credentials, personal files, accounts or private student profiles. Do not change settings, submit forms, send messages, run SQL, publish or import anything. Write only `report.json` in this working directory. If file writing is unavailable, emit the complete JSON in your final response.

Find accurate evidence for:

1. The legal/official university name, campus/city, founding date and founders. Distinguish institutional founding from a predecessor, charter, merger, rename or benefactor.
2. Influential alumni, founders, leaders and faculty, only where an official biography explicitly establishes the relationship and relevant achievement. Label each person's relationship accurately. A donor or founder is not automatically an alumnus. Public student ambassadors or admitted-student stories may be linked only if already published by the university; never look for private accepted-applicant identities or imply admission guarantees.
3. Official logo/brand assets and actual asset URL if explicitly available. Record the brand guidance/permission page. Do not assume a logo may be freely redistributed.
4. Official campus galleries, virtual tours, student life and campus photography. Record the gallery URL, caption, creator/credit and explicit reuse licence or `permission_not_verified`. Link metadata only; do not download image files or substitute generic stock/generated imagery.
5. University video portfolio: inspect official campus tours, student-life/department introductions and admissions videos. Retain actual YouTube/video URL, title, official channel and a university webpage establishing the channel's affiliation. Include dates/duration only if verified. If no individual video can be inspected, link the verified official channel and say individual videos are missing. Never guess a video ID or call a third-party channel official.

Work for at most four minutes. Aim for 6–12 inspected primary sources and a useful partial report rather than invented completeness. Every fact needs an inspected URL, reporting/publication year or null, retrieval date, precise relationship/scope and a short evidence paraphrase. No copied article bodies, large quotations, biographies, scraped image binaries or protected datasets. All output remains a candidate pending a separate native review.

Return this JSON shape with actual values; do not repeat this example as your answer:

```json
{
  "schemaVersion": 1,
  "universityId": "9f3cf72f-ca1e-5831-b48d-e5747fb631d6",
  "university": "Institut Polytechnique de Paris",
  "provider": "freebuff",
  "scope": "identity_people_media",
  "checkedAt": "2026-10-16",
  "reviewState": "pending_native_review",
  "facts": [
    {
      "field": "campus_gallery",
      "value": {"title": "Actual gallery title", "url": "https://official.example.edu/exact-gallery", "permission": "permission_not_verified"},
      "sourceUrl": "https://official.example.edu/exact-gallery",
      "sourceTitle": "Actual page title",
      "publisher": "Actual publisher",
      "sourceYear": null,
      "retrievedAt": "2026-10-16",
      "population": "Exact campus, person relationship or media context",
      "evidence": "Short paraphrase of the inspected evidence",
      "reuse": "metadata_link_only"
    }
  ],
  "missing": [{"field": "unverified_field", "reason": "Specific evidence gap"}],
  "conflicts": []
}
```

Allowed fact fields: official_name, campus, founded, founder, influential_person, student_story, official_logo, brand_guidance, campus_gallery, campus_photo, virtual_tour, official_video_channel, university_video.
Finish with `RESEARCH_COMPLETE` after saving or emitting the final JSON.
