import { AccountOverview } from "@/components/account-overview";
import { EditorialFooter } from "@/components/editorial-footer";
import { StreamingHeader } from "@/components/streaming-header";

export const metadata = { title: "Account | SineSarili" };

export default function AccountPage() {
  return (
    <main className="stream-home ed-page account-shell">
      <StreamingHeader active="account" />
      <AccountOverview />
      <EditorialFooter />
    </main>
  );
}
