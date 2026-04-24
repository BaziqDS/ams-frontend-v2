"use client";

import { useParams } from "next/navigation";
import { ItemBatchesView } from "@/components/ItemModuleViews";

export default function ItemBatchesPage() {
  const params = useParams<{ id: string }>();
  return <ItemBatchesView itemId={params.id} />;
}
