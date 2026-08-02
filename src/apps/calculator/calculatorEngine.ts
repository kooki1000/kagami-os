/**
 * Pure scientific-calculator state machine, split out from `CalculatorApp.tsx`
 * so it's unit-testable in Vitest's `node` environment (no DOM), mirroring
 * `src/apps/documents/pageNav.ts`. Every function takes the current state and
 * returns the next state — no mutation, no I/O. Scientific functions are all
 * `Math.*` calls; `factorial` is the one function with no `Math` equivalent,
 * so it's the sole hand-rolled bit of arithmetic here.
 */

export type Operator = "+" | "-" | "×" | "÷";
export type AngleMode = "deg" | "rad";
export type UnaryFn
  = | "sin" | "cos" | "tan"
    | "asin" | "acos" | "atan"
    | "ln" | "log10" | "sqrt" | "square" | "reciprocal" | "exp" | "factorial";

export interface CalculatorState {
  display: string;
  previousValue: number | null;
  pendingOp: Operator | null;
  /** True when the next digit press should replace `display` rather than append to it. */
  overwrite: boolean;
  memory: number;
  angleMode: AngleMode;
  error: boolean;
}

export const INITIAL_STATE: CalculatorState = {
  display: "0",
  previousValue: null,
  pendingOp: null,
  overwrite: true,
  memory: 0,
  angleMode: "deg",
  error: false,
};

const MAX_DIGITS = 15;

/** Collapses floating-point noise (0.1 + 0.2 → 0.30000000000000004) before display. */
function formatNumber(value: number): string {
  const clean = Object.is(value, -0) ? 0 : value;
  const rounded = Math.round(clean * 1e12) / 1e12;
  return rounded.toString();
}

function computeOp(a: number, b: number, op: Operator): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return a / b; // b === 0 → Infinity/NaN, both routed to the Error state by callers
  }
}

function toDisplayAngle(radians: number, mode: AngleMode): number {
  return mode === "deg" ? (radians * 180) / Math.PI : radians;
}

function factorial(x: number): number {
  if (!Number.isInteger(x) || x < 0)
    return Number.NaN;
  let result = 1;
  for (let i = 2; i <= x; i++)
    result *= i;
  return result;
}

function toErrorState(state: CalculatorState): CalculatorState {
  return { ...INITIAL_STATE, display: "Error", error: true, memory: state.memory, angleMode: state.angleMode };
}

export function inputDigit(state: CalculatorState, digit: string): CalculatorState {
  if (state.error)
    return state;
  if (state.overwrite)
    return { ...state, display: digit, overwrite: false };
  if (state.display.replace("-", "").length >= MAX_DIGITS)
    return state;
  if (state.display === "0")
    return { ...state, display: digit };
  return { ...state, display: state.display + digit };
}

export function inputDecimal(state: CalculatorState): CalculatorState {
  if (state.error)
    return state;
  if (state.overwrite)
    return { ...state, display: "0.", overwrite: false };
  if (state.display.includes("."))
    return state;
  return { ...state, display: `${state.display}.` };
}

export function backspace(state: CalculatorState): CalculatorState {
  if (state.error || state.overwrite)
    return state;
  const trimmed = state.display.length > 1 ? state.display.slice(0, -1) : "0";
  const next = trimmed === "-" ? "0" : trimmed;
  return { ...state, display: next, overwrite: false };
}

export function toggleSign(state: CalculatorState): CalculatorState {
  if (state.error || state.display === "0")
    return state;
  const next = state.display.startsWith("-") ? state.display.slice(1) : `-${state.display}`;
  return { ...state, display: next };
}

export function percent(state: CalculatorState): CalculatorState {
  if (state.error)
    return state;
  return { ...state, display: formatNumber(Number(state.display) / 100), overwrite: true };
}

/** All-clear — resets the whole calculation but keeps memory and the angle-mode setting. */
export function clear(state: CalculatorState): CalculatorState {
  return { ...INITIAL_STATE, memory: state.memory, angleMode: state.angleMode };
}

/** Clear-entry — resets only the current number being typed. Behaves like `clear` once in error. */
export function clearEntry(state: CalculatorState): CalculatorState {
  if (state.error)
    return clear(state);
  return { ...state, display: "0", overwrite: true };
}

export function inputOperator(state: CalculatorState, op: Operator): CalculatorState {
  if (state.error)
    return state;
  const current = Number(state.display);
  if (state.pendingOp !== null && !state.overwrite) {
    const result = computeOp(state.previousValue ?? 0, current, state.pendingOp);
    if (!Number.isFinite(result))
      return toErrorState(state);
    return { ...state, display: formatNumber(result), previousValue: result, pendingOp: op, overwrite: true };
  }
  return { ...state, previousValue: current, pendingOp: op, overwrite: true };
}

export function evaluate(state: CalculatorState): CalculatorState {
  if (state.error || state.pendingOp === null || state.previousValue === null)
    return state;
  const result = computeOp(state.previousValue, Number(state.display), state.pendingOp);
  if (!Number.isFinite(result))
    return toErrorState(state);
  return { ...state, display: formatNumber(result), previousValue: null, pendingOp: null, overwrite: true };
}

export function applyUnary(state: CalculatorState, fn: UnaryFn): CalculatorState {
  if (state.error)
    return state;
  const x = Number(state.display);
  const rad = state.angleMode === "deg" ? (x * Math.PI) / 180 : x;
  let result: number;
  switch (fn) {
    case "sin":
      result = Math.sin(rad);
      break;
    case "cos":
      result = Math.cos(rad);
      break;
    case "tan":
      result = Math.tan(rad);
      break;
    case "asin":
      result = toDisplayAngle(Math.asin(x), state.angleMode);
      break;
    case "acos":
      result = toDisplayAngle(Math.acos(x), state.angleMode);
      break;
    case "atan":
      result = toDisplayAngle(Math.atan(x), state.angleMode);
      break;
    case "ln":
      result = Math.log(x);
      break;
    case "log10":
      result = Math.log10(x);
      break;
    case "sqrt":
      result = Math.sqrt(x);
      break;
    case "square":
      result = x ** 2;
      break;
    case "reciprocal":
      result = 1 / x;
      break;
    case "exp":
      result = Math.exp(x);
      break;
    case "factorial":
      result = factorial(x);
      break;
  }
  if (!Number.isFinite(result))
    return toErrorState(state);
  return { ...state, display: formatNumber(result), overwrite: true };
}

export function setAngleMode(state: CalculatorState, mode: AngleMode): CalculatorState {
  return { ...state, angleMode: mode };
}

export function memoryAdd(state: CalculatorState): CalculatorState {
  return state.error ? state : { ...state, memory: state.memory + Number(state.display) };
}

export function memorySubtract(state: CalculatorState): CalculatorState {
  return state.error ? state : { ...state, memory: state.memory - Number(state.display) };
}

export function memoryRecall(state: CalculatorState): CalculatorState {
  return state.error ? state : { ...state, display: formatNumber(state.memory), overwrite: true };
}

export function memoryClear(state: CalculatorState): CalculatorState {
  return { ...state, memory: 0 };
}
