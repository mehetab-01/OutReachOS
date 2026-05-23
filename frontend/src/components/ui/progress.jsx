import * as React from "react";
import { cn } from "../../lib/utils";

const Progress = React.forwardRef(({ className, value, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative h-2 w-full overflow-hidden rounded-full bg-gray-100", className)}
    {...props}
  >
    <div
      className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
      style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }}
    />
  </div>
));
Progress.displayName = "Progress";

export { Progress };
