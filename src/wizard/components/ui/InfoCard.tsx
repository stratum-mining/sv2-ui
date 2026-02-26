// Info card component for wizard steps
import { Card, CardContent } from "@/components/ui/card";

export const InfoCard = ({ number, title, icon: _Icon, children }: { number: number, title: string, icon: any, children: React.ReactNode }) => (
  <Card className="bg-card border-border hover:border-primary/30 transition-colors h-full">
    <CardContent className="p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-semibold font-mono">
          {number}
        </span>
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </CardContent>
  </Card>
);
