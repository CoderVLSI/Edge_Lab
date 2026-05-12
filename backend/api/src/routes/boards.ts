/**
 * GET /api/boards
 * Returns the full PlatformIO board registry.
 * Tries `pio boards --json-output` first; falls back to a curated static list
 * so the UI works even without PlatformIO installed.
 *
 * Result is cached in-process for 1 hour.
 */

import { Hono } from "hono";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface PioBoard {
  id: string;
  name: string;
  platform: string;
  frameworks: string[];
  mcu: string;
  fcpu: number;
  rom: number;   // bytes
  ram: number;   // bytes
  vendor: string;
  url?: string;
}

// ── In-process cache ────────────────────────────────────────────────────────
let _cache: PioBoard[] | null = null;
let _cacheAt = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Static fallback (used when pio is not installed) ────────────────────────
const STATIC_BOARDS: PioBoard[] = [
  // ── Arduino / AVR
  { id:"uno",            name:"Arduino Uno",               platform:"atmelavr",    frameworks:["arduino"],       mcu:"atmega328p",   fcpu:16000000,  rom:32768,   ram:2048,    vendor:"Arduino" },
  { id:"mega2560",       name:"Arduino Mega 2560",          platform:"atmelavr",    frameworks:["arduino"],       mcu:"atmega2560",   fcpu:16000000,  rom:253952,  ram:8192,    vendor:"Arduino" },
  { id:"nano",           name:"Arduino Nano",               platform:"atmelavr",    frameworks:["arduino"],       mcu:"atmega328p",   fcpu:16000000,  rom:32768,   ram:2048,    vendor:"Arduino" },
  { id:"leonardo",       name:"Arduino Leonardo",           platform:"atmelavr",    frameworks:["arduino"],       mcu:"atmega32u4",   fcpu:16000000,  rom:32256,   ram:2560,    vendor:"Arduino" },
  { id:"micro",          name:"Arduino Micro",              platform:"atmelavr",    frameworks:["arduino"],       mcu:"atmega32u4",   fcpu:16000000,  rom:32256,   ram:2560,    vendor:"Arduino" },
  { id:"pro8MHzatmega328", name:"Arduino Pro / Pro Mini (3.3V, 8 MHz)", platform:"atmelavr", frameworks:["arduino"], mcu:"atmega328p", fcpu:8000000, rom:32768, ram:2048, vendor:"Arduino" },
  { id:"nanoatmega168",  name:"Arduino Nano (ATmega168)",   platform:"atmelavr",    frameworks:["arduino"],       mcu:"atmega168",    fcpu:16000000,  rom:16384,   ram:1024,    vendor:"Arduino" },
  // ── Arduino / ARM
  { id:"due",            name:"Arduino Due",                platform:"atmelsam",    frameworks:["arduino"],       mcu:"at91sam3x8e",  fcpu:84000000,  rom:524288,  ram:98304,   vendor:"Arduino" },
  { id:"zero",           name:"Arduino Zero",               platform:"atmelsam",    frameworks:["arduino"],       mcu:"samd21g18a",   fcpu:48000000,  rom:262144,  ram:32768,   vendor:"Arduino" },
  { id:"mkr1000",        name:"Arduino MKR1000",            platform:"atmelsam",    frameworks:["arduino"],       mcu:"samd21g18a",   fcpu:48000000,  rom:262144,  ram:32768,   vendor:"Arduino" },
  { id:"mkrzero",        name:"Arduino MKR Zero",           platform:"atmelsam",    frameworks:["arduino"],       mcu:"samd21g18a",   fcpu:48000000,  rom:262144,  ram:32768,   vendor:"Arduino" },
  { id:"portenta_h7_m7", name:"Arduino Portenta H7 (M7)",   platform:"ststm32",     frameworks:["arduino","stm32cube"], mcu:"stm32h747xih6", fcpu:480000000, rom:786432, ram:524288, vendor:"Arduino" },
  // ── Espressif ESP32
  { id:"esp32dev",       name:"ESP32 Dev Module",           platform:"espressif32", frameworks:["arduino","espidf"], mcu:"esp32",     fcpu:240000000, rom:4194304, ram:327680,  vendor:"Espressif" },
  { id:"esp32-s2-saola-1", name:"ESP32-S2-Saola-1",        platform:"espressif32", frameworks:["arduino","espidf"], mcu:"esp32s2",   fcpu:240000000, rom:4194304, ram:327680,  vendor:"Espressif" },
  { id:"esp32-s3-devkitc-1", name:"ESP32-S3-DevKitC-1",    platform:"espressif32", frameworks:["arduino","espidf"], mcu:"esp32s3",   fcpu:240000000, rom:8388608, ram:524288,  vendor:"Espressif" },
  { id:"esp32-c3-devkitm-1", name:"ESP32-C3-DevKitM-1",    platform:"espressif32", frameworks:["arduino","espidf"], mcu:"esp32c3",   fcpu:160000000, rom:4194304, ram:327680,  vendor:"Espressif" },
  { id:"esp32-c6-devkitc-1", name:"ESP32-C6-DevKitC-1",    platform:"espressif32", frameworks:["arduino","espidf"], mcu:"esp32c6",   fcpu:160000000, rom:8388608, ram:524288,  vendor:"Espressif" },
  { id:"esp32-h2-devkitm-1", name:"ESP32-H2-DevKitM-1",    platform:"espressif32", frameworks:["arduino","espidf"], mcu:"esp32h2",   fcpu:96000000,  rom:4194304, ram:327680,  vendor:"Espressif" },
  { id:"lolin32",        name:"WEMOS LOLIN32",              platform:"espressif32", frameworks:["arduino"],       mcu:"esp32",        fcpu:240000000, rom:4194304, ram:327680,  vendor:"WEMOS" },
  { id:"nodemcu-32s",    name:"NodeMCU-32S",                platform:"espressif32", frameworks:["arduino"],       mcu:"esp32",        fcpu:240000000, rom:4194304, ram:327680,  vendor:"NodeMCU" },
  { id:"az-delivery-devkit-v4", name:"AZ-Delivery ESP32 DevKit V4", platform:"espressif32", frameworks:["arduino"], mcu:"esp32", fcpu:240000000, rom:4194304, ram:327680, vendor:"AZDelivery" },
  // ── Espressif ESP8266
  { id:"nodemcuv2",      name:"NodeMCU 1.0 (ESP-12E)",      platform:"espressif8266", frameworks:["arduino"],     mcu:"esp8266",      fcpu:80000000,  rom:4194304, ram:81920,   vendor:"NodeMCU" },
  { id:"d1_mini",        name:"WEMOS D1 Mini",              platform:"espressif8266", frameworks:["arduino"],     mcu:"esp8266",      fcpu:80000000,  rom:4194304, ram:81920,   vendor:"WEMOS" },
  { id:"esp01_1m",       name:"Espressif ESP-01 (1M)",      platform:"espressif8266", frameworks:["arduino"],     mcu:"esp8266",      fcpu:80000000,  rom:1048576, ram:81920,   vendor:"Espressif" },
  // ── STM32
  { id:"nucleo_f401re",  name:"ST Nucleo F401RE",           platform:"ststm32",     frameworks:["arduino","mbed","stm32cube"], mcu:"stm32f401ret6", fcpu:84000000, rom:524288, ram:98304, vendor:"ST" },
  { id:"nucleo_f411re",  name:"ST Nucleo F411RE",           platform:"ststm32",     frameworks:["arduino","mbed","stm32cube"], mcu:"stm32f411ret6", fcpu:100000000, rom:524288, ram:131072, vendor:"ST" },
  { id:"nucleo_f446re",  name:"ST Nucleo F446RE",           platform:"ststm32",     frameworks:["arduino","mbed","stm32cube"], mcu:"stm32f446ret6", fcpu:180000000, rom:524288, ram:131072, vendor:"ST" },
  { id:"nucleo_g491re",  name:"ST Nucleo G491RE",           platform:"ststm32",     frameworks:["arduino","mbed","stm32cube"], mcu:"stm32g491ret6", fcpu:170000000, rom:524288, ram:131072, vendor:"ST" },
  { id:"nucleo_h743zi",  name:"ST Nucleo H743ZI",           platform:"ststm32",     frameworks:["arduino","mbed","stm32cube"], mcu:"stm32h743zit6", fcpu:480000000, rom:2097152, ram:1048576, vendor:"ST" },
  { id:"bluepill_f103c8", name:"BluePill F103C8",           platform:"ststm32",     frameworks:["arduino","mbed","stm32cube"], mcu:"stm32f103c8t6", fcpu:72000000, rom:65536, ram:20480, vendor:"Generic" },
  { id:"blackpill_f411ce", name:"BlackPill F411CE",         platform:"ststm32",     frameworks:["arduino","stm32cube"], mcu:"stm32f411ceu6", fcpu:100000000, rom:524288, ram:131072, vendor:"WeAct" },
  { id:"stm32f4discovery", name:"ST STM32F4Discovery",      platform:"ststm32",     frameworks:["arduino","mbed","stm32cube"], mcu:"stm32f407vgt6", fcpu:168000000, rom:1048576, ram:196608, vendor:"ST" },
  { id:"disco_l072cz_lrwan1", name:"ST DISCO-L072CZ-LRWAN1", platform:"ststm32",   frameworks:["arduino","mbed","stm32cube"], mcu:"stm32l072czyx", fcpu:32000000, rom:196608, ram:20480, vendor:"ST" },
  // ── SAMD
  { id:"adafruit_feather_m0", name:"Adafruit Feather M0",   platform:"atmelsam",    frameworks:["arduino"],       mcu:"samd21g18a",   fcpu:48000000,  rom:262144,  ram:32768,   vendor:"Adafruit" },
  { id:"adafruit_feather_m4", name:"Adafruit Feather M4",   platform:"atmelsam",    frameworks:["arduino"],       mcu:"samd51j19a",   fcpu:120000000, rom:524288,  ram:196608,  vendor:"Adafruit" },
  { id:"adafruit_metro_m4_airlifted", name:"Adafruit Metro M4 AirLifted", platform:"atmelsam", frameworks:["arduino"], mcu:"samd51j19a", fcpu:120000000, rom:524288, ram:196608, vendor:"Adafruit" },
  { id:"seeed_XIAO_m0",  name:"Seeed XIAO SAMD21",         platform:"atmelsam",    frameworks:["arduino"],       mcu:"samd21g18a",   fcpu:48000000,  rom:262144,  ram:32768,   vendor:"Seeed" },
  // ── Nordic nRF52
  { id:"adafruit_feather_nrf52840", name:"Adafruit Feather nRF52840", platform:"nordicnrf52", frameworks:["arduino"], mcu:"nrf52840", fcpu:64000000, rom:1048576, ram:262144, vendor:"Adafruit" },
  { id:"nordic_nrf52840_dk", name:"Nordic nRF52840-DK",     platform:"nordicnrf52", frameworks:["arduino","zephyr"], mcu:"nrf52840", fcpu:64000000, rom:1048576, ram:262144, vendor:"Nordic" },
  { id:"nordic_nrf52832_dk", name:"Nordic nRF52832-DK",     platform:"nordicnrf52", frameworks:["arduino","zephyr"], mcu:"nrf52832", fcpu:64000000, rom:524288,  ram:65536,   vendor:"Nordic" },
  { id:"makerdiary_nrf52840_mdk", name:"Makerdiary nRF52840-MDK", platform:"nordicnrf52", frameworks:["arduino","zephyr"], mcu:"nrf52840", fcpu:64000000, rom:1048576, ram:262144, vendor:"Makerdiary" },
  { id:"adafruit_feather_nrf52832", name:"Adafruit Feather nRF52832", platform:"nordicnrf52", frameworks:["arduino"], mcu:"nrf52832", fcpu:64000000, rom:524288, ram:65536, vendor:"Adafruit" },
  // ── Nordic nRF51
  { id:"nrf51_dk",       name:"Nordic nRF51-DK",            platform:"nordicnrf51", frameworks:["arduino","mbed"], mcu:"nrf51822",    fcpu:16000000,  rom:262144,  ram:32768,   vendor:"Nordic" },
  // ── RP2040
  { id:"pico",           name:"Raspberry Pi Pico",          platform:"raspberrypi", frameworks:["arduino"],       mcu:"rp2040",       fcpu:133000000, rom:2097152, ram:270336,  vendor:"Raspberry Pi" },
  { id:"rpipicow",       name:"Raspberry Pi Pico W",        platform:"raspberrypi", frameworks:["arduino"],       mcu:"rp2040",       fcpu:133000000, rom:2097152, ram:270336,  vendor:"Raspberry Pi" },
  // ── Teensy
  { id:"teensy40",       name:"Teensy 4.0",                 platform:"teensy",      frameworks:["arduino"],       mcu:"imxrt1062",    fcpu:600000000, rom:2031616, ram:1048576, vendor:"PJRC" },
  { id:"teensy41",       name:"Teensy 4.1",                 platform:"teensy",      frameworks:["arduino"],       mcu:"imxrt1062",    fcpu:600000000, rom:8126464, ram:1048576, vendor:"PJRC" },
  { id:"teensy36",       name:"Teensy 3.6",                 platform:"teensy",      frameworks:["arduino"],       mcu:"mk66fx1m0",    fcpu:180000000, rom:1048576, ram:262144,  vendor:"PJRC" },
  { id:"teensy35",       name:"Teensy 3.5",                 platform:"teensy",      frameworks:["arduino"],       mcu:"mk64fx512",    fcpu:120000000, rom:524288,  ram:196608,  vendor:"PJRC" },
  // ── RISC-V
  { id:"sipeed-longan-nano", name:"Sipeed Longan Nano",     platform:"gd32v",       frameworks:["arduino"],       mcu:"gd32vf103cbt6", fcpu:108000000, rom:131072, ram:32768,  vendor:"Sipeed" },
  { id:"hifive1",        name:"SiFive HiFive1",             platform:"sifive",      frameworks:["freedom-e-sdk"], mcu:"fe310",         fcpu:320000000, rom:16777216, ram:16384, vendor:"SiFive" },
  { id:"hifive1-revb",   name:"SiFive HiFive1 Rev B",       platform:"sifive",      frameworks:["freedom-e-sdk"], mcu:"fe310",         fcpu:320000000, rom:16777216, ram:16384, vendor:"SiFive" },
  // ── Misc popular
  { id:"sparkfun_samd21_mini_usb", name:"SparkFun SAMD21 Mini Breakout", platform:"atmelsam", frameworks:["arduino"], mcu:"samd21g18a", fcpu:48000000, rom:262144, ram:32768, vendor:"SparkFun" },
  { id:"adafruit_grand_central_m4", name:"Adafruit Grand Central M4", platform:"atmelsam", frameworks:["arduino"], mcu:"samd51p20a", fcpu:120000000, rom:1048576, ram:262144, vendor:"Adafruit" },
  { id:"seeed_wio_terminal", name:"Seeed Wio Terminal",     platform:"atmelsam",    frameworks:["arduino"],       mcu:"samd51p19a",   fcpu:120000000, rom:524288,  ram:196608,  vendor:"Seeed" },
  { id:"lgt8f328p",      name:"LGT8F328P",                  platform:"atmelavr",    frameworks:["arduino"],       mcu:"lgt8f328p",    fcpu:32000000,  rom:32768,   ram:2048,    vendor:"LGT" },
];

