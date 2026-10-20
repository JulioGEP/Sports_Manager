import { useState } from "react";
import { Button } from "./button";
import { Check, Copy } from "./icons";

/** Enlace de invitación en modo pruebas: visible y copiable en un clic. */
export function CopyLink({
  url,
  hint,
  copyLabel,
  copiedLabel,
}: {
  url: string;
  hint: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex flex-col gap-3 rounded-field border border-dashed border-control bg-surface p-4">
      <p className="text-secondary text-muted">{hint}</p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="min-w-0 flex-1 break-all font-mono text-secondary text-ink">{url}</code>
        <Button
          variant="secondary"
          size="sm"
          icon={
            copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />
          }
          onClick={() => void copy()}
        >
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
    </div>
  );
}
