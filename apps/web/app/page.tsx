import Link from "next/link";

export default function Home() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--t1)",
      fontFamily: "var(--font-ui)",
      overflow: "hidden",
      position: "relative",
    }}>

      {/* Circuit grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(var(--b1) 1px, transparent 1px), linear-gradient(90deg, var(--b1) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />

      {/* Amber glow blob — top center */}
      <div style={{
        position: "absolute", top: "-120px", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 400,
        background: "radial-gradient(ellipse, rgba(245,158,11,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Nav */}
      <nav style={{
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 48px",
        borderBottom: "1px solid var(--b1)",
      }} className="animate-fade-in">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Edge Lab" width={28} height={28} style={{ borderRadius: 5 }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, letterSpacing: "0.06em" }}>
            EDGE <span style={{ color: "var(--amber)" }}>LAB</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/dashboard" style={{ color: "var(--t2)", fontSize: 13, textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600 }}>
            Dashboard
          </Link>
          <Link href="/editor/demo" className="btn-amber" style={{ padding: "7px 16px", fontSize: 12 }}>
            Try Demo
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        position: "relative",
        maxWidth: 900,
        margin: "0 auto",
        padding: "100px 48px 60px",
        textAlign: "center",
      }}>

        {/* Badge */}
        <div className="animate-fade-up" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "var(--amber-lo)", border: "1px solid rgba(245,158,11,0.25)",
          borderRadius: 99, padding: "5px 14px",
          marginBottom: 36,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber)", display: "inline-block", animation: "pulse-amber 2s infinite" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)", letterSpacing: "0.08em" }}>
            AI-POWERED EMBEDDED IDE
          </span>
        </div>

        {/* Headline */}
        <h1 className="animate-fade-up-d1" style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(52px, 8vw, 88px)",
          fontWeight: 800,
          lineHeight: 1.0,
          letterSpacing: "-0.03em",
          margin: "0 0 24px",
        }}>
          Code. Flash.{" "}
          <span style={{
            color: "var(--amber)",
            textShadow: "0 0 40px rgba(245,158,11,0.4)",
          }}>
            Verify.
          </span>
          <br />
          <span style={{ color: "var(--t3)" }}>From any device.</span>
        </h1>

        <p className="animate-fade-up-d2" style={{
          fontFamily: "var(--font-ui)",
          fontSize: 18,
          color: "var(--t2)",
          lineHeight: 1.65,
          maxWidth: 580,
          margin: "0 auto 44px",
          fontWeight: 300,
        }}>
          Edge Lab is an AI agent IDE for Arduino, ESP32 and embedded systems.
          Write firmware, flash boards, read serial output — all from your browser.
        </p>

        {/* CTAs */}
        <div className="animate-fade-up-d3" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/dashboard" className="btn-amber" style={{ fontSize: 14, padding: "12px 28px" }}>
            Open Dashboard →
          </Link>
          <Link href="/editor/demo" className="btn-ghost" style={{ fontSize: 14, padding: "12px 28px" }}>
            Try the Demo
          </Link>
        </div>

        {/* Terminal mockup */}
        <div className="animate-fade-up-d4" style={{
          marginTop: 64,
          background: "var(--s1)",
          border: "1px solid var(--b2)",
          borderRadius: 10,
          overflow: "hidden",
          textAlign: "left",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px var(--b1)",
        }}>
          {/* Window chrome */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "10px 16px",
            borderBottom: "1px solid var(--b1)",
            background: "var(--s2)",
          }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", opacity: 0.7 }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", opacity: 0.7 }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", opacity: 0.7 }} />
            <span style={{ flex: 1, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t3)" }}>
              main.cpp — Edge Lab
            </span>
          </div>
          {/* Code */}
          <pre style={{
            margin: 0,
            padding: "20px 24px",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--t2)",
            overflow: "hidden",
          }}>{`<span style="color:var(--t3)">#include</span> <span style="color:var(--amber)">&lt;Arduino.h&gt;</span>

<span style="color:var(--blue)">void</span> <span style="color:var(--green)">setup</span>() {
  Serial.<span style="color:var(--cyan)">begin</span>(<span style="color:var(--amber)">115200</span>);
  <span style="color:var(--blue)">pinMode</span>(LED_BUILTIN, OUTPUT);
}

<span style="color:var(--blue)">void</span> <span style="color:var(--green)">loop</span>() {
  <span style="color:var(--blue)">digitalWrite</span>(LED_BUILTIN, HIGH);  <span style="color:var(--t3)">// ← AI wrote this</span>
  <span style="color:var(--blue)">delay</span>(<span style="color:var(--amber)">500</span>);
  <span style="color:var(--blue)">digitalWrite</span>(LED_BUILTIN, LOW);
  <span style="color:var(--blue)">delay</span>(<span style="color:var(--amber)">500</span>);
}`}</pre>
          {/* Agent output */}
          <div style={{
            borderTop: "1px solid var(--b1)",
            background: "var(--bg)",
            padding: "12px 20px",
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--green)", marginTop: 1 }}>✓</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t3)" }}>
              Flashed ESP32 · Serial: <span style={{ color: "var(--green)" }}>"Blink!"</span> every 500ms · Verified ✓
            </span>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="animate-fade-up-d5" style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "40px 48px 100px",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 1,
        background: "var(--b1)",
        border: "1px solid var(--b1)",
        borderRadius: 10,
        overflow: "hidden",
      }}>
        {[
          {
            icon: "⚡",
            title: "Flash & Verify",
            desc: "Agent compiles, uploads, opens the serial monitor, reads the output, and tells you if it's working.",
          },
          {
            icon: "🤖",
            title: "Multi-AI Agent",
            desc: "Claude, GPT-4o, Gemini, OpenRouter, Ollama. Reads files, edits code, runs builds autonomously.",
          },
          {
            icon: "📐",
            title: "Schematics + PCB",
            desc: "KiCad-native schematic and PCB viewer. Agent edits .kicad_sch files directly, runs DRC checks.",
          },
          {
            icon: "🔄",
            title: "Real-Time Sync",
            desc: "Yjs CRDT — edit the same project from your phone, desktop app, and browser simultaneously.",
          },
          {
            icon: "🖥",
            title: "Desktop App",
            desc: "Tauri-based native app with real serial port access via USB. Offline-first, opens local folders.",
          },
          {
            icon: "🔌",
            title: "Hardware Native",
            desc: "WebSerial API in browser. Full native serial in Tauri. PlatformIO for 1000+ boards.",
          },
        ].map((f) => (
          <div key={f.title} style={{
            background: "var(--s1)",
            padding: "28px 28px 32px",
          }}>
            <div style={{ fontSize: 26, marginBottom: 12 }}>{f.icon}</div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700, fontSize: 14,
              letterSpacing: "0.02em",
              color: "var(--t1)", marginBottom: 8,
            }}>{f.title}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", lineHeight: 1.65 }}>{f.desc}</div>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid var(--b1)",
        padding: "24px 48px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        color: "var(--t4)",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
      }}>
        <span>EDGE LAB · AI-Powered Embedded IDE</span>
        <div style={{ display: "flex", gap: 24 }}>
          <span>🖥 Desktop (Tauri)</span>
          <span>📱 Mobile (Expo)</span>
          <span>🌐 Web (Next.js)</span>
        </div>
      </footer>
    </main>
  );
}
