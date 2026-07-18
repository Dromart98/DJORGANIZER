import Link from "next/link";
import { demoTracks } from "@/data/demo-tracks";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/layout/icon";

export default function DashboardPage() {
  const genres = new Set(demoTracks.map((track) => track.genre)).size;
  return <><PageHeader eyebrow="Resumen" title="Tu música, lista para mezclar" description="Una vista clara de tu colección local de demostración."/><div className="stats"><Card><span>Pistas</span><strong>{demoTracks.length}</strong><small>Biblioteca demo</small></Card><Card><span>Géneros</span><strong>{genres}</strong><small>Clasificación local</small></Card><Card><span>BPM medio</span><strong>{Math.round(demoTracks.reduce((sum, track) => sum + track.bpm, 0) / demoTracks.length)}</strong><small>En la selección</small></Card></div><Card className="welcome"><div className="welcome-icon"><Icon name="music"/></div><div><p className="eyebrow">Empieza aquí</p><h2>Explora la biblioteca de demostración</h2><p>Consulta metadatos musicales y prueba la ordenación visual de la tabla.</p></div><Link href="/library" className="button button--primary">Abrir biblioteca →</Link></Card></>;
}

