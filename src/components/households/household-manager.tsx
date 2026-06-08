"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CURRENCIES } from "@/lib/constants";
import {
  createHousehold,
  renameHousehold,
  deleteHousehold,
  switchHousehold,
} from "@/lib/actions/household-actions";
import { Home, Plus, Edit, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

interface HouseholdItem {
  id: string;
  name: string;
  currency: string;
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

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {households.map((h) => (
          <Card key={h.id} className="group">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Home className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{h.currency}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(h)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteId(h.id)}
                    disabled={households.length <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
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
            </CardContent>
          </Card>
        ))}

        <Card
          className="border-dashed cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={openNew}
        >
          <CardContent className="flex items-center justify-center gap-2 p-4 h-full min-h-[120px] text-muted-foreground">
            <Plus className="h-5 w-5" />
            <span>New household</span>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Rename household" : "New household"}</DialogTitle>
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
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
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
