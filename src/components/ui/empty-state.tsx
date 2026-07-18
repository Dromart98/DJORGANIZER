import type { ReactNode } from "react";
import { Card } from "./card";

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <Card className="empty-state"><div className="empty-state__icon">{icon}</div><h2>{title}</h2><p>{description}</p>{action}</Card>;
}
