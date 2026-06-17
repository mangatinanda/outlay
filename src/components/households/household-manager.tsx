"use client";

import { Check, Edit, Home, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MotionCard } from "@/components/motion/motion-card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateHouseholdAccent } from "@/lib/actions/accent-actions";
import {
  createHousehold,
  deleteHousehold,
  renameHousehold,
  switchHousehold,
} from "@/lib/actions/household-actions";
import { CURRENCIES } from "@/lib/constants";
import { ACCENT_KEYS, ACCENTS, type AccentKey } from "@/lib/theme/palette";
import { cn } from "@/lib/utils";

interface HouseholdItem {
  id: string;
  name: string;
  currency: string;
  accent: string | null;
}

export function HouseholdManager({
  households,
  currentId,
}: {
  households: HouseholdItem[];
  currentId: string | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HouseholdItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(h: HouseholdItem) {
    setEditing(h);
    setDialogOpen(true);
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      const result = editing
        ? await renameHousehold(editing.id, formData)
        : await createHousehold(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Household updated" : "Household created");
      setDialogOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setLoading(true);
    try {
      const result = await deleteHousehold(deleteId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Household deleted");
    } finally {
      setDeleteId(null);
      setLoading(false);
    }
  }

  async function handleSwitch(id: string) {
    if (id === currentId) return;
    const result = await switchHousehold(id);
    if (result?.error) toast.error(result.error);
  }

  async function handleAccent(id: string, accent: AccentKey | null) {
    const result = await updateHouseholdAccent(id, accent);
    if (result?.error) toast.error(result.error);
  }

  return (
    <>
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {households.map((h) => (
          <StaggerItem key={h.id}>
            <MotionCard className="group space-y-3 rounded-2xl bg-card p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Home className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display font-medium">{h.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {h.currency}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label={`Rename ${h.name}`}
                    onClick={() => openEdit(h)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    aria-label={`Delete ${h.name}`}
                    onClick={() => setDeleteId(h.id)}
                    disabled={households.length <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <fieldset className="flex items-center gap-1.5">
                <legend className="sr-only">Accent color for {h.name}</legend>
                {ACCENT_KEYS.map((key) => {
                  const selected = h.accent === key;
                  return (
                    <label
                      key={key}
                      className={cn(
                        "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 transition-colors focus-within:ring-2 focus-within:ring-ring",
                        selected
                          ? "border-foreground"
                          : "border-transparent hover:border-border",
                      )}
                      style={{ backgroundColor: ACCENTS[key].primary }}
                    >
                      <input
                        type="radio"
                        name={`accent-${h.id}`}
                        value={key}
                        checked={selected}
                        onChange={() => handleAccent(h.id, key)}
                        className="sr-only"
                        aria-label={ACCENTS[key].label}
                      />
                      {selected && (
                        <Check
                          className="h-3.5 w-3.5"
                          style={{ color: ACCENTS[key].primaryForeground }}
                        />
                      )}
                    </label>
                  );
                })}
                {h.accent && (
                  <button
                    type="button"
                    onClick={() => handleAccent(h.id, null)}
                    className="ml-1 text-muted-foreground text-xs hover:text-foreground"
                    aria-label={`Reset accent for ${h.name}`}
                  >
                    Reset
                  </button>
                )}
              </fieldset>
              {h.id === currentId ? (
                <Badge variant="secondary" className="gap-1">
                  <Check className="h-3 w-3" /> Active
                </Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleSwitch(h.id)}
                >
                  Switch to this household
                </Button>
              )}
            </MotionCard>
          </StaggerItem>
        ))}

        <StaggerItem>
          <MotionCard
            className="flex h-full min-h-[120px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border border-dashed bg-card/50 p-4 text-muted-foreground transition-colors hover:bg-accent/50"
            onClick={openNew}
            role="button"
            tabIndex={0}
            aria-label="New household"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openNew();
              }
            }}
          >
            <Plus className="h-5 w-5" />
            <span>New household</span>
          </MotionCard>
        </StaggerItem>
      </Stagger>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Rename household" : "New household"}
            </DialogTitle>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={editing?.name}
                placeholder="e.g. Beach House"
                required
              />
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select name="currency" defaultValue="INR">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.symbol} {c.name} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete household"
        description="This permanently deletes the household and all of its expenses, categories, and members. This cannot be undone."
        onConfirm={handleDelete}
        loading={loading}
      />
    </>
  );
}
