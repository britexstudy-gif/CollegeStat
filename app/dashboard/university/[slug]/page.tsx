import UniversityPage from "@/app/university/[slug]/page";
export default function Page(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <UniversityPage {...props} routeBase="/dashboard/university" />;
}
