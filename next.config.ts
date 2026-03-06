import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    turbopack: {},
    webpack: (config, { isServer }) => {
        // tesseract.js WASM support
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            path: false,
            crypto: false,
        };
        // pdf-parse requires test pdf files at bundle time - exclude from client bundle
        if (!isServer) {
            config.externals = [...(config.externals || []), "pdf-parse"];
        }
        return config;
    },
};

export default nextConfig;
