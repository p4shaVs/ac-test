import { PageHeader } from "@/components/ui";
import { NewServerFlow } from "./new-server";

export const dynamic = "force-dynamic";

export default function NewServerPage() {
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return (
    <>
      <PageHeader
        title="New server"
        description="Enter your licence key, create the server and complete the server.cfg setup."
      />
      <NewServerFlow appUrl={appUrl} />
    </>
  );
}
