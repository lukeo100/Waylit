import type { ReactNode } from "react";
import { RotateOverlay } from "@/components/RotateOverlay";

/**
 * Layout for the riding screen. It adds nothing but the rotate prompt: no header, no
 * sidebar, no navigation, so the installed app shows only the ride.
 */
export default function RideLayout({ children }: { readonly children: ReactNode }) {
  return (
    <>
      {children}
      <RotateOverlay />
    </>
  );
}
