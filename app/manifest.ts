import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QCRC Team Management",
    short_name: "QCRC Team",
    description: "Rowing club reservations, sign-out, and damage tracking.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f0eb",
    theme_color: "#ff5a1f",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
