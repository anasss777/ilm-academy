import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export { TextField } from "@/components/auth/field";

type Base = { id: string; label: string; hint?: string; error?: string };

export function TextAreaField({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <textarea
        id={id}
        dir="auto"
        className={`textarea ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint ? <p className="field-hint">{hint}</p> : null}
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  hint,
  children,
  className,
  ...props
}: Omit<Base, "error"> & { children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} className={`select ${className ?? ""}`} {...props}>
        {children}
      </select>
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function CheckField({
  id,
  label,
  hint,
  ...props
}: Omit<Base, "error"> & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="flex items-start gap-3">
      <input id={id} type="checkbox" className="checkbox mt-1" {...props} />
      <span className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {hint ? <span className="field-hint block">{hint}</span> : null}
      </span>
    </label>
  );
}
