import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lockstep",
    short_name: "Lockstep",
    description: "An evidence-grounded debugging workspace",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#121b2e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
