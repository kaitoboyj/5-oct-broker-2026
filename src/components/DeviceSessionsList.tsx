import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Monitor, Smartphone, Tablet, MapPin, Clock, CheckCircle, XCircle } from "lucide-react";
import { listWalletDevicesFn, type WalletDeviceRow } from "@/lib/devices.functions";
import { cn } from "@/lib/utils";

interface DeviceSessionsListProps {
  walletAddress: string;
}

function getDeviceIcon(deviceName: string | null, os: string | null) {
  const name = (deviceName || "").toLowerCase();
  const osName = (os || "").toLowerCase();
  
  if (name.includes("phone") || name.includes("mobile") || osName.includes("android") || osName.includes("ios")) {
    return Smartphone;
  }
  if (name.includes("tablet") || name.includes("ipad")) {
    return Tablet;
  }
  return Monitor;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Unknown";
  try {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Invalid date";
  }
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Unknown";
  try {
    const date = new Date(dateString);
    const now = Date.now();
    const diff = now - date.getTime();
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  } catch {
    return "Unknown";
  }
}

function DeviceCard({ device }: { device: WalletDeviceRow }) {
  const Icon = getDeviceIcon(device.device_name, device.os);
  const isActive = device.status === "active";
  
  return (
    <div className={cn(
      "glass rounded-xl p-4 transition-all hover:bg-white/[.04]",
      isActive ? "border border-success/20" : "border border-white/5 opacity-80"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            isActive ? "bg-success/20 text-success" : "bg-white/5 text-muted-foreground"
          )}>
            <Icon className="h-5 w-5" />
          </div>
          
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold truncate">
                {device.device_name || "Unknown Device"}
              </h4>
              {isActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-medium text-success">
                  <CheckCircle className="h-3 w-3" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <XCircle className="h-3 w-3" />
                  Logged out
                </span>
              )}
            </div>
            
            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {device.os && device.browser && (
                <p className="truncate">
                  {device.os} • {device.browser}
                  {device.browser_version && ` ${device.browser_version}`}
                </p>
              )}
              
              {device.username && (
                <p className="truncate">
                  <span className="text-foreground/70">User:</span> {device.username}
                </p>
              )}
              
              {(device.city || device.region || device.country) && (
                <p className="flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {[device.city, device.region, device.country].filter(Boolean).join(", ")}
                </p>
              )}
              
              {device.ip_address && (
                <p className="font-mono text-[10px]">
                  IP: {device.ip_address}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <p className="text-muted-foreground uppercase tracking-widest mb-0.5">First seen</p>
          <p className="text-foreground/80 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(device.first_seen_at)}
          </p>
          <p className="text-muted-foreground/70 mt-0.5">{formatDate(device.first_seen_at)}</p>
        </div>
        
        <div>
          <p className="text-muted-foreground uppercase tracking-widest mb-0.5">
            {isActive ? "Last seen" : "Logged out"}
          </p>
          <p className="text-foreground/80 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(isActive ? device.last_seen_at : device.logged_out_at)}
          </p>
          <p className="text-muted-foreground/70 mt-0.5">
            {formatDate(isActive ? device.last_seen_at : device.logged_out_at)}
          </p>
        </div>
      </div>
      
      {device.screen && (
        <p className="mt-2 text-[10px] text-muted-foreground/60">
          Screen: {device.screen}
        </p>
      )}
      
      <p className="mt-2 font-mono text-[10px] text-muted-foreground/60 truncate" title={device.device_id}>
        ID: {device.device_id}
      </p>
    </div>
  );
}

export function DeviceSessionsList({ walletAddress }: DeviceSessionsListProps) {
  const listDevices = useServerFn(listWalletDevicesFn);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["wallet-devices", walletAddress],
    queryFn: async () => {
      try {
        return await listDevices({ data: { wallet_address: walletAddress } });
      } catch (err) {
        // If locked (not admin), return empty list instead of error
        if (err instanceof Error && err.message === "locked") {
          return { devices: [] };
        }
        throw err;
      }
    },
    enabled: !!walletAddress,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold mb-4">Login Devices</h3>
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Loading device sessions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold mb-4">Login Devices</h3>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load device sessions. {error instanceof Error ? error.message : "Unknown error"}
        </div>
      </div>
    );
  }

  const devices = data?.devices || [];
  const activeDevices = devices.filter(d => d.status === "active");
  const loggedOutDevices = devices.filter(d => d.status === "logged_out");

  if (devices.length === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold mb-4">Login Devices</h3>
        <div className="rounded-lg glass p-8 text-center">
          <Monitor className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            No device sessions recorded for this wallet yet.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Device information is tracked when you sign in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold">Login Devices</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            {activeDevices.length} active • {loggedOutDevices.length} logged out
          </span>
        </div>
      </div>
      
      <p className="mb-4 text-xs text-muted-foreground">
        All devices that have logged into this wallet. Active sessions are highlighted.
      </p>

      <div className="space-y-3">
        {/* Show active devices first */}
        {activeDevices.map((device) => (
          <DeviceCard key={device.id} device={device} />
        ))}
        
        {/* Then show logged out devices */}
        {loggedOutDevices.length > 0 && (
          <>
            {activeDevices.length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground/70 uppercase tracking-widest mb-3">
                  Previously logged out
                </p>
              </div>
            )}
            {loggedOutDevices.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
