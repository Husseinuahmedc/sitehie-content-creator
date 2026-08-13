/**
 * JSON schema for validating Episode JSON files.
 *
 * This schema is intentionally additive: it requires the fields every episode
 * must have (`episode`, `slides`, and `type` on each slide) while allowing the
 * per-type fields and the new optional `styleOverrides` field. Existing
 * episodes without `styleOverrides` remain valid.
 */
export const episodeSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://sitehie.com/carousel-episode.schema.json",
  title: "Sitehie Carousel Episode",
  type: "object",
  required: ["episode", "slides"],
  additionalProperties: true,
  properties: {
    episode: { type: "string", minLength: 1 },
    series: { type: "string" },
    readingTime: { type: "number" },
    slides: {
      type: "array",
      items: { $ref: "#/definitions/slide" },
    },
  },
  definitions: {
    paragraphBlock: {
      type: "object",
      required: ["text"],
      additionalProperties: false,
      properties: {
        text: { type: "string" },
        highlights: { type: "array", items: { type: "string" } },
        cyanWords: { type: "array", items: { type: "string" } },
      },
    },
    slideImage: {
      type: "object",
      required: ["asset"],
      additionalProperties: true,
      properties: {
        asset: { type: "string" },
        top: { type: "string" },
        left: { type: "string" },
        width: { type: "string" },
        height: { type: "string" },
        scale: { type: "number" },
        zIndex: { type: "number" },
      },
    },
    comparisonSide: {
      type: "object",
      additionalProperties: false,
      properties: {
        label: { type: "string" },
        points: { type: "array", items: { type: "string" } },
      },
    },
    annotation: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: { type: "string" },
        target: { type: "string" },
      },
    },
    styleOverride: {
      type: "object",
      additionalProperties: true,
      properties: {
        colors: { type: "object", additionalProperties: { type: "string" } },
        typography: { type: "object", additionalProperties: { type: "object" } },
        layout: { type: "object", additionalProperties: { type: "object" } },
        effects: { type: "object" },
      },
    },
    slide: {
      type: "object",
      required: ["type"],
      additionalProperties: true,
      properties: {
        type: {
          type: "string",
          enum: ["cover", "quote", "code", "outro", "comparison", "stat"],
        },
        styleOverrides: { $ref: "#/definitions/styleOverride" },
        fontSizes: { type: "object", additionalProperties: { type: "number" } },
        techIcons: { type: "array", items: { type: "string" } },
        images: { type: "array", items: { $ref: "#/definitions/slideImage" } },
      },
      allOf: [
        {
          if: { properties: { type: { const: "cover" } } },
          then: {
            additionalProperties: true,
            properties: {
              title: { type: "string" },
              series: { type: "string" },
              iconAsset: { type: "string" },
              iconEmoji: { type: "string" },
              iconScale: { type: "number" },
              iconOffsetX: { type: "number" },
              iconOffsetY: { type: "number" },
            },
          },
        },
        {
          if: { properties: { type: { const: "quote" } } },
          then: {
            additionalProperties: true,
            properties: {
              text: { type: "string" },
              highlights: { type: "array", items: { type: "string" } },
              cyanWords: { type: "array", items: { type: "string" } },
              paragraphs: { type: "array", items: { $ref: "#/definitions/paragraphBlock" } },
            },
          },
        },
        {
          if: { properties: { type: { const: "code" } } },
          then: {
            additionalProperties: true,
            properties: {
              titleEn: { type: "string" },
              subtitleEn: { type: "string" },
              title: { type: "string" },
              subtitle: { type: "string" },
              code: { type: "string" },
              language: { type: "string" },
              codeLanguage: { type: "string" },
              explanation: { type: "string" },
              annotations: { type: "array", items: { $ref: "#/definitions/annotation" } },
            },
          },
        },
        {
          if: { properties: { type: { const: "outro" } } },
          then: {
            additionalProperties: true,
            properties: {
              question: { type: "string" },
              cta: { type: "string" },
              handle: { type: "string" },
              imageAsset: { type: "string" },
              imagePrompt: { type: "string" },
            },
          },
        },
        {
          if: { properties: { type: { const: "comparison" } } },
          then: {
            additionalProperties: true,
            properties: {
              title: { type: "string" },
              sideA: { $ref: "#/definitions/comparisonSide" },
              sideB: { $ref: "#/definitions/comparisonSide" },
              verdict: { type: "string" },
            },
          },
        },
        {
          if: { properties: { type: { const: "stat" } } },
          then: {
            additionalProperties: true,
            properties: {
              value: { type: "string" },
              label: { type: "string" },
              subtext: { type: "string" },
            },
          },
        },
      ],
    },
  },
} as const;
