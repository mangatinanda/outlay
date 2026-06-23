import { PageSkeleton } from "@/components/feedback/page-skeleton";

// This route renders its data without an in-page <Suspense> boundary, so a
// route-level fallback gives instant feedback while the segment loads.
export default function Loading() {
  return <PageSkeleton />;
}
