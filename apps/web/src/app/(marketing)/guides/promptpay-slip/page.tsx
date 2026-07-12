import type { Metadata } from "next";

import {
  GuideArticle,
  guideMetadata,
} from "@/components/guides/guide-article";

export async function generateMetadata(): Promise<Metadata> {
  return guideMetadata("payment");
}

export default function PaymentGuidePage() {
  return <GuideArticle slug="payment" />;
}
