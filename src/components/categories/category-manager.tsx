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
import { CategoryIcon } from "@/components/expenses/category-icon";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { createCategory, updateCategory, deleteCategory } from "@/lib/actions/category-actions";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/lib/constants";
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface CategoryItem {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  expenseCount: number;
}

export function CategoryManager({ categories }: { categories: CategoryItem[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CategoryItem | null>(null);
  const [loading, setLoading] = useState(false);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(cat: CategoryItem) {
    setEditing(cat);
    setDialogOpen(true);
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      const result = editing
        ? await updateCategory(editing.id, formData)
        : await createCategory(formData);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Category updated" : "Category created");
      setDialogOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setLoading(true);
    try {
      const result = await deleteCategory(deleteId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Category deleted");
    } finally {
      setDeleteId(null);
      setLoading(false);
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <Card key={cat.id} className="group">
            <CardContent className="flex items-center gap-3 p-4">
              <CategoryIcon icon={cat.icon} color={cat.color} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{cat.name}</p>
                <p className="text-xs text-muted-foreground">
                  {cat.expenseCount} expense{cat.expenseCount !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEdit(cat)}
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => setDeleteId(cat.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card
          className="border-dashed cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={openNew}
        >
          <CardContent className="flex items-center justify-center gap-2 p-4 h-full text-muted-foreground">
            <Plus className="h-5 w-5" />
            <span>Add Category</span>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Category" : "New Category"}
            </DialogTitle>
          </DialogHeader>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={editing?.name}
                placeholder="Category name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icon">Icon</Label>
              <Select name="icon" defaultValue={editing?.icon || "receipt"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ICONS.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      {icon}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((color) => (
                  <label key={color} className="cursor-pointer">
                    <input
                      type="radio"
                      name="color"
                      value={color}
                      defaultChecked={editing ? editing.color === color : color === "#6366f1"}
                      className="sr-only peer"
                    />
                    <div
                      className="w-8 h-8 rounded-full ring-2 ring-transparent peer-checked:ring-foreground peer-checked:ring-offset-2 ring-offset-background transition-all"
                      style={{ backgroundColor: color }}
                    />
                  </label>
                ))}
              </div>
            </div>
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
        title="Delete category"
        description="This will permanently delete this category. Expenses using this category must be reassigned first."
        onConfirm={handleDelete}
        loading={loading}
      />
    </>
  );
}
