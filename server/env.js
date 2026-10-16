import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
for (const name of ["../.env", "../.env.local"]) {
  const pathname = fileURLToPath(new URL(name, import.meta.url));
  if (existsSync(pathname)) process.loadEnvFile(pathname);
}
