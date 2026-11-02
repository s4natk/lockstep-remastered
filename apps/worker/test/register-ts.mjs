import { register } from "node:module";

register(new URL("./resolve-ts.mjs", import.meta.url).href, {
  parentURL: import.meta.url,
});
