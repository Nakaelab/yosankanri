import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    webpack: (config) => {
        // tesseract.js WASM support
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            path: false,
            crypto: false,
        };
        return config;
    },
};

export default nextConfig;
