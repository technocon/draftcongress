import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Next.js otherwise walks up looking for a lockfile and finds an
  // unrelated one in a parent directory (a different project entirely) —
  // pin the workspace root explicitly to silence that misdetection.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Hostinger's Node.js hosting (hPanel's app manager) runs `node` directly
  // against a startup file — standalone output produces a minimal
  // server.js + pruned node_modules so that's a plain `node server.js`
  // rather than needing `next start` plus a full dependency install on the
  // host. See the architecture plan §8 and scripts/deploy.sh.
  output: "standalone",
};

export default nextConfig;
