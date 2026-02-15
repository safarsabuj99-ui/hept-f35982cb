import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, ChevronRight } from "lucide-react";

interface ClientRow {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  custom_exchange_rate: number | null;
  pricing_config: any;
}

export default function ClientList() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      // Get client user_ids
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "client");

      if (!roles?.length) { setLoading(false); return; }

      const ids = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, business_name, custom_exchange_rate, pricing_config")
        .in("user_id", ids);

      setClients(profiles || []);
      setLoading(false);
    }
    load();
  }, []);

  const getPricingLabel = (config: any) => {
    if (!config) return "Default";
    if (config.mode === "flat") return "Flat Rate";
    if (config.mode === "percentage") return `+${config.percentage ?? 0}%`;
    return "Default";
  };

  const filtered = clients.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.business_name || "").toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Client List</h1>
          <p className="text-sm text-muted-foreground">Manage client configurations, pricing, and history</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Users className="h-3 w-3" /> {clients.length} clients
        </Badge>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, business, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">All Clients</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search ? "No clients match your search." : "No clients found."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Business</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead>Pricing</TableHead>
                    <TableHead className="hidden lg:table-cell">Exchange Rate</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.user_id} className="group cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <Link to={`/admin/clients/${c.user_id}`} className="hover:underline">
                          {c.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {c.business_name || "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {c.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getPricingLabel(c.pricing_config)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell font-mono text-sm">
                        {c.custom_exchange_rate ? `৳${c.custom_exchange_rate}` : "Global"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          to={`/admin/clients/${c.user_id}`}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          View <ChevronRight className="h-3 w-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
