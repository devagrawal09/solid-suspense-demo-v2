import {
  createMemo,
  untrack,
  createSignal,
  catchError,
  mapArray,
  onCleanup,
  SignalOptions,
  createSuspense
} from "@solidjs/signals";
import type { Accessor, Setter } from "@solidjs/signals";
import type { JSX } from "./jsx";

/**
 * A general `Component` has no implicit `children` prop.  If desired, you can
 * specify one as in `Component<{name: String, children: JSX.Element}>`.
 */
export type Component<P extends Record<string, any> = {}> = (props: P) => JSX.Element;

/**
 * Extend props to forbid the `children` prop.
 * Use this to prevent accidentally passing `children` to components that
 * would silently throw them away.
 */
export type VoidProps<P extends Record<string, any> = {}> = P & { children?: never };
/**
 * `VoidComponent` forbids the `children` prop.
 * Use this to prevent accidentally passing `children` to components that
 * would silently throw them away.
 */
export type VoidComponent<P extends Record<string, any> = {}> = Component<VoidProps<P>>;

/**
 * Extend props to allow an optional `children` prop with the usual
 * type in JSX, `JSX.Element` (which allows elements, arrays, functions, etc.).
 * Use this for components that you want to accept children.
 */
export type ParentProps<P extends Record<string, any> = {}> = P & { children?: JSX.Element };
/**
 * `ParentComponent` allows an optional `children` prop with the usual
 * type in JSX, `JSX.Element` (which allows elements, arrays, functions, etc.).
 * Use this for components that you want to accept children.
 */
export type ParentComponent<P extends Record<string, any> = {}> = Component<ParentProps<P>>;

/**
 * Extend props to require a `children` prop with the specified type.
 * Use this for components where you need a specific child type,
 * typically a function that receives specific argument types.
 * Note that all JSX <Elements> are of the type `JSX.Element`.
 */
export type FlowProps<P extends Record<string, any> = {}, C = JSX.Element> = P & { children: C };
/**
 * `FlowComponent` requires a `children` prop with the specified type.
 * Use this for components where you need a specific child type,
 * typically a function that receives specific argument types.
 * Note that all JSX <Elements> are of the type `JSX.Element`.
 */
export type FlowComponent<P extends Record<string, any> = {}, C = JSX.Element> = Component<
  FlowProps<P, C>
>;

export type ValidComponent = keyof JSX.IntrinsicElements | Component<any> | (string & {});

/**
 * Takes the props of the passed component and returns its type
 *
 * @example
 * ComponentProps<typeof Portal> // { mount?: Node; useShadow?: boolean; children: JSX.Element }
 * ComponentProps<'div'> // JSX.HTMLAttributes<HTMLDivElement>
 */
export type ComponentProps<T extends ValidComponent> = T extends Component<infer P>
  ? P
  : T extends keyof JSX.IntrinsicElements
  ? JSX.IntrinsicElements[T]
  : Record<string, unknown>;

/**
 * Type of `props.ref`, for use in `Component` or `props` typing.
 *
 * @example Component<{ref: Ref<Element>}>
 */
export type Ref<T> = T | ((val: T) => void);

export type ResolvedJSXElement = Exclude<JSX.Element, JSX.ArrayElement>;
export type ResolvedChildren = ResolvedJSXElement | ResolvedJSXElement[];
export type ChildrenReturn = Accessor<ResolvedChildren> & { toArray: () => ResolvedJSXElement[] };

const narrowedError = (name: string) =>
  `Attempting to access a stale value from <${name}> that could possibly be undefined. This may occur because you are reading the accessor returned from the component at a time where it has already been unmounted. We recommend cleaning up any stale timers or async, or reading from the initial condition.`;

/**
 * Resolves child elements to help interact with children
 *
 * @param fn an accessor for the children
 * @returns a accessor of the same children, but resolved
 *
 * @description https://docs.solidjs.com/reference/component-apis/children
 */
export function children(fn: Accessor<JSX.Element>): ChildrenReturn {
  const children = createMemo(fn);
  const memo = createMemo(() => resolveChildren(children()));
  (memo as ChildrenReturn).toArray = () => {
    const c = memo();
    return Array.isArray(c) ? c : c != null ? [c] : [];
  };
  return memo as ChildrenReturn;
}

/**
 * Creates a list elements from a list
 *
 * it receives a map function as its child that receives a list element and an accessor with the index and returns a JSX-Element; if the list is empty, an optional fallback is returned:
 * ```typescript
 * <For each={items} fallback={<div>No items</div>}>
 *   {(item, index) => <div data-index={index()}>{item}</div>}
 * </For>
 * ```
 * If you have a list with fixed indices and changing values, consider using `<Index>` instead.
 *
 * @description https://docs.solidjs.com/reference/components/for
 */
export function For<T extends readonly any[], U extends JSX.Element>(props: {
  each: T | undefined | null | false;
  fallback?: JSX.Element;
  keyed?: boolean | ((item: T) => any);
  children: (item: Accessor<T[number]>, index: Accessor<number>) => U;
}) {
  const options =
    "fallback" in props
      ? { keyed: props.keyed, fallback: () => props.fallback }
      : { keyed: props.keyed };
  return createMemo(mapArray(() => props.each, props.children, options)) as unknown as JSX.Element;
}

/**
 * Conditionally render its children or an optional fallback component
 * @description https://docs.solidjs.com/reference/components/show
 */
