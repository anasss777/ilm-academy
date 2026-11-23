import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "yqrccomjgkfmbihrdbfo.supabase.co",
        port: "",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
