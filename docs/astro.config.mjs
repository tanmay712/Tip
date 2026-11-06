import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Crypto",
      description: "Modern Discord crypto tipping bot documentation",
      social: {
        github: "https://github.com/tanmay712/Tip",
      },
      sidebar: [
        { label: "Home", link: "/" },
        { label: "Getting Started", link: "/getting-started" },
        { label: "Commands", link: "/commands" },
        { label: "Supported Chains", link: "/chains" },
        { label: "Deployment", link: "/deployment" },
        { label: "API Reference", link: "/api-reference" },
        { label: "Security", link: "/security" },
      ],
      customCss: [],
    }),
  ],
});
