import { Suspense, render, ErrorBoundary } from "x-jsx";
import { createSignal, createAsync, createEffect } from "@solidjs/signals";

function PhraseCounter() {
  console.log(`Rendering PhraseCounter`);

  const [count, setCount] = createSignal(() => 0);
  const hello = createAsync(() => getHello());
  const phrase = createAsync(() => getPhrase(count()));

  createEffect(phrase, (phrase) => console.log({ phrase }));

  return (
    <Suspense fallback={<p>Loading phrase counter...</p>}>
      <h1>{hello()}</h1>
      <button
        class="increment"
        onClick={() => setCount(count() + 1)}
        type="button"
      >
        Clicks: {count()}
      </button>
      <Suspense fallback={<p>Loading phrase...</p>}>
        <Message text={phrase().toUpperCase()} />
      </Suspense>
    </Suspense>
  );
}

function Message(props) {
  console.log(`Rendering <Message>`);
  return <p>The message is: {props.text}</p>;
}

const phrases = [
  "Zero is the number of times I've given up.",
  "One is the number of times I've tried.",
  "Two is the number of times I've failed.",
  "Three is the number of times I've succeeded.",
  "Four is the number of times I've been lucky.",
  "Five is the number of times I've been unlucky.",
  "Six is the number of times I've been happy.",
  "Seven is the number of times I've been sad.",
  "Eight is the number of times I've been angry.",
  "Nine is the number of times I've been calm.",
];
async function getPhrase(num) {
  // generate a funny phrase for each number from 0 to 9
  console.log("Fetching phrase for", num);
  await new Promise((r) => setTimeout(r, 200));
  if (Math.random() < 0.5) {
    console.log(`getPhrase throwing`);
    throw new Error(`Random async error`);
  }
  return phrases[num];
}

async function getHello() {
  console.log("Fetching helloo...");
  await new Promise((r) => setTimeout(r, 500));
  if (Math.random() < 0.5) {
    console.log(`getHello throwing`);
    throw new Error(`Random async error`);
  }
  return "Hello world!";
}

render(
  () => (
    <ErrorBoundary
      fallback={(err, reset) => {
        console.log(reset);
        return (
          <>
            <p>
              Something went wrong! <button onClick={reset}>Try Again</button>
            </p>
            <p>Error message: {err.message}</p>
          </>
        );
      }}
    >
      <main>
        <PhraseCounter />
      </main>
    </ErrorBoundary>
  ),
  document.getElementById("root")
);
