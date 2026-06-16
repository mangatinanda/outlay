"use client";

import { Home } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createHousehold } from "@/lib/actions/household-actions";

export function FirstHousehold() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      const result = await createHousehold(formData);
      if (result?.error) toast.error(result.error);
      // On success createHousehold sets the active-household cookie + revalidates,
      // so the layout re-renders into the full app shell.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-3xl border-0 bg-card shadow-float">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
              <Home className="h-8 w-8" />
            </div>
          </div>
          <div>
            <CardTitle className="font-display text-2xl">
              Create your first household
            </CardTitle>
            <CardDescription className="mt-2">
              You're not part of a household yet. Create one, or ask an existing
              member to invite this email.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Household name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. My Home"
                required
                className="h-12 rounded-xl text-base"
              />
            </div>
            <input type="hidden" name="currency" value="INR" />
            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl text-base"
            >
              {loading ? "Creating…" : "Create household"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
