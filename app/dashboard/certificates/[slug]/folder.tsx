"use client";
import { notFound } from "next/navigation";
import { CertificateFolder } from "@/components/college/certificates-library";
import { examBySlug } from "@/lib/certificates";

// Resolved where the exam data already lives (the browser and SSR bundles), so the
// server component never imports the 1.7 MB lesson and question data into the Worker.
export default function Folder({ slug }: { slug: string }) {
  const exam = examBySlug(slug);
  if (!exam) notFound();
  return <CertificateFolder exam={exam} />;
}
