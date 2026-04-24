"use client";

import { useParams } from "next/navigation";
import { ItemStandaloneDistributionView } from "@/components/ItemModuleViews";

export default function ItemStandaloneDistributionPage() {
  const params = useParams<{ id: string; standaloneId: string }>();
  return <ItemStandaloneDistributionView itemId={params.id} standaloneId={params.standaloneId} />;
}
