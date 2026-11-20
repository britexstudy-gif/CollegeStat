import { AssistantChat } from "./assistant-chat";
import { serverConfig } from "@/server/config";
import { aiConnected } from "@/services/openrouter-provider";
export default function StudentAssistantPage() {
  const config = serverConfig();
  return <AssistantChat connected={aiConnected(config)} />;
}
