import { describe, expect, it } from "vitest";
import { createWriteQueue } from "./asyncQueue";

describe("createWriteQueue", () => {
  it("runs tasks in the order they were enqueued, not the order they resolve", async () => {
    const enqueue = createWriteQueue();
    const order: number[] = [];
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const first = enqueue(async () => {
      await delay(10);
      order.push(1);
    });
    const second = enqueue(async () => {
      order.push(2);
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });

  it("keeps queueing later tasks after an earlier one rejects", async () => {
    const enqueue = createWriteQueue();

    await expect(enqueue(async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");

    await expect(enqueue(async () => "still works")).resolves.toBe("still works");
  });

  it("returns each task's own resolved value", async () => {
    const enqueue = createWriteQueue();
    expect(await enqueue(async () => 42)).toBe(42);
  });
});
