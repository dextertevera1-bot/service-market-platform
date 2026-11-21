// All settings come from environment variables (see .env.example).
// With no WhatsApp or payment credentials, the platform runs in simulation mode:
// messages go to an outbox you can watch at /sim, and EcoCash payments confirm themselves.
import { readFileSync, existsSync } from "node:fs";

// Load a local .env file if there is one (production hosts set real env vars instead).
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
const env = (k, d = "") => process.env[k] ?? d;

export const config = {
  port: Number(env("PORT", "8080")),
  baseUrl: env("BASE_URL", "http://localhost:8080").replace(/\/$/, ""),
  dbPath: env("DB_PATH", "data/basa.db"),
  uploadDir: env("UPLOAD_DIR", "data/uploads"),

  // WhatsApp Cloud API (Meta). Leave WHATSAPP_TOKEN empty to simulate.
  whatsapp: {
    token: env("WHATSAPP_TOKEN"),
    phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
    verifyToken: env("WHATSAPP_VERIFY_TOKEN", "basa-verify"),
    appSecret: env("WHATSAPP_APP_SECRET"), // used to check webhook signatures
    apiVersion: env("WHATSAPP_API_VERSION", "v21.0"),
    otpTemplate: env("WHATSAPP_OTP_TEMPLATE"), // approved authentication template name, for pro log-in codes
  },

  // Payments: "sim" (auto-confirm), "manual" (merchant code, ops confirms), or "paynow" (EcoCash via Paynow).
  payments: {
    mode: env("PAYMENT_MODE", "sim"),
    merchantCode: env("ECOCASH_MERCHANT_CODE", "000000"),
    merchantName: env("ECOCASH_MERCHANT_NAME", "Basa seBasa"),
    paynowId: env("PAYNOW_INTEGRATION_ID"),
    paynowKey: env("PAYNOW_INTEGRATION_KEY"),
    paynowAuthEmail: env("PAYNOW_AUTH_EMAIL"),
    simDelayMs: Number(env("SIM_PAY_DELAY_MS", "2500")),
  },

  // Ops desk log-ins: "name:password,name2:password2". Change these before going live.
  adminUsers: Object.fromEntries(env("ADMIN_USERS", "harare:change-me,dex:change-me").split(",").map((p) => p.split(":")).filter((p) => p.length === 2)),
  sessionSecret: env("SESSION_SECRET", "dev-only-secret"),
};

export const simulated = {
  whatsapp: !config.whatsapp.token,
  payments: config.payments.mode === "sim",
};
export const isDev = env("NODE_ENV", "development") !== "production";
