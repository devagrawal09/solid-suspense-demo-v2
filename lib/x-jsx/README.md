# X JSX

This library is a demonstration of how X's Reactivity system can be leveraged directly in JSX for considerably better performance than pairing it with a Virtual DOM library. Even the fastest Virtual DOM library will have overhead when reconciling many small discrete changes into a scheduled render and patch.

It accomplishes this with using [Babel Plugin JSX DOM Expressions](https://github.com/ryansolid/dom-expressions). It compiles JSX to DOM statements and wraps expressions in functions that can be called by the library of choice. In this case `effect` wraps these expressions ensuring the view stays up to date. Unlike Virtual DOM only the changed nodes are affected and the whole tree is not re-rendered over and over. Unlike even Vue 3 there is no hard tie to Components which should allow this approach to significantly exceed its performance.

See it as a top performer on the [JS Framework Benchmark](https://krausest.github.io/js-framework-benchmark/current.html).

To use call render:

```js
import { render } from 'x-jsx';

render(App, document.getElementById('main'));
```

And include 'babel-plugin-jsx-dom-expressions' in your babelrc, webpack babel loader, or rollup babel plugin.

```js
"plugins": [["jsx-dom-expressions", {moduleName: 'x-jsx'}]]
```

For TS JSX types add to your `tsconfig.json`:
```js
"jsx": "preserve",
"jsxImportSource": "x-jsx" 
```

