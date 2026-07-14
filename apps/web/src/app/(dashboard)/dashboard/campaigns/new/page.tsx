import { redirect } from "next/navigation";

import { getTemplates } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function NewCampaignPage() {
  const user = await requireUser();
  const templates = await getTemplates(user.id);
  if (templates.length === 0) {
    redirect("/dashboard/templates?need=campaign");
  }
  redirect("/dashboard/campaigns?new=1");
}
