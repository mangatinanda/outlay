import { ShieldCheck } from "lucide-react";
import { PasscodeForm } from "@/components/auth/passcode-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Admin access" };

export default function AdminPage() {
  return (
    <Card className="w-full max-w-md rounded-3xl border-0 bg-card shadow-float">
      <CardHeader className="space-y-4 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
            <ShieldCheck className="h-8 w-8" />
          </div>
        </div>
        <div>
          <CardTitle className="font-display text-2xl">Admin access</CardTitle>
          <CardDescription className="mt-2">
            Enter the passcode to manage every household
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <PasscodeForm />
      </CardContent>
    </Card>
  );
}
