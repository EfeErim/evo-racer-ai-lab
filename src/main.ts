import { LOCAL_SERVICE_ORIGIN, isLoopbackOrigin } from "./foundation";
import { mountApp } from "./app";
import "./styles.css";

const app = document.querySelector<HTMLElement>("#app");

if (app === null) {
  throw new Error("Application root is missing.");
}

if (!isLoopbackOrigin(LOCAL_SERVICE_ORIGIN)) {
  throw new Error("The local service must use a loopback origin.");
}

mountApp(app);
