import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "../lib/api";
import { Button, Field, TextInput } from "./ui";

function Card({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-[420px] rounded-3xl bg-surface p-8 shadow-dialog">
        <div className="mb-1 flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" width={30} height={30} className="rounded-lg" />
          <span className="font-display text-[22px] font-semibold">People Manager</span>
        </div>
        <h1 className="mt-5 font-display text-[26px] font-semibold leading-tight">{title}</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-mute">{sub}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function useAuthForm(url: string) {
  const qc = useQueryClient();
  const [loginName, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent, extra?: () => string | null) => {
    e.preventDefault(); setError("");
    const problem = extra?.(); if (problem) { setError(problem); return; }
    setBusy(true);
    try { await api.post(url, { loginName, password }); await qc.invalidateQueries(); }
    catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return { loginName, setLogin, password, setPassword, error, busy, submit };
}

export function SetupScreen() {
  const f = useAuthForm("/api/auth/setup");
  const [again, setAgain] = useState("");
  return (
    <Card title="Create your login" sub={<>The login is turned on, and no login exists yet. Choose a login name and password — they are saved (the password as a secure hash) in the password file next to People Manager (<span className="font-mono text-[12px]">.password</span> unless you changed it in Settings). Forget the password? Delete that file and reload; your people are never touched.</>}>
      <form className="flex flex-col gap-4" onSubmit={(e) => f.submit(e, () => (f.password !== again ? "The two passwords are not the same." : null))}>
        <Field label="Login name" htmlFor="su-name"><TextInput id="su-name" autoFocus autoComplete="username" value={f.loginName} onChange={(e) => f.setLogin(e.target.value)} /></Field>
        <Field label="Password" htmlFor="su-pw" hint="At least 4 characters."><TextInput id="su-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => f.setPassword(e.target.value)} /></Field>
        <Field label="Password again" htmlFor="su-pw2"><TextInput id="su-pw2" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
        {f.error && <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{f.error}</div>}
        <Button type="submit" variant="primary" busy={f.busy}>Create login</Button>
      </form>
    </Card>
  );
}

export function LoginScreen() {
  const f = useAuthForm("/api/auth/login");
  return (
    <Card title="Sign in" sub="Enter the login name and password you created for People Manager.">
      <form className="flex flex-col gap-4" onSubmit={(e) => f.submit(e)}>
        <Field label="Login name" htmlFor="li-name"><TextInput id="li-name" autoFocus autoComplete="username" value={f.loginName} onChange={(e) => f.setLogin(e.target.value)} /></Field>
        <Field label="Password" htmlFor="li-pw"><TextInput id="li-pw" type="password" autoComplete="current-password" value={f.password} onChange={(e) => f.setPassword(e.target.value)} /></Field>
        {f.error && <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{f.error}</div>}
        <Button type="submit" variant="primary" busy={f.busy}>Sign in</Button>
        <p className="text-center text-[12px] text-faint">Forgot it? Delete the password file on the computer running People Manager, then reload this page.</p>
      </form>
    </Card>
  );
}
