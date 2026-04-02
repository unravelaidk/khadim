import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { z } from "zod";

type ToolDefinition<TSchemaZod extends z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: TSchemaZod;
};

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value, null, 2);
}

function withDescription<T extends TSchema>(schema: T, zodSchema: z.ZodTypeAny): T {
  const description = zodSchema.description;
  return description ? (Type.Unsafe({ ...schema, description }) as T) : schema;
}

function unwrapSchema(schema: z.ZodTypeAny): { schema: z.ZodTypeAny; optional: boolean } {
  let current: any = schema;
  let optional = false;

  while (true) {
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = current.unwrap();
      continue;
    }

    if (current instanceof z.ZodDefault) {
      current = current._def.innerType;
      continue;
    }

    break;
  }

  return { schema: current, optional };
}

function zodToTypeBox(schema: z.ZodTypeAny): TSchema {
  if (schema instanceof z.ZodString) {
    return withDescription(Type.String(), schema);
  }

  if (schema instanceof z.ZodNumber) {
    return withDescription(Type.Number(), schema);
  }

  if (schema instanceof z.ZodBoolean) {
    return withDescription(Type.Boolean(), schema);
  }

  if (schema instanceof z.ZodEnum) {
    const values: string[] = Array.from((schema as any).options as Iterable<string>);
    return withDescription(Type.Union(values.map((value: string) => Type.Literal(value))), schema);
  }

  if (schema instanceof z.ZodArray) {
    return withDescription(Type.Array(zodToTypeBox((schema as any).element as z.ZodTypeAny)), schema);
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, TSchema> = {};

    for (const [key, value] of Object.entries(shape)) {
      const unwrapped = unwrapSchema(value as z.ZodTypeAny);
      properties[key] = unwrapped.optional
        ? Type.Optional(zodToTypeBox(unwrapped.schema))
        : zodToTypeBox(unwrapped.schema);
    }

    return withDescription(Type.Object(properties), schema);
  }

  if (schema instanceof z.ZodLiteral) {
    return withDescription(Type.Literal((schema as any).values?.values().next().value ?? (schema as any).value), schema);
  }

  // z.preprocess() / .pipe() / .transform() — unwrap to the output schema
  const defType = (schema as any)._def?.type as string | undefined;

  if (defType === "pipe") {
    return withDescription(zodToTypeBox((schema as any)._def.out as z.ZodTypeAny), schema);
  }

  if (defType === "transform") {
    return withDescription(zodToTypeBox((schema as any)._def.schema as z.ZodTypeAny), schema);
  }

  throw new Error(`Unsupported Zod schema for pi tool conversion: ${schema.constructor.name} (def.type=${defType})`);
}

export function tool<TSchemaZod extends z.ZodTypeAny>(
  handler: (input: z.infer<TSchemaZod>) => Promise<unknown> | unknown,
  definition: ToolDefinition<TSchemaZod>
): AgentTool<TSchema, { output: unknown }> {
  const parameters = zodToTypeBox(definition.schema);

  return {
    name: definition.name,
    label: definition.name,
    description: definition.description,
    parameters,
    execute: async (_toolCallId: string, params: Static<typeof parameters>) => {
      const parsed = definition.schema.parse(params);
      const output = await handler(parsed);
      return {
        content: [{ type: "text", text: toText(output) }],
        details: { output },
      };
    },
  };
}
