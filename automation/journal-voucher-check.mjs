import { chromium } from "playwright";

const dryRun = String(process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
if (!process.env.CENTURY_USERNAME || !process.env.CENTURY_PASSWORD) {
  throw new Error("Missing CENTURY_USERNAME or CENTURY_PASSWORD GitHub Secret");
}

console.log(JSON.stringify({
  status: "SCAFFOLD_ONLY",
  dryRun,
  message: "Live Century CCPL selectors and login flow must be verified before enabling writes."
}));

// Intentionally fail closed until selectors are verified against the live ERP.
// No credentials are printed and no external changes are attempted.
process.exit(2);