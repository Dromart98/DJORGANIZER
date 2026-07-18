import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";

export const metadata = { title: "Crates" };
export default async function CratesPage() {
  await requireUser();
  return <><PageHeader eyebrow="Organización" title="Crates" description="Agrupa tu música según cada sesión, sala o momento."/><EmptyState icon={<Icon name="crates"/>} title="Todavía no hay crates" description="El esquema seguro ya está preparado; la gestión de crates llegará en una fase posterior."/></>;
}
