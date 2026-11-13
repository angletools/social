import { expect, it, vi } from "vitest";
import { createServer, type Socket } from "node:net";
import { sendEmail } from "@/lib/email";

it("checks actual SMTP acceptance, rejection and stable message IDs on loopback", async () => {
  const sockets = new Set<Socket>();
  const messages: string[] = [];
  const server = createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    socket.write("220 local test mail\r\n");
    let buffer = "", data = false, message = "";
    socket.on("data", chunk => {
      buffer += chunk.toString();
      let newline: number;
      while ((newline = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 2);
        if (data) {
          if (line === ".") { messages.push(message); message = ""; data = false; socket.write("250 accepted\r\n"); }
          else message += `${line}\n`;
        } else if (/^(EHLO|HELO)/.test(line)) socket.write("250 local\r\n");
        else if (/^RCPT/.test(line) && line.includes("reject@")) socket.write("550 rejected recipient\r\n");
        else if (line === "DATA") { data = true; socket.write("354 send message\r\n"); }
        else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test SMTP address");
  vi.stubEnv("SMTP_URL", `smtp://127.0.0.1:${address.port}?ignoreTLS=true`);
  try {
    expect(await sendEmail(["accept@example.invalid"], "Test", "Body", "test@example.invalid", "stable-id")).toBe(true);
    expect(messages[0]).toContain("Message-ID: <stable-id@angle-social.local>");
    expect(await sendEmail(["accept@example.invalid", "reject@example.invalid"], "Test", "Body", "test@example.invalid")).toBe(false);
    await expect(sendEmail(["reject@example.invalid"], "Test", "Body", "test@example.invalid")).rejects.toThrow();
  } finally {
    vi.unstubAllEnvs(); sockets.forEach(socket => socket.destroy());
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
