"use client";

import { useState } from "react";
import { Button } from "./button";
import { Icon } from "./icons";

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
    <div className="copy-link">
      <p className="copy-link__hint">{hint}</p>
      <div className="copy-link__row">
        <code className="copy-link__code">{url}</code>
        <Button
          variant="secondary"
          size="sm"
          icon={copied ? <Icon.Check size={16} /> : <Icon.Copy size={16} />}
          onClick={() => void copy()}
        >
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
    </div>
  );
}
