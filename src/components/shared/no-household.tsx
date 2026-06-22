import { Home, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Shown on any page when the signed-in user belongs to no household yet. New
 * members enter the app freely (no forced onboarding) and see this on each
 * menu — a gentle nudge to create their first household when they're ready.
 * The CTA routes to /households, where the create form already lives.
 */
export function NoHousehold({
  title = "Welcome to Outlay",
  description = "Create a household to start tracking shared expenses. You can invite the rest of your home once it's set up.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      icon={Home}
      title={title}
      description={description}
      action={
        <Button nativeButton={false} render={<Link href="/households" />}>
          <Plus className="mr-2 h-4 w-4" /> Create household
        </Button>
      }
    />
  );
}
