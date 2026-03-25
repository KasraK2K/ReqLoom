import { LockKeyhole, LogIn } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";

interface LoginPageProps {
  onSubmit: (username: string, password: string) => Promise<void>;
}

export function LoginPage({ onSubmit }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(username, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-accent/20 p-3 text-accent">
              <LogIn className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Sign In To HttpClient</CardTitle>
              <p className="mt-1 text-sm text-muted">REST-only workspace access with secure cookie sessions.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <label className="text-sm text-muted">Username</label>
            <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="admin" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted">Password</label>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="********" />
          </div>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting || !username || !password}>
            <LockKeyhole className="h-4 w-4" />
            {isSubmitting ? "Signing In..." : "Login"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
