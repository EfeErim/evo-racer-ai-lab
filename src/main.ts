import { mountApp } from "./app";
import "./styles.css";

const app = document.querySelector<HTMLElement>("#app");

if (app === null) {
  throw new Error("Application root is missing.");
}

mountApp(app);