// ── Platform → category mapping ─────────────────────────────────────────────
export function platformToCategory(platform: string): string {
  if (platform.startsWith("espressif")) return "ESP";
  if (platform.startsWith("ststm32") || platform.startsWith("stm32")) return "STM32";
  if (platform.startsWith("nordicnrf")) return "Nordic";
  if (platform === "raspberrypi") return "RP2040";
  if (platform === "teensy") return "Teensy";
  if (platform === "sifive" || platform === "gd32v" || platform === "kendryte") return "RISC-V";
  if (platform === "atmelsam") return "SAMD";
  if (platform === "atmelavr" || platform === "atmelmegaavr") return "Arduino";
  return "Other";
}

export const boardsRouter = new Hono();

boardsRouter.get("/", async (c) => {
  const now = Date.now();

  // Return cached result if fresh
  if (_cache && now - _cacheAt < CACHE_TTL) {
    return c.json({ boards: _cache, source: "cache", total: _cache.length });
  }

  // Try live PlatformIO
  try {
    const { stdout } = await execAsync("pio boards --json-output", { timeout: 30000 });
    const boards: PioBoard[] = JSON.parse(stdout);
    _cache = boards;
    _cacheAt = now;
    return c.json({ boards, source: "pio", total: boards.length });
  } catch {
    // pio not installed or timed out — use static fallback
    _cache = STATIC_BOARDS;
    _cacheAt = now;
    return c.json({ boards: STATIC_BOARDS, source: "static", total: STATIC_BOARDS.length });
  }
});
