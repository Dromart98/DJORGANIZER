import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getMessages, type Locale } from "@/lib/i18n/i18n";
import {
  getOnboardingProgress,
  type OnboardingCounts,
} from "@/lib/onboarding/progress";

const STEP_HREFS = {
  crate: "/crates#create-crate",
  import: "/import",
  review: "/library",
} as const;

export function GettingStartedGuide({
  counts,
  locale,
}: {
  counts: OnboardingCounts;
  locale: Locale;
}) {
  const copy = getMessages(locale).onboarding;
  const progress = getOnboardingProgress(counts);
  const nextPendingIndex = progress.steps.findIndex(
    (step) => !step.completed,
  );

  return (
    <Card className="getting-started">
      <div className="getting-started__header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <div className="getting-started__progress">
          <span>
            {copy.progress(progress.completedCount, progress.steps.length)}
          </span>
          <progress
            aria-label={copy.progressLabel}
            max={progress.steps.length}
            value={progress.completedCount}
          />
        </div>
      </div>

      <ol aria-label={copy.stepsLabel} className="getting-started__steps">
        {progress.steps.map((step, index) => {
          const stepCopy = copy.steps[step.id];
          const status = step.completed ? copy.completed : copy.pending;
          return (
            <li
              aria-label={`${stepCopy.title}: ${status}`}
              data-completed={step.completed}
              key={step.id}
            >
              <span aria-hidden="true" className="getting-started__marker">
                {step.completed ? "✓" : index + 1}
              </span>
              <div>
                <span className="getting-started__status">{status}</span>
                <h3>{stepCopy.title}</h3>
                <p>{stepCopy.description}</p>
              </div>
              <Link
                aria-label={stepCopy.accessibleAction}
                className={
                  index === nextPendingIndex
                    ? "button button--primary"
                    : "button button--secondary"
                }
                href={STEP_HREFS[step.id]}
              >
                {stepCopy.action}
              </Link>
            </li>
          );
        })}
      </ol>

      <details className="getting-started__privacy">
        <summary>{copy.privacySummary}</summary>
        <p>{copy.privacyDescription}</p>
      </details>
    </Card>
  );
}
