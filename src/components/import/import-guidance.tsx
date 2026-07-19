import { Card } from "@/components/ui/card";
import { getMessages, type Locale } from "@/lib/i18n/i18n";

export function ImportGuidance({ locale }: { locale: Locale }) {
  const copy = getMessages(locale).importGuidance;

  return (
    <Card className="import-guidance">
      <div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
      </div>
      <div className="import-guidance__methods">
        <div>
          <strong>{copy.browserTitle}</strong>
          <p>{copy.browserDescription}</p>
        </div>
        <div>
          <strong>{copy.desktopTitle}</strong>
          <p>{copy.desktopDescription}</p>
        </div>
      </div>
      <details>
        <summary>{copy.detailsSummary}</summary>
        <ol>
          {copy.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <ul>
          {copy.privacy.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
