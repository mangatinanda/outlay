"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { createMember, updateMember, deleteMember } from "@/lib/actions/member-actions";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { Plus, Edit, Trash2, Crown } from "lucide-react";
import { toast } from "sonner";

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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => (
          <Card key={member.id} className="group">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {member.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{member.name}</p>
                      {member.role === "admin" && (
                        <Crown className="h-3.5 w-3.5 text-yellow-500" />
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs mt-0.5">
                      {member.role}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(member)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteId(member.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{member.expenseCount} expenses</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(member.totalSpent)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card
          className="border-dashed cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={openNew}
        >
          <CardContent className="flex items-center justify-center gap-2 p-4 h-full min-h-[120px] text-muted-foreground">
            <Plus className="h-5 w-5" />
            <span>Add Member</span>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Member" : "Add Member"}
            </DialogTitle>
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
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
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
        description="This will remove this member from the household. Their expense history will be preserved."
        onConfirm={handleDelete}
        loading={loading}
      />
    </>
  );
}
