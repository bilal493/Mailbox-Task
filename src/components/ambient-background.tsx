"use client";

import { motion } from "framer-motion";

/** Large flat shapes drifting slowly behind the app. Solid colours only. Purely decorative. */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute -left-20 -top-28 size-[20rem] rounded-full bg-primary/20 sm:size-[28rem]"
        animate={{ x: [0, 40, 0], y: [0, 28, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-16 top-1/3 size-[14rem] rounded-[2.5rem] bg-concrete/20 sm:size-[20rem]"
        animate={{ x: [0, -30, 0], y: [0, -36, 0], rotate: [12, 22, 12] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-10 left-1/4 size-24 rounded-full bg-warning/15 sm:size-36"
        animate={{ y: [0, -24, 0], x: [0, 20, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
