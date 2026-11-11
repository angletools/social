"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f6f5f1", color: "#15181b", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", maxWidth: 360, padding: 24 }}>
          <h1 style={{ fontSize: 18 }}>Something went wrong · حدث خطأ ما</h1>
          <p style={{ color: "#5f646b", fontSize: 14, lineHeight: 1.6 }}>Please try again. · حاول مرة أخرى.</p>
          <button onClick={reset} style={{ marginTop: 16, background: "#15181b", color: "#fff", border: 0, borderRadius: 10, padding: "9px 16px", cursor: "pointer" }}>
            Try again · حاول مجددًا
          </button>
        </div>
      </body>
    </html>
  );
}
