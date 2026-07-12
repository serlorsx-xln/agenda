import type { Metadata } from "next";

import {
  GuideArticle,
  guideMetadata,
} from "@/components/guides/guide-article";

export async function generateMetadata(): Promise<Metadata> {
  return guideMetadata("account");
}

export default function AccountGuidePage() {
  return <GuideArticle slug="account" />;
}
