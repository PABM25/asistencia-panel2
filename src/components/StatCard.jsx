import { cn } from "@/lib/utils";

export default function StatCard({ label, value, icon: Icon, tone = "default", hint }) {
  const tones = {
    default: "bg-card text-foreground",
    green: "bg-card text-foreground",
    amber: "bg-peach text-sienna",
    red: "bg-foreground text-background",
    blue: "bg-card text-foreground",
  };

  return (
    <div className="rounded-3xl bg-muted p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-3 font-heading text-[44px] font-normal leading-none tracking-[-0.015em]">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-full", tones[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}