"use client";

import { motion } from "framer-motion";

/** Soft drifting colour blobs behind the whole app. Purely decorative. */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="bg-grid absolute inset-0 opacity-60" />
      <motion.div
        className="absolute -left-24 -top-24 size-[22rem] rounded-full bg-primary/20 blur-3xl sm:size-[32rem]"
        animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-24 top-1/3 size-[18rem] rounded-full bg-violet-500/15 blur-3xl sm:size-[26rem]"
        animate={{ x: [0, -40, 0], y: [0, -40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
