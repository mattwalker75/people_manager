/**
 * Top level: apply the theme, then show the right screen for the login state —
 * create a login, sign in, or the app itself (people browser or Settings).
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { LoginScreen, SetupScreen } from "./components/AuthScreens";
import { Shell } from "./components/Shell";
import { Button, Spinner } from "./components/ui";
import { useAppState, useAuth } from "./lib/hooks";
import { applyTheme, onSystemThemeChange } from "./lib/theme";

/** "#/settings/data" → { view: "settings", section: "data" } */
export function useRoute() {
  const read = () => {
    const parts = window.location.hash.replace(/^#\/?/, "").split("/");
    return parts[0] === "settings" ? { view: "settings" as const, section: parts[1] || "general" } : { view: "people" as const, section: "" };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => { const f = () => setRoute(read()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  return route;
}
export const go = (hash: string) => { window.location.hash = hash; };

export default function App() {
  const auth = useAuth();
  const inside = auth.data?.status === "disabled" || auth.data?.status === "authenticated";
  const state = useAppState(inside);
  const qc = useQueryClient();
  const appearance = state.data?.config.appearance;

  useEffect(() => {
    if (!appearance) return;
    applyTheme(appearance.theme, appearance.customThemes);
    return onSystemThemeChange(() => applyTheme(appearance.theme, appearance.customThemes));
  }, [appearance]);

  useEffect(() => {
    const f = () => qc.invalidateQueries({ queryKey: ["auth"] });
    window.addEventListener("pm:signed-out", f);
    return () => window.removeEventListener("pm:signed-out", f);
  }, [qc]);

  const failed = auth.error || state.error;
  if (failed && (failed as { status?: number }).status !== 401) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-3xl bg-surface p-8 text-center shadow-soft">
          <AlertTriangle className="text-warn" />
          <div className="font-display text-xl font-semibold">People Manager is not answering</div>
          <div className="text-mute">{failed.message}. Check that it is running (<span className="font-mono">./PEOPLE.sh --status</span>), then try again.</div>
          <Button variant="primary" onClick={() => { auth.refetch(); state.refetch(); }}>Try again</Button>
        </div>
      </div>
    );
  }
  if (auth.data?.status === "not_initialized") return <SetupScreen />;
  if (auth.data?.status === "unauthenticated" || (failed as { status?: number } | null)?.status === 401) return <LoginScreen />;
  if (!state.data) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  const s = state.data;
  return <Shell state={s} />;
}
