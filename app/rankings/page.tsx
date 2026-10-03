import Rankings from "@/pages-ui/rankings";
import { regionalIdentities } from "@/server/regional-identities";
export default function RankingsPage() { return <Rankings regionalUniversities={regionalIdentities()} />; }
