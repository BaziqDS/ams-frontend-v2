"use client";

import { useParams } from "next/navigation";
import { ItemDistributionView } from "@/components/ItemModuleViews";

export default function ItemDistributionPage() {
  const params = useParams<{ id: string }>();
  return <ItemDistributionView itemId={params.id} />;
}