export function Show<T>(props: {
  when: T | undefined | null | false;
  keyed?: boolean;
  fallback?: JSX.Element;
  children: JSX.Element | ((item: Accessor<NonNullable<T>>) => JSX.Element);
}): JSX.Element {
  const keyed = props.keyed;
  const condition = createMemo<T | undefined | null | boolean>(() => props.when, undefined, {
    equals: (a, b) => (keyed ? a === b : !a === !b)
  });
  return createMemo(() => {
    const c = condition();
    if (c) {
      const child = props.children;
      const fn = typeof child === "function" && child.length > 0;
      return fn
        ? untrack(() =>
            (child as any)(() => {
              if (!untrack(condition)) throw narrowedError("Show");
              return props.when;
            })
          )
        : child;
    }
    return props.fallback;
  }) as unknown as JSX.Element;
}

type EvalConditions = readonly [number, unknown?, MatchProps<unknown>?];

/**
 * Switches between content based on mutually exclusive conditions
 * ```typescript
 * <Switch fallback={<FourOhFour />}>
 *   <Match when={state.route === 'home'}>
 *     <Home />
 *   </Match>
 *   <Match when={state.route === 'settings'}>
 *     <Settings />
 *   </Match>
 * </Switch>
 * ```
 * @description https://docs.solidjs.com/reference/components/switch-and-match
 */
export function Switch(props: { fallback?: JSX.Element; children: JSX.Element }): JSX.Element {
  let keyed = false;
  const equals: SignalOptions<EvalConditions>["equals"] = (a, b) =>
    (keyed ? a[1] === b[1] : !a[1] === !b[1]) && a[2] === b[2];
  const conditions = children(() => props.children) as unknown as () => MatchProps<unknown>[],
    evalConditions = createMemo(
      (): EvalConditions => {
        let conds = conditions();
        if (!Array.isArray(conds)) conds = [conds];
        for (let i = 0; i < conds.length; i++) {
          const c = conds[i].when;
          if (c) {
            keyed = !!conds[i].keyed;
            return [i, c, conds[i]];
          }
        }
        return [-1];
      },
      undefined,
      { equals }
    );
  return createMemo(() => {
    const [index, when, cond] = evalConditions();
    if (index < 0) return props.fallback;
    const c = cond!.children;
    const fn = typeof c === "function" && c.length > 0;
    return fn
      ? untrack(() =>
          (c as any)(() => {
            if (untrack(evalConditions)[0] !== index) throw narrowedError("Match");
            return cond!.when;
          })
        )
      : c;
  }) as unknown as JSX.Element;
}

export type MatchProps<T> = {
  when: T | undefined | null | false;
  keyed?: boolean;
  children: JSX.Element | ((item: Accessor<NonNullable<T>>) => JSX.Element);
};
/**
 * Selects a content based on condition when inside a `<Switch>` control flow
 * ```typescript
 * <Match when={condition()}>
 *   <Content/>
 * </Match>
 * ```
 * @description https://docs.solidjs.com/reference/components/switch-and-match
 */
export function Match<T>(props: MatchProps<T>) {
  return props as unknown as JSX.Element;
}

let Errors: Set<Setter<any>>;
export function resetErrorBoundaries() {
  Errors && [...Errors].forEach(fn => fn());
}
/**
 * Catches uncaught errors inside components and renders a fallback content
 *
 * Also supports a callback form that passes the error and a reset function:
 * ```typescript
 * <ErrorBoundary fallback={
 *   (err, reset) => <div onClick={reset}>Error: {err.toString()}</div>
 * }>
 *   <MyComp />
 * </ErrorBoundary>
 * ```
 * Errors thrown from the fallback can be caught by a parent ErrorBoundary
 *
 * @description https://docs.solidjs.com/reference/components/error-boundary
 */
export function ErrorBoundary(props: {
  fallback: JSX.Element | ((err: any, reset: () => void) => JSX.Element);
  children: JSX.Element;
}): JSX.Element {
  let err;
  const [errored, setErrored] = createSignal<any>(err);
  Errors || (Errors = new Set());
  Errors.add(setErrored);
  onCleanup(() => Errors.delete(setErrored));
  return createMemo(() => {
    let e: any;
    if ((e = errored())) {
      const f = props.fallback;
      return typeof f === "function" && f.length ? untrack(() => f(e, () => setErrored())) : f;
    }
    return catchError(() => props.children, setErrored);
  }) as unknown as JSX.Element;
}

/**
 * Tracks all resources inside a component and renders a fallback until they are all resolved
 * ```typescript
 * const AsyncComponent = lazy(() => import('./component'));
 *
 * <Suspense fallback={<LoadingIndicator />}>
 *   <AsyncComponent />
 * </Suspense>
 * ```
 * @description https://docs.solidjs.com/reference/components/suspense
 */
export function Suspense(props: { fallback?: JSX.Element; children: JSX.Element }): JSX.Element {
  return createSuspense(
    () => props.children,
    () => props.fallback
  ) as unknown as JSX.Element;
}

function resolveChildren(children: JSX.Element | Accessor<any>): ResolvedChildren {
  if (typeof children === "function" && !children.length) return resolveChildren(children());
  if (Array.isArray(children)) {
    const results: any[] = [];
    for (let i = 0; i < children.length; i++) {
      const result = resolveChildren(children[i]);
      Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
    }
    return results;
  }
  return children as ResolvedChildren;
}
