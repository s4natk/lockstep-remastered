import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lockstep",
    short_name: "Lockstep",
    description: "An evidence-grounded debugging workspace",
    start_url: "/",
    display: "standalone",
    background_color: "#171718",
    theme_color: "#171718",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
