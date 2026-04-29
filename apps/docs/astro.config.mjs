import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://unravelaidk.github.io",
  base: "/khadim",
  integrations: [
    starlight({
      title: "Khadim Docs",
      description:
        "Documentation for the Khadim CLI coding agent, programmatic API, and Plugin SDK.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/unravelaidk/khadim",
        },
      ],
      sidebar: [
        {
          label: "Start Here",
          items: [
            { label: "Plugin SDK Overview", slug: "index" },
            { label: "Getting Started", slug: "getting-started" },
          ],
        },
        {
          label: "CLI",
          items: [
            { label: "CLI Overview", slug: "cli/overview" },
            { label: "Programmatic API", slug: "cli/programmatic-api" },
          ],
        },
        {
          label: "Guides",
          items: [{ label: "Examples", slug: "guides/examples" }],
        },
        {
          label: "Reference",
          items: [
            {
              label: "AssemblyScript SDK",
              slug: "reference/assemblyscript-sdk",
            },
            {
              label: "Host Capabilities",
              slug: "reference/host-capabilities",
            },
            { label: "Manifest Reference", slug: "reference/manifest" },
          ],
        },
      ],
    }),
  ],
});
