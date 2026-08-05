import { Suspense } from "react";

import { Shell } from "../ui/Shell";

// The whole app is a single client-rendered page (M8 lock 2): the panel
// name lives in `?view=`, the timeline never leaves the screen. Nothing
// here is server-fetched — the data layer (TanStack Query) owns that.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Shell />
    </Suspense>
  );
}
