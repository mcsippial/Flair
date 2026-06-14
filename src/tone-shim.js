// Tone.js is loaded as a UMD global via <script> in index.html.
// Using a Proxy means NO Tone.js properties are accessed at module
// evaluation time — only when code inside functions/effects actually
// uses them. This prevents Tone.js from creating its AudioContext
// (and AudioWorklet) before all modules have finished initializing.
const ToneProxy = new Proxy(
  {},
  { get: (_, prop) => window.Tone[prop] }
);

export default ToneProxy;
