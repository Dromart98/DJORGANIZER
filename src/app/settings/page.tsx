import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Ajustes" };
export default function SettingsPage() { return <><PageHeader eyebrow="Workspace" title="Ajustes" description="Información sobre el estado actual de DJOrganizer."/><Card className="settings-card"><div><h2>Modo de datos</h2><p>La aplicación utiliza exclusivamente una colección local de demostración.</p></div><span className="badge">Local</span></Card><Card className="settings-card"><div><h2>Integraciones</h2><p>No hay servicios externos configurados en esta fase.</p></div><span className="badge muted-badge">Sin conectar</span></Card></>; }
