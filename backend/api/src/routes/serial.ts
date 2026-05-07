import { Hono } from "hono";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSerialRouter(upgradeWebSocket: (handler: (c: any) => any) => any) {
  const router = new Hono();

  // List available serial ports — tries pio first, falls back to /dev glob
  router.get("/ports", async (c) => {
    try {
      const { stdout } = await execAsync("pio device list --serial --json-output");
      const devs: Array<{ port: string }> = JSON.parse(stdout);
      return c.json(devs.map((d) => d.port));
    } catch {
      try {
        const { stdout } = await execAsync(
          "ls /dev/ttyUSB* /dev/ttyACM* /dev/cu.usb* /dev/tty.usb* 2>/dev/null || true"
        );
        const ports = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
        return c.json(ports);
      } catch {
        return c.json([]);
      }
    }
  });

  // WebSocket serial bridge — connects to a local serial port and relays data
  router.get(
    "/monitor",
    upgradeWebSocket((c) => {
      const portPath = c.req.query("port") ?? "";
      const baud = Number(c.req.query("baud") ?? 115200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let serialPort: any = null;

      return {
        async onOpen(_: unknown, ws: any) {
          if (!portPath) {
            ws.send("ERROR: No port specified in query param ?port=");
            ws.close();
            return;
          }
          try {
            const { SerialPort } = await import("serialport");
            serialPort = new SerialPort({ path: portPath, baudRate: baud });
            serialPort.on("data", (data: Buffer) => ws.send(data.toString()));
            serialPort.on("error", (err: Error) => {
              ws.send(`ERROR: ${err.message}`);
              ws.close();
            });
          } catch (e) {
            ws.send(`ERROR: Cannot open port ${portPath}: ${String(e)}`);
            ws.close();
          }
        },
        onMessage(evt: any) {
          serialPort?.write(String(evt.data));
        },
        onClose() {
          try { serialPort?.close(); } catch { /* ignore */ }
          serialPort = null;
        },
      };
    })
  );

  return router;
}
