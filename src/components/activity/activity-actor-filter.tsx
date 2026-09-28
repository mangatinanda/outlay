"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EVERYONE = "__everyone__";

/**
 * "Who did it" filter for the activity feed. URL-driven (`?actor=`) so a
 * filtered feed survives a refresh and can be shared as a link, like the
 * expense filters.
 */
export function ActivityActorFilter({
  actors,
  actor,
}: {
  actors: string[];
  actor?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // A label from the URL that no longer appears in the feed still needs an
  // option, or the select would render blank.
  const options =
    actor && !actors.includes(actor) ? [actor, ...actors] : actors;

  function onChange(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === EVERYONE) params.delete("actor");
    else params.set("actor", value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="activity-actor" className="text-muted-foreground text-sm">
        Show
      </Label>
      <Select value={actor ?? EVERYONE} onValueChange={onChange}>
        <SelectTrigger id="activity-actor" className="min-h-11 w-48">
          <SelectValue placeholder="Everyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EVERYONE}>Everyone</SelectItem>
          {options.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
