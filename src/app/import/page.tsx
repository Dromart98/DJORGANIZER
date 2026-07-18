import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Importar" };
export default function ImportPage() { return <><PageHeader eyebrow="Colección" title="Importar música" description="Este espacio albergará el flujo de incorporación de pistas en una próxima fase."/><EmptyState icon={<Icon name="import"/>} title="Importación aún no disponible" description="La subida y el análisis de audio no forman parte de esta primera versión técnica."/></>; }
