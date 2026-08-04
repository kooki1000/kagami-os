// An E2E fixture: enough shape for the highlighter to have something to say.
export interface Greeting {
  name: string;
  times: number;
}

export function greet({ name, times }: Greeting): string[] {
  const lines = [];
  for (let i = 0; i < times; i++)
    lines.push(`hello ${name}`);
  return lines;
}
