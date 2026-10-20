import { describe, expect, it, vi } from "vitest";
import type { EmailConfig } from "../../config.ts";
import type { EmailOutboxRepo, OutboxEntry } from "./outbox.ts";
import type { ResendLike } from "./resend.ts";
import { createEmailSender, type OutgoingEmail } from "./sender.ts";

type Row = OutboxEntry & {
  id: string;
  status: string;
  providerMessageId?: string | null;
  error?: string;
};

function fakeOutbox() {
  const rows: Row[] = [];
  const repo: EmailOutboxRepo = {
    enqueue(entry) {
      const id = `id-${rows.length + 1}`;
      rows.push({ ...entry, id, status: "queued" });
      return Promise.resolve(id);
    },
    markSent(id, providerMessageId) {
      const row = rows.find((r) => r.id === id)!;
      row.status = "sent";
      row.providerMessageId = providerMessageId;
      return Promise.resolve();
    },
    markFailed(id, error) {
      const row = rows.find((r) => r.id === id)!;
      row.status = "failed";
      row.error = error;
      return Promise.resolve();
    },
  };
  return { rows, repo };
}

const email: OutgoingEmail = {
  organizationId: null,
  to: "persona@test.example",
  locale: "es",
  template: "invitation",
  subject: "Asunto",
  text: "Cuerpo con enlace https://x.test/invitations/abc",
  html: "<p>Cuerpo</p>",
};

const outboxConfig: EmailConfig = {
  transport: "outbox",
  from: null,
  resendApiKey: null,
  debugLog: false,
};
const resendConfig: EmailConfig = {
  transport: "resend",
  from: "Sports Manager <no-reply@test.example>",
  resendApiKey: "re_test",
  debugLog: false,
};

describe("puerto de email", () => {
  it("outbox: guarda en cola sin enviar y no escribe en el log si no está activado", async () => {
    const { rows, repo } = fakeOutbox();
    const log = vi.fn();
    const sender = createEmailSender({ config: outboxConfig, outbox: repo, log });
    const result = await sender.send(email);
    expect(result).toEqual({ id: "id-1", status: "queued" });
    expect(rows[0]).toMatchObject({ status: "queued", transport: "outbox", toEmail: email.to });
    expect(log).not.toHaveBeenCalled();
  });

  it("outbox con log de depuración: escribe el email en el log", async () => {
    const { repo } = fakeOutbox();
    const log = vi.fn();
    const sender = createEmailSender({
      config: { ...outboxConfig, debugLog: true },
      outbox: repo,
      log,
    });
    await sender.send(email);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain("https://x.test/invitations/abc");
  });

  it("resend: envía con el remitente configurado y guarda el id del proveedor", async () => {
    const { rows, repo } = fakeOutbox();
    const send = vi.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null });
    const resend: ResendLike = { emails: { send } };
    const sender = createEmailSender({ config: resendConfig, outbox: repo, resend });
    const result = await sender.send(email);
    expect(result).toEqual({ id: "id-1", status: "sent" });
    expect(send).toHaveBeenCalledWith({
      from: resendConfig.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    expect(rows[0]).toMatchObject({
      status: "sent",
      providerMessageId: "msg_1",
      transport: "resend",
    });
  });

  it("resend: un error del proveedor deja el email como fallido con el motivo y no lanza", async () => {
    const { rows, repo } = fakeOutbox();
    const resend: ResendLike = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: null, error: { message: "domain not verified" } }),
      },
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sender = createEmailSender({ config: resendConfig, outbox: repo, resend });
    await expect(sender.send(email)).resolves.toEqual({ id: "id-1", status: "failed" });
    expect(rows[0]).toMatchObject({ status: "failed", error: "domain not verified" });
    errorSpy.mockRestore();
  });

  it("resend: una excepción de red también acaba en fallido", async () => {
    const { rows, repo } = fakeOutbox();
    const resend: ResendLike = {
      emails: { send: vi.fn().mockRejectedValue(new Error("ECONNRESET")) },
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sender = createEmailSender({ config: resendConfig, outbox: repo, resend });
    expect((await sender.send(email)).status).toBe("failed");
    expect(rows[0]?.error).toBe("ECONNRESET");
    errorSpy.mockRestore();
  });
});
