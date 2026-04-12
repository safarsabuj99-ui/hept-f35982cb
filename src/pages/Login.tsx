import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/hooks/useBranding";
import { BarChart3, Loader2, ArrowRight } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { signIn, user, role, authReady } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { brandName, logoUrl } = useBranding();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect once auth is fully ready and we have a user+role
  useEffect(() => {
    if (!authReady || !user || !role) return;
    const dest = role === "platform_owner" ? "/platform" : role === "admin" ? "/admin" : role === "manager" ? "/manager" : "/dashboard";
    navigate(dest, { replace: true });
  }, [authReady, user, role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }
    // Success — onAuthStateChange will fire SIGNED_IN, role will be fetched,
    // and the useEffect above will navigate once authReady + role are set.
    // Keep loading state until navigation happens.
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 animate-gradient-shift"
        style={{
          background: "linear-gradient(135deg, hsl(226 70% 8%), hsl(260 60% 12%), hsl(226 70% 15%), hsl(200 60% 10%))",
          backgroundSize: "400% 400%",
        }}
      />

      {/* Dot grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, hsl(var(--primary-foreground)) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Floating geometric shapes */}
      <div
        className="floating-shape"
        style={{
          width: "500px",
          height: "500px",
          background: "hsl(var(--primary))",
          top: "-10%",
          right: "-10%",
          animationDelay: "0s",
        }}
      />
      <div
        className="floating-shape"
        style={{
          width: "400px",
          height: "400px",
          background: "hsl(260 60% 50%)",
          bottom: "-15%",
          left: "-8%",
          animationDelay: "4s",
        }}
      />
      <div
        className="floating-shape"
        style={{
          width: "250px",
          height: "250px",
          background: "hsl(200 70% 50%)",
          top: "50%",
          left: "60%",
          animationDelay: "8s",
        }}
      />

      {/* Login card */}
      <div
        className={`relative z-10 w-full max-w-md transition-all duration-700 ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
        style={{
          animation: mounted ? "blur-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards" : "none",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center space-y-3 mb-8">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl breathing-glow"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)), hsl(260 60% 50%))",
              animation: mounted
                ? "logo-spin-3d 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards, breathing-glow 3s ease-in-out 1s infinite"
                : "none",
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={brandName} className="h-8 w-8 object-contain" />
            ) : (
              <BarChart3 className="h-8 w-8 text-white" />
            )}
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {brandName} Portal
            </h1>
            <p className="text-sm text-white/50">
              Sign in to manage your ad campaigns
            </p>
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border border-white/[0.08] p-8"
          style={{
            background: "hsl(224 35% 10% / 0.8)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 24px 64px -12px hsl(226 70% 8% / 0.6), inset 0 1px 0 hsl(var(--primary-foreground) / 0.05)",
          }}
        >
          <div className="space-y-1 mb-6">
            <h2 className="text-xl font-bold text-white">Welcome back</h2>
            <p className="text-sm text-white/40">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium text-white/60 uppercase tracking-wider">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-white/25 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-300"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium text-white/60 uppercase tracking-wider">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 rounded-xl border-white/[0.08] bg-white/[0.04] text-white placeholder:text-white/25 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-300"
              />
            </div>
            <Button
              type="submit"
              className="shimmer-btn press-effect w-full h-12 rounded-xl text-sm font-semibold gap-2 transition-all duration-200"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)), hsl(260 60% 50%))",
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Bottom accent */}
        <div className="mt-8 text-center">
          <p className="text-xs text-white/20">
            Powered by {brandName} • Secure Login
          </p>
        </div>
      </div>
    </div>
  );
}
