import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";

export default function NotFound() { return <EmptyState icon={<Icon name="music"/>} title="Página no encontrada" description="La dirección solicitada no existe en DJOrganizer." action={<Link href="/" className="button button--primary">Volver al inicio</Link>}/>; }

