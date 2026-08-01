import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, CheckCircle2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import screenPrinting from "@/assets/screen-printing.jpg";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PlateWorks Production Management" },
      { name: "description", content: "Sign in to the PlateWorks plate production management system." },
      { property: "og:title", content: "Sign in — PlateWorks" },
      { property: "og:description", content: "Access plate inventory, jobs and production reports." },
    ],
  }),
  component: AuthPage,
});

const credsSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  fullName: z.string().trim().max(100).optional(),
});

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    if (session) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  const submit = async (mode: "signin" | "signup") => {
    const parsed = credsSchema.safeParse({ email, password, fullName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Visual panel */}
      <div className="relative hidden overflow-hidden lg:block">
        <img
          src={screenPrinting}
          alt="Screen printing press with mesh screens, squeegees and ink in a production workshop"
          width={1280}
          height={1600}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/85 via-primary/60 to-background/95" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-primary-foreground/15 text-primary-foreground backdrop-blur">
              <Layers className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-semibold uppercase tracking-[0.2em] text-primary-foreground">
              PlateWorks
            </span>
          </div>

          <div className="max-w-md">
            <h2 className="font-display text-4xl font-semibold leading-tight text-primary-foreground">
              Every plate, screen and offcut — accounted for.
            </h2>
            <p className="mt-4 text-sm text-primary-foreground/80">
              Plate printing production control: inventory, nesting optimisation, cycle counts and
              shop-floor scanning in one system.
            </p>
            <ul className="mt-8 space-y-3">
              {[
                "42×60 plate optimisation with offcut reuse",
                "Barcode & QR scan to consume",
                "Multi-warehouse transfers & cycle counts",
                "Role-based access with full audit trail",
              ].map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-primary-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary-foreground/70" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-primary-foreground/60">
            © {new Date().getFullYear()} PlateWorks. Production control system.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-primary text-primary-foreground">
              <Layers className="h-4 w-4" />
            </div>
            <span className="font-display text-base font-semibold uppercase tracking-[0.2em]">
              PlateWorks
            </span>
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-5 pt-8">
              <div>
                <h1 className="font-display text-2xl font-semibold">Sign in to your workspace</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your work email and password below.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" disabled={loading} onClick={() => submit("signin")}>
                Sign in
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-5 pt-8">
              <div>
                <h1 className="font-display text-2xl font-semibold">Create your account</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Join the production floor in under a minute.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email2">Work email</Label>
                <Input
                  id="email2"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password2">Password</Label>
                <Input
                  id="password2"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The first account created becomes the Administrator. Later accounts start as
                Production Operator and can be promoted from Settings.
              </p>
              <Button className="w-full" disabled={loading} onClick={() => submit("signup")}>
                Create account
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

