"use client";

import { useParams } from "next/navigation";
import { LocationListView } from "@/components/LocationListView";

export default function LocationChildrenPage() {
  const params = useParams<{ id: string }>();
  return <LocationListView variant="children" parentId={params.id} />;
}
