import type { AiTool, AiToolParameters } from './ai.model';

/** A tool result the model reads. Generous, but a runaway listing can't fill the context. */
const MAX_OUTPUT_CHARS = 24_000;

export interface ToolRun {
  readonly isError: boolean;
  readonly output: string;
}

/**
 * Run a tool the model asked for. Model output is untrusted, so its arguments are
 * checked against the tool's schema first; every failure comes back as a result
 * the model can read and correct, never as an exception that ends the turn.
 */
export function runTool(tools: readonly AiTool[], name: string, args: unknown): ToolRun {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { isError: true, output: `There is no tool called "${name}".` };

  const problem = argumentProblem(tool.parameters, args);
  if (problem) return { isError: true, output: problem };

  try {
    const output = JSON.stringify(tool.run(args as Readonly<Record<string, unknown>>)) ?? 'null';
    return {
      isError: false,
      output:
        output.length > MAX_OUTPUT_CHARS
          ? `${output.slice(0, MAX_OUTPUT_CHARS)}… (cut off: narrow the query)`
          : output,
    };
  } catch (err) {
    return { isError: true, output: err instanceof Error ? err.message : String(err) };
  }
}

function argumentProblem(schema: AiToolParameters, args: unknown): string | null {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return 'Arguments must be an object.';
  const record = args as Record<string, unknown>;

  for (const key of schema.required) {
    if (record[key] === undefined || record[key] === null) return `Missing required argument "${key}".`;
  }
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null) continue;
    const prop = schema.properties[key];
    if (!prop) return `Unknown argument "${key}".`;
    const fits =
      prop.type === 'array'
        ? Array.isArray(value) && value.every((v) => typeof v === 'string')
        : prop.type === 'integer'
          ? Number.isInteger(value)
          : typeof value === prop.type;
    if (!fits) return `Argument "${key}" must be ${prop.type === 'array' ? 'a list of strings' : `a ${prop.type}`}.`;
    if (prop.enum && !prop.enum.includes(value as string)) {
      return `Argument "${key}" must be one of: ${prop.enum.join(', ')}.`;
    }
  }
  return null;
}
