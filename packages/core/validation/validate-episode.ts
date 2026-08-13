import { Ajv } from "ajv";
import type { Episode } from "../domain/episode.js";
import type { ValidationResult } from "./validation-result.js";

/**
 * Validate an episode object against a JSON schema.
 *
 * The schema object is passed in from the caller; this function performs no
 * filesystem or network I/O. The caller may use {@link episodeSchema} exported
 * from this package, load a schema from disk, or provide its own.
 */
export function validateEpisode(episode: unknown, schema: object): ValidationResult {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(episode);
  const errors: string[] = [];
  if (!ok) {
    for (const err of validate.errors || []) {
      errors.push(`  • ${err.instancePath || "/"} ${err.message ?? "invalid"}`);
    }
  }
  return { ok, errors };
}

export type { Episode };
