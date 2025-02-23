import { createHTML } from "lit-dom-expressions";
import {
  effect,
  style,
  insert,
  untrack,
  spread,
  createComponent,
  delegateEvents,
  className,
  dynamicProperty,
  mergeProps,
  setAttribute,
  setAttributeNS,
  addEventListener,
  getPropAlias,
  Properties,
  ChildProperties,
  DelegatedEvents,
  SVGElements,
  SVGNamespace
} from "./index.js";

export const html = createHTML({
  effect,
  style,
  insert,
  untrack,
  spread,
  createComponent,
  delegateEvents,
  className,
  mergeProps,
  dynamicProperty,
  setAttribute,
  setAttributeNS,
  addEventListener,
  getPropAlias,
  Properties,
  ChildProperties,
  DelegatedEvents,
  SVGElements,
  SVGNamespace
});
