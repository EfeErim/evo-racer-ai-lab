import {
  LOCAL_SERVICE_ORIGIN,
  PRODUCT_FLOW,
  PRODUCT_NAME,
  isLoopbackOrigin,
} from "./foundation";
import "./styles.css";

const app = document.querySelector<HTMLElement>("#app");

if (app === null) {
  throw new Error("Application root is missing.");
}

if (!isLoopbackOrigin(LOCAL_SERVICE_ORIGIN)) {
  throw new Error("The local service must use a loopback origin.");
}

const flow = PRODUCT_FLOW.map(
  (step, index) => `
    <li class="flow-step">
      <span class="step-number">${String(index + 1).padStart(2, "0")}</span>
      <span>${step}</span>
    </li>
  `,
).join("");

app.innerHTML = `
  <section class="shell" aria-labelledby="page-title">
    <header class="hero">
      <p class="eyebrow">Offline neuroevolution laboratory</p>
      <h1 id="page-title">${PRODUCT_NAME}</h1>
      <p class="lead">
        Build a track, configure an experiment, and observe AI drivers learn.
        Training begins only after you review valid settings and press Start.
      </p>
    </header>

    <section class="foundation-card" aria-labelledby="foundation-title">
      <div>
        <p class="status"><span aria-hidden="true"></span> Foundation ready</p>
        <h2 id="foundation-title">Phase 0 local shell</h2>
        <p>
          The browser UI and authoritative Python core are separated by a
          loopback-only boundary. No remote runtime services are used.
        </p>
      </div>
      <button type="button" disabled aria-describedby="start-help">
        Start training
      </button>
      <p id="start-help" class="help">
        Start unlocks in a later phase after the track and settings are valid.
      </p>
    </section>

    <section aria-labelledby="flow-title">
      <h2 id="flow-title">Planned experiment flow</h2>
      <ol class="flow">${flow}</ol>
    </section>
  </section>
`;
