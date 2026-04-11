import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://unravelaidk.github.io",
  base: "/khadim",
  integrations: [
    starlight({
      title: "Khadim Plugin SDK",
      description:
        "Documentation for building Khadim plugins with the Plugin SDK and AssemblyScript examples.",
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
