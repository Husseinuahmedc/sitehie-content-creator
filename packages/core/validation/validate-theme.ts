import { Ajv } from "ajv";
import type { Theme } from "../domain/theme.js";
import type { ValidationResult } from "./validation-result.js";

/**
 * Validate a theme object against a JSON schema.
 *
 * The schema object is passed in from the caller; this function performs no
 * filesystem or network I/O. A typical adapter wrapper loads the schema from
 * `carousel-tool/themes/theme.schema.json` and calls this function.
 */
export function validateTheme(theme: unknown, schema: object): ValidationResult {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(theme);
  const errors: string[] = [];
  if (!ok) {
    for (const err of validate.errors || []) {
      errors.push(`  • ${err.instancePath || "/"} ${err.message ?? "invalid"}`);
    }
  }
  return { ok, errors };
}

// Re-export for convenience.
export type { Theme };
