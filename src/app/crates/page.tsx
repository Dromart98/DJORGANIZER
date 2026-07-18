import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Crates" };
export default function CratesPage() { return <><PageHeader eyebrow="Organización" title="Crates" description="Agrupa tu música según cada sesión, sala o momento."/><EmptyState icon={<Icon name="crates"/>} title="Todavía no hay crates" description="La gestión persistente de crates se añadirá cuando se incorpore la base de datos."/></>; }
