import UniversitiesPage from "@/app/universities/page";
export default function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <UniversitiesPage {...props} routeBase="/dashboard/universities" />;
}
