"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { getMessages, type Locale } from "@/lib/i18n/i18n";

export function DashboardSummaryRecovery({
  clearE2EInjection = false,
  locale,
}: {
  clearE2EInjection?: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const copy = getMessages(locale).dashboard.summaryError;

  return (
    <div className="form-message form-message--error" role="alert">
      <span>{copy.description}</span>{" "}
      <button
        className="button button--secondary button--small"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            if (clearE2EInjection) {
              router.replace("/");
            } else {
              router.refresh();
            }
          })
        }
        type="button"
      >
        {isPending ? copy.retrying : copy.retry}
      </button>
    </div>
  );
}
