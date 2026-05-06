import { useState, useRef, useCallback } from "react";

export type SerialStatus = "disconnected" | "connecting" | "connected" | "error";

export interface UseSerialPortReturn {
  status: SerialStatus;
  output: string[];
  connect: (baudRate: number) => Promise<void>;
  disconnect: () => Promise<void>;
  send: (data: string) => Promise<void>;
  clear: () => void;
  isSupported: boolean;
}

export function useSerialPort(): UseSerialPortReturn {
  const [status, setStatus] = useState<SerialStatus>("disconnected");
  const [output, setOutput] = useState<string[]>([]);
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  const isSupported = typeof navigator !== "undefined" && "serial" in navigator;

  const connect = useCallback(async (baudRate: number) => {
    if (!isSupported) {
      setStatus("error");
      return;
    }
    try {
      setStatus("connecting");
      const port = await (navigator as Navigator & { serial: { requestPort(): Promise<SerialPort> } }).serial.requestPort();
      await port.open({ baudRate });
      portRef.current = port;

      if (port.writable) {
        writerRef.current = port.writable.getWriter();
      }

      setStatus("connected");

      // Read loop
      const reader = port.readable!.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            if (lines.length > 0) {
              setOutput((prev) => [...prev.slice(-999), ...lines]);
            }
          }
        } catch {
          setStatus("disconnected");
        }
      };
      readLoop();
    } catch {
      setStatus("error");
    }
  }, [isSupported]);

  const disconnect = useCallback(async () => {
    readerRef.current?.cancel();
    writerRef.current?.releaseLock();
    await portRef.current?.close();
    portRef.current = null;
    setStatus("disconnected");
  }, []);

  const send = useCallback(async (data: string) => {
    if (!writerRef.current) return;
    const encoder = new TextEncoder();
    await writerRef.current.write(encoder.encode(data + "\n"));
  }, []);

  const clear = useCallback(() => setOutput([]), []);

  return { status, output, connect, disconnect, send, clear, isSupported };
}
