import type { CalculatorState } from "./calculatorEngine";
import { describe, expect, it } from "vitest";
import {
  applyUnary,
  backspace,
  clear,
  clearEntry,
  evaluate,
  INITIAL_STATE,
  inputDecimal,
  inputDigit,
  inputOperator,
  memoryAdd,
  memoryClear,
  memoryRecall,
  memorySubtract,
  percent,
  setAngleMode,
  toggleSign,
} from "./calculatorEngine";

function press(state: CalculatorState, digits: string): CalculatorState {
  return [...digits].reduce((s, d) => inputDigit(s, d), state);
}

describe("digit entry", () => {
  it("builds a multi-digit number and overwrites after a fresh start", () => {
    const s = press(INITIAL_STATE, "42");
    expect(s.display).toBe("42");
  });

  it("replaces the leading zero rather than appending to it", () => {
    const s = inputDigit(INITIAL_STATE, "5");
    expect(s.display).toBe("5");
  });

  it("supports a decimal point, once", () => {
    let s = press(INITIAL_STATE, "3");
    s = inputDecimal(s);
    s = inputDigit(s, "14");
    s = inputDecimal(s); // second '.' ignored
    expect(s.display).toBe("3.14");
  });

  it("backspace removes the last digit and floors at 0", () => {
    let s = press(INITIAL_STATE, "12");
    s = backspace(s);
    expect(s.display).toBe("1");
    s = backspace(s);
    expect(s.display).toBe("0");
  });

  it("toggles sign", () => {
    const s = toggleSign(press(INITIAL_STATE, "7"));
    expect(s.display).toBe("-7");
    expect(toggleSign(s).display).toBe("7");
  });
});

describe("arithmetic chains", () => {
  it("2 + 3 = 5", () => {
    let s = press(INITIAL_STATE, "2");
    s = inputOperator(s, "+");
    s = press(s, "3");
    s = evaluate(s);
    expect(s.display).toBe("5");
  });

  it("chains operators left-to-right without an explicit equals: 2 + 3 × 4 = 20", () => {
    let s = press(INITIAL_STATE, "2");
    s = inputOperator(s, "+");
    s = press(s, "3");
    s = inputOperator(s, "×"); // evaluates the pending '+' first: 2+3=5
    s = press(s, "4");
    s = evaluate(s);
    expect(s.display).toBe("20");
  });

  it("collapses floating-point noise: 0.1 + 0.2 = 0.3", () => {
    let s = inputDecimal(inputDigit(INITIAL_STATE, "0"));
    s = inputDigit(s, "1");
    s = inputOperator(s, "+");
    s = inputDecimal(inputDigit(s, "0"));
    s = inputDigit(s, "2");
    s = evaluate(s);
    expect(s.display).toBe("0.3");
  });

  it("division by zero enters the Error state, escaped only by clear", () => {
    let s = press(INITIAL_STATE, "5");
    s = inputOperator(s, "÷");
    s = press(s, "0");
    s = evaluate(s);
    expect(s.display).toBe("Error");
    expect(s.error).toBe(true);
    expect(inputDigit(s, "1")).toBe(s);
    expect(inputOperator(s, "+")).toBe(s);
    const cleared = clear(s);
    expect(cleared.display).toBe("0");
    expect(cleared.error).toBe(false);
  });

  it("percent divides the current value by 100", () => {
    const s = percent(press(INITIAL_STATE, "50"));
    expect(s.display).toBe("0.5");
  });
});

describe("clear vs clear-entry", () => {
  it("clearEntry resets only the pending number, not the running total", () => {
    let s = press(INITIAL_STATE, "9");
    s = inputOperator(s, "+");
    s = press(s, "99");
    s = clearEntry(s);
    expect(s.display).toBe("0");
    s = press(s, "1");
    s = evaluate(s);
    expect(s.display).toBe("10");
  });

  it("clear (AC) resets the whole calculation but keeps memory and angle mode", () => {
    let s = memoryAdd(press(INITIAL_STATE, "3"));
    s = setAngleMode(s, "rad");
    s = press(s, "1");
    s = inputOperator(s, "+");
    const cleared = clear(s);
    expect(cleared.display).toBe("0");
    expect(cleared.pendingOp).toBeNull();
    expect(cleared.memory).toBe(3);
    expect(cleared.angleMode).toBe("rad");
  });
});

describe("scientific functions", () => {
  it("sin(90deg) = 1", () => {
    const s = applyUnary(press(INITIAL_STATE, "90"), "sin");
    expect(Number(s.display)).toBeCloseTo(1, 10);
  });

  it("respects the radian angle mode", () => {
    const withRad = setAngleMode(INITIAL_STATE, "rad");
    const s = applyUnary(press(withRad, "0"), "cos");
    expect(Number(s.display)).toBe(1);
  });

  it("sqrt(16) = 4", () => {
    const s = applyUnary(press(INITIAL_STATE, "16"), "sqrt");
    expect(s.display).toBe("4");
  });

  it("ln and log10 use Math's real logarithms", () => {
    const ln = applyUnary(press(INITIAL_STATE, "1"), "ln");
    expect(Number(ln.display)).toBe(0);
    const log10 = applyUnary(press(INITIAL_STATE, "100"), "log10");
    expect(Number(log10.display)).toBe(2);
  });

  it("factorial of a non-negative integer", () => {
    const s = applyUnary(press(INITIAL_STATE, "5"), "factorial");
    expect(s.display).toBe("120");
  });

  it("factorial of a non-integer is a domain error", () => {
    let s = press(INITIAL_STATE, "2");
    s = inputDecimal(s);
    s = inputDigit(s, "5");
    s = applyUnary(s, "factorial");
    expect(s.error).toBe(true);
  });

  it("asin outside [-1, 1] is a domain error (NaN)", () => {
    const s = applyUnary(press(INITIAL_STATE, "2"), "asin");
    expect(s.error).toBe(true);
  });

  it("reciprocal and square", () => {
    expect(applyUnary(press(INITIAL_STATE, "4"), "reciprocal").display).toBe("0.25");
    expect(applyUnary(press(INITIAL_STATE, "4"), "square").display).toBe("16");
  });
});

describe("memory", () => {
  it("adds, subtracts, recalls, and clears via M+/M-/MR/MC", () => {
    let s = memoryAdd(press(INITIAL_STATE, "10"));
    s = clearEntry(s);
    s = memorySubtract(press(s, "4"));
    expect(s.memory).toBe(6);
    s = memoryRecall(clearEntry(s));
    expect(s.display).toBe("6");
    s = memoryClear(s);
    expect(s.memory).toBe(0);
  });
});
