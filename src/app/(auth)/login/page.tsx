import { Home } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasscodeForm } from "@/components/auth/passcode-form";

export default function LoginPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground">
            <Home className="h-8 w-8" />
          </div>
        </div>
        <div>
          <CardTitle className="text-2xl">Welcome to Outlay</CardTitle>
          <CardDescription className="mt-2">
            Enter your household passcode to continue
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <PasscodeForm />
      </CardContent>
    </Card>
  );
}
