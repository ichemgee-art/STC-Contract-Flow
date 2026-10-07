"use client";

import { Check } from "lucide-react";
import { useEffect } from "react";

type SuccessCelebrationProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  celebrate?: boolean;
  duration?: number;
  onComplete?: () => void;
};

const CONFETTI = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  x: 5 + ((index * 31) % 90),
  delay: (index % 10) * 0.07,
  drift: ((index % 7) - 3) * 10,
  rotate: (index * 47) % 180,
  size: 6 + (index % 4),
}));

const BALLOONS = [
  { id: 1, x: 12, delay: 0.02, scale: 0.95 },
  { id: 2, x: 28, delay: 0.14, scale: 0.78 },
  { id: 3, x: 49, delay: 0.06, scale: 1.05 },
  { id: 4, x: 69, delay: 0.18, scale: 0.86 },
  { id: 5, x: 86, delay: 0.1, scale: 0.92 },
];

export function SuccessCelebration({
  open,
  title,
  subtitle,
  celebrate = false,
  duration,
  onComplete,
}: SuccessCelebrationProps) {
  useEffect(() => {
    if (!open) return;

    const timeout = window.setTimeout(
      () => onComplete?.(),
      duration ?? (celebrate ? 2500 : 1650),
    );

    return () => window.clearTimeout(timeout);
  }, [celebrate, duration, onComplete, open]);

  if (!open) return null;

  return (
    <div
      className={celebrate ? "success-celebration-overlay complete" : "success-celebration-overlay"}
      role="status"
      aria-live="polite"
      data-testid={celebrate ? "contract-complete-celebration" : "contract-created-celebration"}
    >
      {celebrate ? (
        <>
          <div className="success-confetti" aria-hidden="true">
            {CONFETTI.map((piece) => (
              <span
                key={piece.id}
                style={{
                  left: piece.x + "%",
                  animationDelay: piece.delay + "s",
                  width: piece.size + "px",
                  height: Math.max(5, piece.size - 2) + "px",
                  ["--confetti-drift" as string]: piece.drift + "px",
                  ["--confetti-rotate" as string]: piece.rotate + "deg",
                }}
              />
            ))}
          </div>

          <div className="success-balloons" aria-hidden="true">
            {BALLOONS.map((balloon) => (
              <span
                key={balloon.id}
                className={"success-balloon balloon-" + balloon.id}
                style={{
                  left: balloon.x + "%",
                  animationDelay: balloon.delay + "s",
                  ["--balloon-scale" as string]: balloon.scale,
                }}
              >
                <i />
              </span>
            ))}
          </div>
        </>
      ) : null}

      <div className="success-celebration-card">
        <div className="success-celebration-ring" aria-hidden="true">
          <div className="success-celebration-check">
            <Check size={54} strokeWidth={3.2} />
          </div>
        </div>

        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}
