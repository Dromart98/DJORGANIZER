import { demoTracks } from "@/data/demo-tracks";
import { TrackTable } from "@/components/library/track-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";

export const metadata = { title: "Biblioteca" };
export default async function LibraryPage() {
  await requireUser();
  return <><PageHeader eyebrow="Colección" title="Biblioteca" description={`${demoTracks.length} pistas locales para explorar la interfaz.`}/><div className="library-toolbar"><div><span className="status-dot"/> Datos de demostración</div><p>Selecciona una columna para ordenar</p></div><TrackTable tracks={demoTracks}/></>;
}
