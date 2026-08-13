import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // These packages are loaded at runtime in the API routes. They are
  // excluded from the server bundle because they pull in native
  // dependencies or CommonJS modules that webpack cannot handle cleanly.
  serverExternalPackages: [
    "playwright",
    "ajv",
    "prismjs",
    "@sitehie/render-engine",
    "@sitehie/storage-file",
    "@sitehie/ai-tools",
  ],
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
