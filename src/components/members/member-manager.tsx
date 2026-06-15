"use client";

import { Crown, Edit, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MotionCard } from "@/components/motion/motion-card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  createMember,
  deleteMember,
  updateMember,
} from "@/lib/actions/member-actions";

interface MemberItem {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
  expenseCount: number;
  totalSpent: number;
}

export function MemberManager({ members }: { members: MemberItem[] }) {
  const formatCurrency = useFormatCurrency();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemberItem | null>(null);
  const [loading, setLoading] = useState(false);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(member: MemberItem) {
    setEditing(member);
    setDialogOpen(true);
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      const result = editing
        ? await updateMember(editing.id, formData)
        : await createMember(formData);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Member updated" : "Member added");
      setDialogOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setLoading(true);
    try {
      const result = await deleteMember(deleteId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Member removed");
    } finally {
      setDeleteId(null);
      setLoading(false);
    }
  }

  return (
    <>
      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description="Add the people in your household so you can track who spent what."
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Add Member
            </Button>
          }
        />
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <StaggerItem key={member.id}>
              <MotionCard className="group space-y-3 rounded-2xl bg-card p-4 shadow-card">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 font-medium text-primary text-sm">
                        {member.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-display font-medium">
                          {member.name}
                        </p>
                        {member.role === "admin" && (
                          // Admin Crown: intentional non-token accent (stock amber),
                          // exempt from token-only rule like the Google brand SVG.
                          <Crown className="h-3.5 w-3.5 text-amber-500" />
                        )}
                      </div>
                      <Badge variant="secondary" className="mt-0.5 text-xs">
                        {member.role}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label={`Edit ${member.name}`}
                      onClick={() => openEdit(member)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive"
                      aria-label={`Remove ${member.name}`}
                      onClick={() => setDeleteId(member.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between text-muted-foreground text-sm">
                  <span>{member.expenseCount} expenses</span>
                  <span className="font-display font-medium text-foreground tabular-nums">
                    {formatCurrency(member.totalSpent)}
                  </span>
                </div>
              </MotionCard>
            </StaggerItem>
          ))}

          <StaggerItem>
            <MotionCard
              className="flex h-full min-h-[120px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border border-dashed bg-card/50 p-4 text-muted-foreground transition-colors hover:bg-accent/50"
              onClick={openNew}
              role="button"
              tabIndex={0}
              aria-label="Add member"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openNew();
                }
              }}
            >
              <Plus className="h-5 w-5" />
              <span>Add Member</span>
            </MotionCard>
          </StaggerItem>
        </Stagger>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Member" : "Add Member"}</DialogTitle>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={editing?.name}
                placeholder="Member name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select name="role" defaultValue={editing?.role || "member"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : editing ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remove member"
        description="This will remove this member from the household. Members with recorded expenses can't be removed — reassign their expenses first."
        onConfirm={handleDelete}
        loading={loading}
      />
    </>
  );
}
