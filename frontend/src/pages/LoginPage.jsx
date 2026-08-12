import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Eye, EyeOff, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, Navigate } from "@/router/Router";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { clearTokens } from "@/lib/api-client";

const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,}$/;

const signInSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120, "Name is too long"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().regex(strongPassword, "Use 10+ characters with uppercase, lowercase, number, and special character"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

const passwordRules = [
  ["10+ characters", (p) => p.length >= 10],
  ["Uppercase letter", (p) => /[A-Z]/.test(p)],
  ["Lowercase letter", (p) => /[a-z]/.test(p)],
  ["Number", (p) => /\d/.test(p)],
  ["Special character", (p) => /[^A-Za-z\d]/.test(p)],
];

export function LoginPage() {
  useDocumentTitle("Sign in — Ranked Local Business Leads");

  const [mode, setMode] = useState("signIn");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const navigate = useNavigate();
  const { user, loading, signIn, signUp } = useAuth();

  const schema = mode === "signIn" ? signInSchema : signUpSchema;
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });

  if (!loading && user) return <Navigate to="/" />;

  function switchMode(nextMode) {
    setMode(nextMode);
    setPasswordValue("");
    setShowPassword(false);
    setShowConfirm(false);
    reset({ fullName: "", email: "", password: "", confirmPassword: "" });
  }

  async function onSubmit(values) {
    setSubmitting(true);
    try {
      if (mode === "signIn") {
        await signIn(values.email, values.password);
        toast.success("Welcome back");
        navigate("/");
      } else {
        // A signup must always start from an unauthenticated state.
        // Clear any stale browser tokens before creating the account.
        clearTokens();
        await signUp(values.fullName, values.email, values.password);
        // Registration does not issue tokens. Keep the user on the login
        // form so they must authenticate explicitly.
        clearTokens();
        toast.success("Account created. Please sign in to continue.");
        setMode("signIn");
        setPasswordValue("");
        setShowPassword(false);
        setShowConfirm(false);
        reset({ fullName: "", email: values.email, password: "", confirmPassword: "" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Ambient radar sweep - purely decorative, echoes the app's
          "scanning for ranked leads" premise without competing with
          the form. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="size-[560px] rounded-full border border-accent/10" />
        <div className="absolute size-[380px] rounded-full border border-accent/10" />
        <div className="absolute size-[200px] rounded-full border border-accent/10" />
      </div>

      <Card className="relative z-10 w-full max-w-md border-border/70 shadow-xl shadow-black/5">
        <CardHeader className="items-center text-center pb-5">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-lg shadow-accent/25">
            <Search className="size-6" />
          </div>
          <CardTitle className="font-display text-2xl tracking-tight">
            {mode === "signIn" ? "Welcome back" : "Create your account"}
          </CardTitle>
          <CardDescription className="max-w-sm">
            {mode === "signIn"
              ? "Sign in to access your saved searches and leads."
              : "Create an account to save searches and manage your leads."}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="grid gap-4">
            {mode === "signUp" && (
              <div className="grid gap-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" autoComplete="name" placeholder="Your full name" {...register("fullName")} />
                {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  placeholder={mode === "signUp" ? "Create a strong password" : "Your password"}
                  className="pr-11"
                  {...register("password", {
                    onChange: (e) => setPasswordValue(e.target.value),
                  })}
                />
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            {mode === "signUp" && (
              <>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-medium">Password requirements</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {passwordRules.map(([label, test]) => {
                      const valid = test(passwordValue);
                      return (
                        <div key={label} className={`flex items-center gap-1.5 text-xs ${valid ? "text-emerald-600" : "text-muted-foreground"}`}>
                          <Check className={`size-3.5 ${valid ? "opacity-100" : "opacity-30"}`} />
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <div className="relative">
                    <Input id="confirmPassword" type={showConfirm ? "text" : "password"} autoComplete="new-password" placeholder="Re-enter your password" className="pr-11" {...register("confirmPassword")} />
                    <button type="button" aria-label={showConfirm ? "Hide confirmation" : "Show confirmation"} onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
                </div>
              </>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {mode === "signIn" ? "Sign in" : "Create account"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "signIn" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button type="button" onClick={() => switchMode(mode === "signIn" ? "signUp" : "signIn")} className="font-medium text-primary underline-offset-4 hover:underline">
                {mode === "signIn" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
