import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, Navigate, usePath } from "@/router/Router";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { clearTokens } from "@/lib/api-client";

const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,}$/;

const signInSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const roles = [
  { id: "user", label: "User", description: "Search and manage your own leads", icon: UserRound },
  {
    id: "lead",
    label: "Lead",
    description: "Workspace operations without audit access",
    icon: UsersRound,
  },
  {
    id: "admin",
    label: "Admin",
    description: "Full management and audit access",
    icon: ShieldCheck,
  },
];

function roleFromPath(path) {
  if (path === "/login/admin") return "admin";
  if (path === "/login/lead") return "lead";
  return "user";
}

export function LoginPage() {
  const path = usePath();
  const initialRole = roleFromPath(path);
  const [role, setRole] = useState(initialRole);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { user, loading, signIn } = useAuth();

  useDocumentTitle(
    `${role === "admin" ? "Admin" : role === "lead" ? "Lead" : "User"} sign in — LeadFinder`,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    const nextRole = roleFromPath(path);
    if (nextRole !== role) setRole(nextRole);
  }, [path, role]);

  if (!loading && user) return <Navigate to="/" />;

  function selectRole(nextRole) {
    setRole(nextRole);
    setShowPassword(false);
    clearTokens();
    reset({ email: "", password: "" });
    navigate(`/login/${nextRole}`);
  }

  async function onSubmit(values) {
    setSubmitting(true);
    try {
      await signIn(role, values.email, values.password);
      toast.success(
        `Signed in as ${role === "admin" ? "Admin" : role === "lead" ? "Lead" : "User"}`,
      );
      navigate(role === "user" ? "/search" : "/admin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const current = roles.find((item) => item.id === role) || roles[0];
  const Icon = current.icon;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="size-[560px] rounded-full border border-accent/10" />
        <div className="absolute size-[380px] rounded-full border border-accent/10" />
        <div className="absolute size-[200px] rounded-full border border-accent/10" />
      </div>

      <Card className="relative z-10 w-full max-w-lg border-border/70 shadow-xl shadow-black/5">
        <CardHeader className="items-center pb-5 text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-lg shadow-accent/25">
            <Icon className="size-6" />
          </div>
          <CardTitle className="font-display text-2xl tracking-tight">
            {current.label} sign in
          </CardTitle>
          <CardDescription className="max-w-sm">{current.description}</CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface-raised/50 p-1.5">
            {roles.map((item) => {
              const RoleIcon = item.icon;
              const active = role === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectRole(item.id)}
                  className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground"
                  }`}
                >
                  <RoleIcon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  {...register("email")}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Your password"
                    className="pr-11"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>
            </div>

            <CardFooter className="mt-6 flex flex-col gap-4 p-0">
              <Button type="submit" size="default" className="w-full rounded-lg" disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Sign in as {current.label}
              </Button>

              <div className="rounded-xl border border-border/80 bg-surface-raised/40 p-3 text-center text-xs text-muted-foreground">
                Accounts are provisioned by your system administrator. Contact your administrator if you need login credentials.
              </div>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

