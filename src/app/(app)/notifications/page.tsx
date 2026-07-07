import { Bell } from "lucide-react";
import { NotificationItem } from "@/components/notifications/notification-item";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { listNotifications } from "@/lib/queries/notification-queries";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const items = await listNotifications(50);
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Notifications"
        description="Invites and activity across your households"
      />
      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="Household invites, payments, and large expenses will show up here."
        />
      ) : (
        <Card className="rounded-2xl border-0 bg-card shadow-card">
          <CardContent className="divide-y divide-border p-2">
            {items.map((item) => (
              <NotificationItem key={item.id} item={item} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
