"use client";

import { useParams } from "next/navigation";
import { CategoryListView } from "@/components/CategoryListView";

export default function CategoryChildrenPage() {
  const params = useParams<{ id: string }>();
  return <CategoryListView variant="children" parentId={params.id} />;
}
