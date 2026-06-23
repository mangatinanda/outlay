"use client";

import { Check, ChevronsUpDown, Home, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { useHouseholds } from "@/components/providers/household-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchHousehold } from "@/lib/actions/household-actions";
import { withProgress } from "@/lib/progress";

export function HouseholdSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { households, currentId } = useHouseholds();
  const [pending, startTransition] = useTransition();
  const current = households.find((h) => h.id === currentId) ?? households[0];

  function onSwitch(id: string) {
    if (id === current?.id) return;
    onNavigate?.();
    startTransition(async () => {
      const result = await withProgress(() => switchHousehold(id));
      if (result?.error) toast.error(result.error);
    });
  }

  // No household yet: there's nothing to switch between, so offer a direct
  // path to create one instead of a dead, disabled dropdown.
  if (households.length === 0) {
    return (
      <Link
        href="/households"
        onClick={onNavigate}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Plus className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 truncate text-left font-medium">
          Create household
        </span>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-50"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Home className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 truncate text-left font-medium">
          {current?.name ?? "Household"}
        </span>
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Households</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {households.map((h) => (
          <DropdownMenuItem key={h.id} onClick={() => onSwitch(h.id)}>
            <Home className="h-4 w-4" />
            <span className="flex-1 truncate">{h.name}</span>
            {h.id === current?.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onNavigate}
          render={<Link href="/households" />}
        >
          <Settings2 className="h-4 w-4" />
          Manage households
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
