/**
 * Small building blocks used everywhere. Every colour comes from the theme
 * tokens (bg, surface, ink, accent…), so themes restyle all of it.
 */
import * as Dialog from "@radix-ui/react-dialog";
import * as DM from "@radix-ui/react-dropdown-menu";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";
import { initials, tileColors } from "../lib/format";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 border border-transparent",
  secondary: "bg-surface text-ink border border-line-2 hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-surface-2",
  danger: "bg-danger text-white border border-transparent hover:brightness-110",
  "danger-outline": "bg-surface text-danger border border-line-2 hover:bg-danger-soft",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: "sm" | "md"; busy?: boolean; icon?: ReactNode }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", busy, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} type="button" disabled={disabled || busy}
      className={cx("inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm", VARIANTS[variant], className)} {...rest}>
      {busy ? <Loader2 size={15} className="animate-spin" /> : icon}{children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md" }>(function IconButton({ label, size = "md", className, children, ...rest }, ref) {
  return (
    <button ref={ref} type="button" aria-label={label} title={label}
      className={cx("inline-flex items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink transition cursor-pointer disabled:opacity-40", size === "sm" ? "h-7 w-7" : "h-9 w-9", className)} {...rest}>
      {children}
    </button>
  );
});

const field = "w-full rounded-xl border border-line-2 bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft";
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(field, "h-10", className)} {...rest} />;
});
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(field, "py-2.5 min-h-[88px] leading-relaxed resize-y", className)} {...rest} />;
});
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(field, "h-10 pr-8", className)} {...rest}>{children}</select>;
}

export function Field({ label, hint, badge, children, htmlFor, className }: { label: ReactNode; hint?: ReactNode; badge?: ReactNode; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-2">{label}</label>
        {badge}
      </div>
      {children}
      {hint && <div className="text-[12px] leading-snug text-faint">{hint}</div>}
    </div>
  );
}

/** "Applies immediately" / "Needs restart" next to a setting. */
export function ApplyBadge({ restart }: { restart?: boolean }) {
  return restart
    ? <span className="whitespace-nowrap rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">Needs restart</span>
    : <span className="whitespace-nowrap rounded-full bg-accent-softer px-2 py-0.5 text-[11px] font-medium text-accent-text">Applies immediately</span>;
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx("relative h-6 w-11 shrink-0 rounded-full transition cursor-pointer", checked ? "bg-accent" : "bg-line-2")}>
      <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

// ---------------------------------------------------------------- dialogs
export function Modal({ open, onOpenChange, title, description, children, className, hideTitle }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: ReactNode; className?: string; hideTitle?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgb(8_20_18/0.45)]" />
        <Dialog.Content {...(description ? {} : { "aria-describedby": undefined })}
          className={cx("fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface shadow-dialog focus:outline-none max-h-[92vh]",
            /(^|\s)!?w-/.test(className || "") ? "" : "w-[min(560px,94vw)]", /overflow-/.test(className || "") ? "" : "overflow-auto", className)}>
          {hideTitle ? <Dialog.Title className="sr-only">{title}</Dialog.Title> : (
            <div className="flex items-start gap-3 px-6 pt-5">
              <div className="flex-1">
                <Dialog.Title className="font-display text-[22px] font-semibold leading-tight">{title}</Dialog.Title>
                {description && <Dialog.Description className="mt-1 text-[13.5px] text-mute">{description}</Dialog.Description>}
              </div>
              <Dialog.Close asChild><IconButton label="Close" size="sm"><X size={16} /></IconButton></Dialog.Close>
            </div>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------- menus
export interface MenuItem { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }
export function Menu({ trigger, items, align = "end" }: { trigger: ReactNode; items: (MenuItem | "sep")[]; align?: "start" | "end" }) {
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content align={align} sideOffset={6} className="z-50 min-w-[190px] rounded-2xl border border-line bg-surface p-1.5 shadow-lift" onClick={(e) => e.stopPropagation()}>
          {items.map((it, i) => it === "sep" ? <DM.Separator key={i} className="my-1 h-px bg-line" /> : (
            <DM.Item key={i} disabled={it.disabled} onSelect={it.onSelect}
              className={cx("flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-40",
                it.danger ? "text-danger" : "text-ink")}>
              <span className="flex w-4 justify-center text-current opacity-80">{it.icon}</span>{it.label}
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

// ---------------------------------------------------------------- people
export function Avatar({ person, src, size = 52, rounded = "rounded-2xl", className }: {
  person: { firstName: string; lastName: string }; src?: string | null; size?: number; rounded?: string; className?: string;
}) {
  const { bg, fg } = tileColors(person);
  if (src) return <img src={src} alt="" width={size} height={size} className={cx("shrink-0 object-cover", rounded, className)} style={{ width: size, height: size }} draggable={false} />;
  return (
    <span aria-hidden className={cx("flex shrink-0 select-none items-center justify-center font-semibold", rounded, className)}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.34) }}>
      {initials(person)}
    </span>
  );
}

export function NameWithNick({ p, nickClass = "text-faint font-normal" }: { p: { firstName: string; lastName: string; nickname: string }; nickClass?: string }) {
  return <>{`${p.firstName} ${p.lastName}`.trim()}{p.nickname && <span className={nickClass}> ({p.nickname})</span>}</>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={18} className={cx("animate-spin text-faint", className)} />;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-2 px-6 py-12 text-center">
      <div className="font-display text-lg font-semibold">{title}</div>
      {children && <div className="max-w-md text-[13.5px] text-mute">{children}</div>}
      {action && <div className="mt-2 flex gap-2">{action}</div>}
    </div>
  );
}
