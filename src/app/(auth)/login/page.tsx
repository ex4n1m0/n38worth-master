"use client";

import { signInCompat as signIn } from "@/lib/session-compat";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import {
  isCapacitor,
  signInWithGoogleInBrowser,
  setupBrowserAuthListener,
  cleanupBrowserAuthListener,
} from "@/lib/capacitor-auth";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { t } = useLanguage();
  const { play } = useSound();

  // Set up browser auth listener for Capacitor
  useEffect(() => {
    if (isCapacitor()) {
      setupBrowserAuthListener(() => {
        // Refresh the page to pick up the new session
        router.refresh();
        router.push("/my-profile?autoCards=1");
      });
    }

    return () => {
      if (isCapacitor()) {
        cleanupBrowserAuthListener();
      }
    };
  }, [router]);


  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    play("buttons");
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    // Re-arm the per-session daily-reward auto-claim for this fresh login so it
    // fires again when the player lands on their profile page.
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("auto-reward-claimed");
    }

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
        // Desktop compat hard-navigates to callbackUrl after minting the
        // token — without this it lands on the marketing landing and the
        // player has no way back into the game (the router.push below loses
        // the race to that hard navigation).
        callbackUrl: "/my-profile?autoCards=1",
      });

      if (result?.error) {
        play("error");
        setError(t.invalidCredentials);
      } else {
        play("confirm");
        router.push("/my-profile?autoCards=1");
        router.refresh();
      }
    } catch {
      play("error");
      setError(t.somethingWrong);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-4 pt-12 sm:pt-20 gap-8">
      <Card className="w-full max-w-md border-gray-800 bg-gray-900/80 backdrop-blur">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-t1-400 to-t2-400 bg-clip-text text-transparent">
            {t.loginTitle}
          </CardTitle>
          <CardDescription className="text-gray-400">
            {t.loginSubtitle}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-300">
                {t.username}
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder={t.chooseUsername}
                required
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300">
                {t.password}
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={t.choosePassword}
                required
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white font-semibold"
            >
              {loading ? t.connecting : t.signIn}
            </Button>

            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-gray-900 px-2 text-gray-500">
                  {t.orContinueWith}
                </span>
              </div>
            </div>

            <Button
              type="button"
              disabled={googleLoading}
              onClick={async () => {
                play("buttons");
                setError("");
                setGoogleLoading(true);
                
                if (isCapacitor()) {
                  // Use system browser for Capacitor to avoid disallowed_useragent error
                  try {
                    await signInWithGoogleInBrowser("/my-profile?autoCards=1");
                  } catch {
                    setError(t.googleSignInFailed);
                    setGoogleLoading(false);
                  }
                } else {
                  // Use NextAuth signIn directly for web
                  signIn("google", { callbackUrl: "/my-profile?autoCards=1" }).catch(() => {
                    setError(t.googleSignInFailed);
                    setGoogleLoading(false);
                  });
                }
              }}
              className="w-full border border-gray-700 !bg-gray-800 hover:!bg-gray-700 !text-white font-semibold"
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {googleLoading ? t.connecting : t.signUpGoogle}
            </Button>

            <p className="text-sm text-gray-400">
              {t.dontHaveAccount}{" "}
              <Link
                href="/register"
                className="text-t1-400 hover:text-t1-300 font-medium"
              >
                {t.register}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>

    </div>
  );
}
