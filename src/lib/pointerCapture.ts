/** Pointer capture can throw for already-released or synthetic pointers. */
export function capturePointer(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  }
  catch {
    /* drag still works for mouse input without capture */
  }
}

export function releasePointer(el: Element, pointerId: number) {
  try {
    el.releasePointerCapture(pointerId);
  }
  catch {
    /* already released */
  }
}
