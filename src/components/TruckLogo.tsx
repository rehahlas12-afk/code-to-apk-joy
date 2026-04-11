const TruckLogo = () => (
  <div className="flex items-center justify-center gap-3 py-4 bg-foreground">
    <svg viewBox="0 0 120 50" className="w-16 h-8" fill="none">
      <rect x="0" y="12" width="55" height="30" rx="3" fill="hsl(var(--primary))" />
      <rect x="55" y="20" width="35" height="22" rx="2" fill="hsl(var(--primary))" />
      <rect x="60" y="23" width="12" height="10" rx="1" fill="hsl(var(--primary-foreground))" opacity="0.8" />
      <circle cx="18" cy="44" r="6" fill="hsl(var(--muted))" />
      <circle cx="18" cy="44" r="3" fill="hsl(var(--foreground))" />
      <circle cx="42" cy="44" r="6" fill="hsl(var(--muted))" />
      <circle cx="42" cy="44" r="3" fill="hsl(var(--foreground))" />
      <circle cx="78" cy="44" r="6" fill="hsl(var(--muted))" />
      <circle cx="78" cy="44" r="3" fill="hsl(var(--foreground))" />
    </svg>
    <div className="text-primary-foreground font-black text-xl tracking-wider">
      STAF TRANSPORT
    </div>
  </div>
);

export default TruckLogo;
