import type { Operator, UnaryFn } from "./calculatorEngine";
import type { AppWindowProps } from "@/system/apps/types";
import { useEffect, useState } from "react";
import { useAppCommand } from "@/system/appCommands";
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

const padButton
  = "grid h-9 place-items-center rounded-btn text-13 font-medium text-ink enabled:hover:bg-ph disabled:opacity-35";
const operatorButton = `${padButton} text-accent`;
const sciButton
  = "grid h-8 place-items-center rounded-btn text-11.5 font-medium text-ink-2 enabled:hover:bg-ph enabled:hover:text-ink";

const SCI_BUTTONS: { label: string; fn: UnaryFn }[][] = [
  [{ label: "sin", fn: "sin" }, { label: "cos", fn: "cos" }, { label: "tan", fn: "tan" }],
  [{ label: "sin⁻¹", fn: "asin" }, { label: "cos⁻¹", fn: "acos" }, { label: "tan⁻¹", fn: "atan" }],
  [{ label: "ln", fn: "ln" }, { label: "log", fn: "log10" }, { label: "√x", fn: "sqrt" }],
  [{ label: "x²", fn: "square" }, { label: "1/x", fn: "reciprocal" }, { label: "eˣ", fn: "exp" }],
  [{ label: "x!", fn: "factorial" }],
];

export default function CalculatorApp({ windowId, focused }: AppWindowProps) {
  const [state, setState] = useState(INITIAL_STATE);

  useAppCommand(windowId, (command) => {
    if (command === "calculator.copyResult")
      void navigator.clipboard.writeText(state.display);
  });

  useEffect(() => {
    if (!focused)
      return;
    function onKeyDown(e: KeyboardEvent): void {
      if (/^\d$/.test(e.key)) {
        setState(s => inputDigit(s, e.key));
        return;
      }
      switch (e.key) {
        case ".":
          setState(inputDecimal);
          break;
        case "+":
          setState(s => inputOperator(s, "+"));
          break;
        case "-":
          setState(s => inputOperator(s, "-"));
          break;
        case "*":
          setState(s => inputOperator(s, "×"));
          break;
        case "/":
          setState(s => inputOperator(s, "÷"));
          break;
        case "Enter":
        case "=":
          setState(evaluate);
          break;
        case "Backspace":
          setState(backspace);
          break;
        case "Escape":
          setState(clear);
          break;
        case "%":
          setState(percent);
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused]);

  function pressOperator(op: Operator): void {
    setState(s => inputOperator(s, op));
  }

  return (
    <div className="flex h-full flex-col bg-surface select-none">
      <div className="flex flex-none flex-col items-end gap-0.5 px-4 py-3 hairline-b">
        <div className="flex w-full items-center justify-between text-11 text-ink-2">
          <button
            type="button"
            className="rounded-btn px-1.5 py-0.5 font-medium tabular-nums hover:bg-ph hover:text-ink"
            onClick={() => setState(s => setAngleMode(s, s.angleMode === "deg" ? "rad" : "deg"))}
          >
            {state.angleMode.toUpperCase()}
          </button>
          <span className="tabular-nums">{state.memory !== 0 ? "M" : ""}</span>
        </div>
        <div className="w-full truncate text-right font-mono text-[calc(28px*var(--ui-scale))] leading-tight text-ink tabular-nums">
          {state.display}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <div className="grid w-28 flex-none auto-rows-fr grid-cols-3 gap-1">
          {SCI_BUTTONS.flat().map(({ label, fn }) => (
            <button key={fn} type="button" className={sciButton} onClick={() => setState(s => applyUnary(s, fn))}>
              {label}
            </button>
          ))}
          <button type="button" className={sciButton} onClick={() => setState(memoryAdd)}>M+</button>
          <button type="button" className={sciButton} onClick={() => setState(memorySubtract)}>M−</button>
          <button type="button" className={sciButton} onClick={() => setState(memoryRecall)}>MR</button>
          <button type="button" className={sciButton} onClick={() => setState(memoryClear)}>MC</button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="grid flex-1 grid-cols-4 gap-1">
            <button type="button" className={padButton} onClick={() => setState(clear)}>C</button>
            <button type="button" className={padButton} onClick={() => setState(clearEntry)}>CE</button>
            <button type="button" className={padButton} onClick={() => setState(backspace)}>⌫</button>
            <button type="button" className={operatorButton} onClick={() => pressOperator("÷")}>÷</button>

            <button type="button" className={padButton} onClick={() => setState(s => inputDigit(s, "7"))}>7</button>
            <button type="button" className={padButton} onClick={() => setState(s => inputDigit(s, "8"))}>8</button>
            <button type="button" className={padButton} onClick={() => setState(s => inputDigit(s, "9"))}>9</button>
            <button type="button" className={operatorButton} onClick={() => pressOperator("×")}>×</button>

            <button type="button" className={padButton} onClick={() => setState(s => inputDigit(s, "4"))}>4</button>
            <button type="button" className={padButton} onClick={() => setState(s => inputDigit(s, "5"))}>5</button>
            <button type="button" className={padButton} onClick={() => setState(s => inputDigit(s, "6"))}>6</button>
            <button type="button" className={operatorButton} onClick={() => pressOperator("-")}>−</button>

            <button type="button" className={padButton} onClick={() => setState(s => inputDigit(s, "1"))}>1</button>
            <button type="button" className={padButton} onClick={() => setState(s => inputDigit(s, "2"))}>2</button>
            <button type="button" className={padButton} onClick={() => setState(s => inputDigit(s, "3"))}>3</button>
            <button type="button" className={operatorButton} onClick={() => pressOperator("+")}>+</button>

            <button type="button" className={padButton} onClick={() => setState(toggleSign)}>±</button>
            <button type="button" className={padButton} onClick={() => setState(percent)}>%</button>
            <button type="button" className={padButton} onClick={() => setState(s => inputDigit(s, "0"))}>0</button>
            <button type="button" className={padButton} onClick={() => setState(inputDecimal)}>.</button>
          </div>
          <button
            type="button"
            className="h-10 flex-none rounded-btn bg-accent text-[calc(15px*var(--ui-scale))] font-semibold text-white hover:opacity-90"
            onClick={() => setState(evaluate)}
          >
            =
          </button>
        </div>
      </div>
    </div>
  );
}
