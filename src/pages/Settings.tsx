import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon, UserCircle, Plug, Activity, Bell, Paintbrush } from "lucide-react";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { ProfileTab } from "@/components/settings/ProfileTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";
import { SyncTab } from "@/components/settings/SyncTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { BrandingTab } from "@/components/settings/BrandingTab";

const TABS = [
  { value: "general", label: "General", icon: SettingsIcon },
  { value: "branding", label: "Branding", icon: Paintbrush },
  { value: "profile", label: "Profile", icon: UserCircle },
  { value: "integrations", label: "Integrations", icon: Plug },
  { value: "sync", label: "Sync", icon: Activity },
  { value: "notifications", label: "Notifications", icon: Bell },
] as const;

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "general";

  const handleTabChange = (value: string) => {
    if (value === "general") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: value }, { replace: true });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="animate-slide-up-fade">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your workspace configuration</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-1.5 data-[state=active]:bg-background">
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general"><GeneralTab /></TabsContent>
        <TabsContent value="branding"><BrandingTab /></TabsContent>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="integrations"><IntegrationsTab /></TabsContent>
        <TabsContent value="sync"><SyncTab /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
