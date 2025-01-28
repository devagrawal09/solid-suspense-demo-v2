import { untrack } from "@solidjs/signals";

export const sharedConfig = {};

export function createComponent(Comp: any, props: object) {
  return untrack(() => Comp(props));
}

export { createRoot as root, createRenderEffect as effect, createMemo as memo, getOwner, untrack, merge as mergeProps, flatten } from "@solidjs/signals";