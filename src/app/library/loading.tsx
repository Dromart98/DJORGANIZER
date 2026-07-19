import { translate } from "@/lib/i18n/functional";
import { getCurrentLocale } from "@/lib/i18n/server";

export default async function LibraryLoading() {
  const locale = await getCurrentLocale();
  return (
    <div
      aria-busy="true"
      aria-label={translate(locale, "Cargando biblioteca")}
      className="library-loading"
    >
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--filters" />
      <div className="skeleton skeleton--table" />
    </div>
  );
}
