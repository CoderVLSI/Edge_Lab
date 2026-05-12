import Link from "next/link";
import {
  Zap,
  ChevronRight,
  Cpu,
  Radio,
  GitBranch,
  Terminal,
  Layers,
  MonitorSpeaker,
} from "lucide-react";

export default function Home() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--t1)",
      fontFamily: "var(--font-ui)",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* ── Titlebar / Nav ───────────────────────────────────────────────── */}
      <nav style={{
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "1px solid var(--b1)",
        background: "var(--s1)",
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-mono)", fontSize: 12,
          fontWeight: 600, color: "var(--amber)",
          letterSpacing: "0.04em",
        }}>
          <Zap size={13} />
          edgelab
          <span style={{
            marginLeft: 4,
            fontFamily: "var(--font-mono)", fontSize: 9,
            color: "var(--t4)", fontWeight: 400,
            background: "var(--s3)", border: "1px solid var(--b2)",
            borderRadius: "var(--r1)", padding: "1px 5px",
          }}>
            v0.1.0
          </span>
        </div>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {["Features", "Docs", "GitHub"].map((item) => (
            <button
              key={item}
              style={{
                background: "transparent", border: "none",
                color: "var(--t3)", fontFamily: "var(--font-ui)", fontSize: 12,
                cursor: "pointer", padding: "0 12px", height: 38,
                transition: "color 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--t1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--t3)"; }}
            >
              {item}
            </button>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/dashboard" style={{
            fontFamily: "var(--font-ui)", fontSize: 12,
            color: "var(--t2)", textDecoration: "none",
            padding: "0 8px",
          }}>
            Dashboard
          </Link>
          <Link href="/editor/demo" className="btn-amber" style={{ height: 26, padding: "0 12px", fontSize: 11 }}>
            Try Demo
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: "72px 48px 56px",
        width: "100%",
      }}>
        {/* Eyebrow */}
        <div className="badge badge-amber" style={{ marginBottom: 24 }}>
          <span className="pulse-dot" style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "var(--amber)", display: "inline-block", marginRight: 5,
          }} />
          AI-POWERED EMBEDDED IDE
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: "var(--font-ui)",
          fontWeight: 700,
          fontSize: "clamp(36px, 5vw, 58px)",
          lineHeight: 1.08,
          letterSpacing: "-0.025em",
          margin: "0 0 20px",
          maxWidth: 680,
        }}>
          Write firmware.{" "}
          <span style={{ color: "var(--amber)" }}>Flash boards.</span>
          <br />
          Ship from anywhere.
        </h1>

        <p style={{
          fontSize: 15,
          color: "var(--t2)",
          lineHeight: 1.7,
          maxWidth: 520,
          margin: "0 0 36px",
          fontWeight: 400,
        }}>
          Edge Lab is a professional IDE for Arduino, ESP32 and embedded systems — with
          an AI agent that compiles, flashes, reads serial output, and fixes errors
          autonomously.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/dashboard" className="btn-amber" style={{ fontSize: 13, padding: "7px 18px" }}>
            Open Workspace <ChevronRight size={13} />
          </Link>
          <Link href="/editor/demo" className="btn" style={{ fontSize: 13, padding: "7px 16px" }}>
            Live Demo
          </Link>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)", marginLeft: 4,
          }}>
            No account required
          </span>
        </div>

        {/* Platform pills */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          marginTop: 28,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", marginRight: 4 }}>
            RUNS ON
          </span>
          {["Web · Next.js 15", "Desktop · Tauri 2", "Mobile · Expo"].map((p) => (
            <span key={p} style={{
              fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)",
              background: "var(--s2)", border: "1px solid var(--b2)",
              borderRadius: "var(--r1)", padding: "2px 8px",
            }}>
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* ── Code preview ─────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: "0 48px 56px",
        width: "100%",
      }}>
        <div style={{
          background: "var(--s1)",
          border: "1px solid var(--b2)",
          borderRadius: "var(--r3)",
          overflow: "hidden",
        }}>
          {/* Tab bar */}
          <div style={{
            display: "flex", alignItems: "center",
            background: "var(--s2)",
            borderBottom: "1px solid var(--b1)",
            padding: "0 0 0 0",
            height: 32,
          }}>
            {["main.cpp", "platformio.ini", "agent"].map((tab, i) => (
              <div
                key={tab}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "0 14px",
                  height: "100%",
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: i === 0 ? "var(--t1)" : "var(--t3)",
                  borderRight: "1px solid var(--b1)",
                  borderBottom: i === 0 ? "1px solid var(--amber)" : "1px solid transparent",
                  background: i === 0 ? "var(--bg)" : "transparent",
                  cursor: "pointer",
                }}
              >
                {tab}
              </div>
            ))}
          </div>

          {/* Editor content */}
          <div style={{ display: "flex" }}>
            {/* Line numbers */}
            <div style={{
              padding: "16px 0",
              background: "var(--s2)",
              borderRight: "1px solid var(--b1)",
              userSelect: "none",
            }}>
              {Array.from({ length: 18 }, (_, i) => (
                <div key={i} style={{
                  padding: "0 14px 0 16px",
                  fontFamily: "var(--font-mono)", fontSize: 12,
                  lineHeight: 1.7, color: "var(--t4)",
                  textAlign: "right", minWidth: 44,
                }}>
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Code */}
            <div style={{ padding: "16px 20px", overflow: "auto", flex: 1 }}>
              <pre style={{
                margin: 0,
                fontFamily: "var(--font-mono)", fontSize: 12,
                lineHeight: 1.7, color: "var(--t2)",
              }}>
                <span style={{ color: "var(--t3)" }}>#include</span>
                {` `}
                <span style={{ color: "var(--orange)" }}>&lt;Arduino.h&gt;</span>
                {`\n`}
                <span style={{ color: "var(--t3)" }}>#include</span>
                {` `}
                <span style={{ color: "var(--orange)" }}>&lt;DHT.h&gt;</span>
                {`\n\n`}
                <span style={{ color: "var(--blue)" }}>const</span>
                {` `}
                <span style={{ color: "var(--blue)" }}>int</span>
                {` `}
                <span style={{ color: "var(--cyan)" }}>DHTPIN</span>
                {` = `}
                <span style={{ color: "var(--orange)" }}>4</span>
                {`;\n`}
                <span style={{ color: "var(--purple)" }}>DHT</span>
                {` `}
                <span style={{ color: "var(--cyan)" }}>dht</span>
                {`(`}
                <span style={{ color: "var(--cyan)" }}>DHTPIN</span>
                {`, `}
                <span style={{ color: "var(--purple)" }}>DHT22</span>
                {`);\n\n`}
                <span style={{ color: "var(--blue)" }}>void</span>
                {` `}
                <span style={{ color: "var(--green)" }}>setup</span>
                {`() {\n  Serial.`}
                <span style={{ color: "var(--green)" }}>begin</span>
                {`(`}
                <span style={{ color: "var(--orange)" }}>115200</span>
                {`);\n  dht.`}
                <span style={{ color: "var(--green)" }}>begin</span>
                {`();\n}\n\n`}
                <span style={{ color: "var(--blue)" }}>void</span>
                {` `}
                <span style={{ color: "var(--green)" }}>loop</span>
                {`() {\n  float h = dht.`}
                <span style={{ color: "var(--green)" }}>readHumidity</span>
                {`();\n  float t = dht.`}
                <span style={{ color: "var(--green)" }}>readTemperature</span>
                {`();\n  Serial.`}
                <span style={{ color: "var(--green)" }}>printf</span>
                {`(`}
                <span style={{ color: "var(--orange)" }}>&quot;T=%.1f H=%.1f\\n&quot;</span>
                {`, t, h);\n  `}
                <span style={{ color: "var(--blue)" }}>delay</span>
                {`(`}
                <span style={{ color: "var(--orange)" }}>2000</span>
                {`);\n}`}
              </pre>
            </div>
          </div>

          {/* Agent output bar */}
          <div style={{
            borderTop: "1px solid var(--b1)",
            background: "var(--bg)",
            padding: "8px 16px",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <Terminal size={11} style={{ color: "var(--green)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t3)" }}>
              Agent{" "}
              <span style={{ color: "var(--green)" }}>compiled</span>
              {" · "}
              <span style={{ color: "var(--green)" }}>flashed ESP32</span>
              {" · Serial: "}
              <span style={{ color: "var(--amber)" }}>&quot;T=23.4 H=61.2&quot;</span>
              {" · "}
              <span style={{ color: "var(--green)" }}>verified</span>
            </span>
          </div>
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: "0 48px 64px",
        width: "100%",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--t4)", letterSpacing: "0.08em",
          marginBottom: 16,
        }}>
          CAPABILITIES
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          background: "var(--b1)",
          border: "1px solid var(--b1)",
          borderRadius: "var(--r2)",
          overflow: "hidden",
        }}>
          {[
            {
              icon: Zap,
              title: "Flash & Verify",
              desc: "Agent compiles, uploads, reads serial output, and confirms the board is working — all in one command.",
            },
            {
              icon: Cpu,
              title: "1,549+ Boards",
              desc: "Full PlatformIO board registry. ESP32, STM32, Nordic nRF52, RP2040, RISC-V, SAMD, Teensy, and more.",
            },
            {
              icon: Layers,
              title: "AI Agent",
              desc: "Claude, GPT-4o, Gemini, Ollama. Reads files, edits code, fixes errors, runs builds autonomously.",
            },
            {
              icon: GitBranch,
              title: "Real-Time Sync",
              desc: "Yjs CRDT — edit the same project from browser, desktop app, and phone simultaneously, offline-first.",
            },
            {
              icon: Radio,
              title: "Serial Monitor",
              desc: "WebSerial API in browser. Full native serial in the Tauri desktop app. Baud rate, timestamp, filters.",
            },
            {
              icon: MonitorSpeaker,
              title: "Library Manager",
              desc: "Search and install any PlatformIO library. Written to platformio.ini — auto-downloaded at build time.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              style={{
                background: "var(--s1)",
                padding: "24px 24px 28px",
              }}
            >
              <div style={{
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--amber-lo)",
                border: "1px solid rgba(224,160,32,0.2)",
                borderRadius: "var(--r2)",
                marginBottom: 12,
              }}>
                <Icon size={14} style={{ color: "var(--amber)" }} />
              </div>
              <div style={{
                fontFamily: "var(--font-ui)",
                fontWeight: 600, fontSize: 13,
                color: "var(--t1)", marginBottom: 6,
              }}>
                {title}
              </div>
              <div style={{
                fontSize: 12, color: "var(--t3)", lineHeight: 1.65,
              }}>
                {desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA strip ────────────────────────────────────────────────────── */}
      <section style={{
        borderTop: "1px solid var(--b1)",
        background: "var(--s1)",
        padding: "40px 48px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 24,
      }}>
        <div>
          <div style={{
            fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: 16,
            color: "var(--t1)", marginBottom: 4,
          }}>
            Ready to build?
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t3)",
          }}>
            Open a project or try the demo — no signup required.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard" className="btn-amber" style={{ fontSize: 12, padding: "7px 16px" }}>
            Open Workspace
          </Link>
          <Link href="/editor/demo" className="btn" style={{ fontSize: 12, padding: "7px 14px" }}>
            Live Demo
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: "1px solid var(--b1)",
        padding: "14px 48px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)",
        }}>
          edgelab · AI-Powered Embedded IDE · 2025
        </span>
        <div style={{ display: "flex", gap: 16 }}>
          {["Web", "Desktop (Tauri)", "Mobile (Expo)"].map((p) => (
            <span key={p} style={{
              fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)",
            }}>
              {p}
            </span>
          ))}
        </div>
      </footer>
    </main>
  );
}
