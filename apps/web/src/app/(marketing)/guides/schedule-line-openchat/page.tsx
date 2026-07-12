import type { Metadata } from "next";

import {
  GuideArticle,
  guideMetadata,
} from "@/components/guides/guide-article";

export async function generateMetadata(): Promise<Metadata> {
  return guideMetadata("schedule");
}

export default function ScheduleGuidePage() {
  return <GuideArticle slug="schedule" />;
}
